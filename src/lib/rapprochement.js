// Rapprochement bancaire Qonto <-> factures clients / fournisseurs.
//
// Principe : on compare chaque facture ouverte (statut différent de
// "Payée") aux transactions Qonto du bon sens — crédit (argent qui entre)
// pour une facture client encaissée, débit (argent qui sort) pour une
// facture fournisseur payée. Deux niveaux de confiance :
//
//  - "exact"   : le numéro de facture apparaît dans le libellé ou la
//                référence de la transaction ET le montant correspond
//                (HT ou TTC à 20 %) -> appliqué automatiquement (le statut
//                passe à "Payée").
//  - "montant" : seul le montant correspond, sans numéro de facture trouvé
//                dans le libellé -> proposé comme suggestion, à valider
//                manuellement (trop de factures peuvent partager un même
//                montant pour l'appliquer sans confirmation).
//
// Une fois appliqué, le lien facture <-> transaction est conservé
// (qonto_transaction_id) pour ne jamais réutiliser la même transaction sur
// une autre facture lors d'un rapprochement ultérieur.

const TOLERANCE_CENTIMES = 2 // arrondis de calcul (ex. 314.395 -> 314,40)

function normaliser(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Une facture peut être réglée HT (rare, ex. client basé hors UE) ou TTC (le
// cas normal — TVA à 20 % en sus). On teste les deux hypothèses pour ne pas
// rater un rapprochement à cause d'une hypothèse de TVA incorrecte.
export function montantsCandidats(montantHt) {
  const ht = Math.round((montantHt || 0) * 100)
  const ttc = Math.round((montantHt || 0) * 120)
  return ht === ttc ? [{ base: 'HT', cents: ht }] : [{ base: 'HT', cents: ht }, { base: 'TTC (20 %)', cents: ttc }]
}

function montantCorrespondant(txCents, montantHt) {
  return montantsCandidats(montantHt).find(c => Math.abs(c.cents - Math.abs(txCents)) <= TOLERANCE_CENTIMES) || null
}

function numeroDansTransaction(numero, tx) {
  const n = normaliser(numero)
  if (!n) return false
  const hay = normaliser((tx.label || '') + ' ' + (tx.reference || ''))
  return hay.includes(n)
}

// factures : lignes factures_cli / factures_frs (avec au moins id, numero,
// montant_ht). transactions : transactions Qonto brutes (tous comptes/sens
// confondus — on filtre nous-mêmes). side : 'credit' (factures clients,
// argent entrant) ou 'debit' (factures fournisseurs, argent sortant).
// exclureTransactionIds : Set des transaction_id déjà liés à une facture
// (payée précédemment), à ne jamais reproposer.
export function rapprocherFactures(factures, transactions, side, exclureTransactionIds = new Set()) {
  const pool = (transactions || []).filter(tx =>
    tx.side === side &&
    tx.status !== 'declined' &&
    !exclureTransactionIds.has(tx.transaction_id)
  )
  const utiliseesParExact = new Set()
  const resultats = []

  // Passe 1 : correspondances exactes (numéro de facture trouvé + montant)
  for (const f of factures) {
    const tx = pool.find(t =>
      !utiliseesParExact.has(t.transaction_id) &&
      numeroDansTransaction(f.numero, t) &&
      montantCorrespondant(t.amount_cents, f.montant_ht)
    )
    if (tx) {
      utiliseesParExact.add(tx.transaction_id)
      resultats.push({ facture: f, transaction: tx, confiance: 'exact', base: montantCorrespondant(tx.amount_cents, f.montant_ht)?.base })
    }
  }

  // Passe 2 : suggestions par montant seul, pour les factures pas encore
  // matchées en passe 1 — une même transaction peut apparaître comme
  // suggestion pour plusieurs factures si les montants sont ambigus ; c'est
  // à l'utilisateur de trancher en confirmant l'une d'elles.
  const facturesMatchees = new Set(resultats.map(r => r.facture.id))
  for (const f of factures) {
    if (facturesMatchees.has(f.id)) continue
    for (const t of pool) {
      if (utiliseesParExact.has(t.transaction_id)) continue
      const base = montantCorrespondant(t.amount_cents, f.montant_ht)
      if (base) resultats.push({ facture: f, transaction: t, confiance: 'montant', base: base.base })
    }
  }

  return resultats
}

// Applique un rapprochement (passe le statut à "Payée" et enregistre le
// lien avec la transaction Qonto). table : 'factures_cli' | 'factures_frs'.
// Renvoie { error } — une policy RLS qui bloque silencieusement la mise à
// jour (0 ligne affectée, sans erreur Postgres) est traitée comme une
// erreur explicite pour ne jamais laisser croire qu'une facture est passée
// "Payée" alors que rien n'a été enregistré.
export async function appliquerRapprochement(supabase, table, match) {
  const { data, error } = await supabase.from(table).update({
    statut: 'Payée',
    qonto_transaction_id: match.transaction.transaction_id,
    qonto_matched_at: new Date().toISOString(),
    qonto_match_confiance: match.confiance,
  }).eq('id', match.facture.id).select()
  if (!error && (!data || data.length === 0)) {
    return { error: { message: 'Mise à jour silencieusement bloquée (probablement une policy RLS Supabase) pour la facture ' + match.facture.numero } }
  }
  return { error }
}

// Rapprochement manuel groupé : une même transaction Qonto règle PLUSIEURS
// factures à la fois (virement groupé côté client, ou paiement unique
// couvrant plusieurs factures fournisseur) — un cas que rapprocherFactures()
// ne peut pas détecter tout seul, puisqu'il compare une transaction à une
// seule facture à la fois (montant qui ne correspondra à aucune facture
// individuellement, et le libellé du virement ne contient généralement pas
// chaque numéro de facture réglée). L'utilisateur sélectionne lui-même les
// factures concernées (voir la modale "Associer plusieurs factures" dans
// Rapprochement.jsx) ; on les lie toutes à la même transaction, avec une
// confiance dédiée 'manuel_groupe' pour les distinguer dans l'historique.
// factures : tableau d'objets { id, numero } (les factures sélectionnées).
export async function appliquerRapprochementGroupe(supabase, table, factures, transaction) {
  let appliques = 0
  let echecs = 0
  const erreurs = []
  for (const facture of factures) {
    const { error: err } = await appliquerRapprochement(supabase, table, {
      facture,
      transaction,
      confiance: 'manuel_groupe',
    })
    if (err) { echecs++; erreurs.push(err.message) } else { appliques++ }
  }
  return { appliques, echecs, erreurs }
}
