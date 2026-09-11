// TVA (collectée / déductible / nette) — logique partagée entre le
// Compte de résultat (src/pages/Resultat.jsx, avec sélecteur de période
// et détail ligne par ligne) et l'onglet Trésorerie (src/pages/Tresorerie.jsx,
// simple mémo sous le solde bancaire pour le mois en cours). Extrait ici
// pour que les deux pages appliquent exactement les mêmes règles — les
// corriger une fois les corrige partout, au lieu de risquer que l'une
// dérive de l'autre.
//
// Volontairement indicatif, pas une déclaration officielle — la
// déclaration réelle se fait dans Pennylane / avec le comptable. Voir le
// détail des règles (autoliquidation, catégories hors TVA...) dans
// calculerTva ci-dessous.

// Taux de TVA supposé pour une dépense générale, selon sa catégorie (voir
// CATEGORIES dans lib/depenses.js). Par défaut 20 %, sauf pour les
// catégories dont la TVA ne s'applique normalement pas du tout :
//   - Assurance : opérations d'assurance exonérées de TVA (art. 261-C du
//     CGI) — confirmé sur les attestations AXA de Partenaires Particuliers,
//     qui portent explicitement cette mention. L'écart HT/TTC observé sur
//     les cotisations est une taxe spécifique (TSCA), pas de la TVA
//     déductible.
//   - Impôts & taxes : par nature hors du champ de la TVA (CFE, IS...).
//   - Banque & frais financiers : la plupart des prestations bancaires
//     courantes sont exonérées de TVA (art. 261 C 1° du CGI).
// Reste approximatif pour les autres catégories (ex. Loyer & charges, qui
// peut être exonéré ou soumis selon que le bailleur a opté pour la TVA) —
// à corriger au cas par cas si besoin.
export function tauxTvaDepense(categorie) {
  if (categorie === 'Assurance' || categorie === 'Impôts & taxes' || categorie === 'Banque & frais financiers') return 0
  return 20
}

// Calcul pur à partir de lignes déjà chargées — voir fetchTva ci-dessous
// pour le select Supabase exact (les jointures nécessaires : projets sur
// factures_cli, commandes/fournisseurs sur factures_frs).
export function calculerTva({ fcli, ffrs, depData }) {
  // TVA collectée : une facture client compte pour montant_ht × le taux
  // de TVA de SON projet (par défaut 20 %, voir sql/tva_taux_migration.sql).
  const tvaCollectee = (fcli || []).reduce((s, f) => {
    const taux = Number(f.projets?.taux_tva ?? 20)
    return s + (f.montant_ht || 0) * (taux / 100)
  }, 0)
  // TVA déductible sur achats projets : taux fixe de 20 % (les commandes
  // fournisseurs ne sont pas concernées par taux_tva, voir
  // sql/tva_taux_migration.sql), sauf régime autoliquidation — le
  // fournisseur ne facture pas de TVA, Partenaires Particuliers
  // l'autoliquide (la déclare ET la déduit en même temps) : effet net
  // nul, donc on l'exclut plutôt que de fausser les deux totaux. Régime
  // lu sur la commande liée quand il y en a une, sinon sur le réglage
  // par défaut du fournisseur (voir sql/fournisseur_autoliquidation_migration.sql).
  let nbAutoliquidation = 0
  let montantAutoliquidation = 0
  const tvaDeductibleAchats = (ffrs || []).reduce((s, f) => {
    const autoliquidation = f.commandes?.regime_tva
      ? f.commandes.regime_tva === 'autoliquidation'
      : !!f.fournisseurs?.autoliquidation
    if (autoliquidation) {
      nbAutoliquidation += 1
      montantAutoliquidation += (f.montant_ht || 0)
      return s
    }
    return s + (f.montant_ht || 0) * 0.20
  }, 0)
  const depArr = depData || []
  const tvaDeductibleDepenses = depArr.reduce((s, d) => s + (d.montant_ht || 0) * (tauxTvaDepense(d.categorie) / 100), 0)
  const tvaDeductible = tvaDeductibleAchats + tvaDeductibleDepenses
  const tvaNette = tvaCollectee - tvaDeductible

  // Détail ligne par ligne, pour pouvoir retrouver d'où vient chaque
  // somme ci-dessus plutôt que de devoir faire confiance à un total —
  // mêmes lignes, mêmes calculs, juste non agrégés. Triés du plus récent
  // au plus ancien.
  const detailCollectee = (fcli || [])
    .map(f => {
      const taux = Number(f.projets?.taux_tva ?? 20)
      return { id: f.id, ref: f.numero || 'Sans numéro', secondaire: f.projets?.nom || '—', date: f.date_facture, montantHt: f.montant_ht || 0, taux, tva: (f.montant_ht || 0) * (taux / 100) }
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const detailDeductible = [
    ...(ffrs || []).map(f => {
      const autoliquidation = f.commandes?.regime_tva
        ? f.commandes.regime_tva === 'autoliquidation'
        : !!f.fournisseurs?.autoliquidation
      const taux = autoliquidation ? 0 : 20
      return {
        id: 'ffrs-' + f.id, ref: f.numero || 'Sans numéro',
        secondaire: (f.fournisseurs?.nom || '—') + (f.commandes?.numero ? ' · cmd ' + f.commandes.numero : ''),
        source: autoliquidation ? 'Autoliquidation (neutre)' : 'Achat projet',
        date: f.date_facture, montantHt: f.montant_ht || 0, taux, tva: (f.montant_ht || 0) * (taux / 100),
      }
    }),
    ...depArr.map(d => ({
      id: 'dep-' + d.id, ref: d.libelle || 'Sans libellé', secondaire: (d.categorie || 'Autre') + (d.fournisseurs?.nom ? ' · ' + d.fournisseurs.nom : ''),
      source: 'Dépense générale', date: d.date_facture, montantHt: d.montant_ht || 0,
      taux: tauxTvaDepense(d.categorie), tva: (d.montant_ht || 0) * (tauxTvaDepense(d.categorie) / 100),
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return {
    tvaCollectee, tvaDeductibleAchats, tvaDeductibleDepenses, tvaDeductible, tvaNette,
    nbAutoliquidation, montantAutoliquidation, detailCollectee, detailDeductible,
  }
}

// Charge les lignes nécessaires (factures clients/fournisseurs, dépenses
// générales, avec les jointures utilisées par calculerTva) sur une
// période [debut, fin] (dates 'AAAA-MM-JJ') et retourne directement le
// résultat de calculerTva. Pour une page qui a déjà ces lignes en
// mémoire pour autre chose (ex. Resultat.jsx, qui les utilise aussi pour
// le CA/achats/dépenses), préférer appeler calculerTva directement
// plutôt que refaire la requête ici.
export async function fetchTva(supabase, { debut, fin }) {
  const [{ data: fcli, error: fcliErr }, { data: ffrs, error: ffrsErr }, { data: dep, error: depErr }] = await Promise.all([
    supabase.from('factures_cli').select('id, numero, montant_ht, date_facture, projets(nom, taux_tva)').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
    supabase.from('factures_frs').select('id, numero, montant_ht, date_facture, commandes(numero, regime_tva), fournisseurs(nom, autoliquidation)').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
    supabase.from('depenses_generales').select('id, libelle, montant_ht, date_facture, categorie, fournisseurs(nom)').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
  ])
  if (fcliErr) throw fcliErr
  if (ffrsErr) throw ffrsErr
  // depenses_generales peut ne pas encore exister (migration non exécutée)
  // — on l'ignore silencieusement plutôt que de faire planter l'appelant.
  const depData = depErr ? [] : (dep || [])
  return calculerTva({ fcli, ffrs, depData })
}
