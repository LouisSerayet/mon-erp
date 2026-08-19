// Calculs métier (marge, coefficient, prix) extraits des pages pour être
// testables indépendamment de React/Supabase — voir calculs.test.js.

// Une ligne de projet peut être pilotée par 3 modes selon quel champ on
// considère "fixe" : Achat×Coeff→Vente, Vente÷Coeff→Achat, Vente÷Achat→Coeff.
// Un 4e mode virtuel 'honoraire' (voir NATURE_LIGNE_OPTIONS) n'a pas
// d'achat du tout : le prix de vente est toujours saisi directement, achat
// et coefficient restent forcés à vide/zéro.
// Étant donné le champ qui vient de changer, dérive le(s) champ(s)
// manquant(s) puis recalcule les totaux (qté × prix).
export function calculerLigne({ modeLocal, champ, valeur, current, ligne }) {
  const resultat = { ...current, [champ]: valeur }

  if (modeLocal === 'honoraire') {
    // Ligne "vente seule" (ex: honoraires) : pas de notion d'achat/coeff —
    // seuls la quantité et le prix de vente déterminent le total.
    resultat.prix_achat_ht = '0'
    resultat.coeff = ''
    const qte = parseFloat(resultat.qte ?? ligne.qte) || 0
    const puV = parseFloat(resultat.prix_unit_ht ?? ligne.prix_unit_ht) || 0
    resultat.total_ht = qte * puV
    resultat.total_achat = 0
    return resultat
  }

  const puA = parseFloat(champ === 'prix_achat_ht' ? valeur : (resultat.prix_achat_ht ?? ligne.prix_achat_ht)) || 0
  const puV = parseFloat(champ === 'prix_unit_ht' ? valeur : (resultat.prix_unit_ht ?? ligne.prix_unit_ht)) || 0
  const co = parseFloat(champ === 'coeff' ? valeur : (resultat.coeff ?? ligne.coeff)) || 0

  if (modeLocal === 'ac') {
    // Achat × Coeff → Vente
    if ((champ === 'prix_achat_ht' || champ === 'coeff') && puA > 0 && co > 0) {
      resultat.prix_unit_ht = (puA * co).toFixed(2)
    }
  } else if (modeLocal === 'vc') {
    // Vente ÷ Coeff → Achat
    if ((champ === 'prix_unit_ht' || champ === 'coeff') && puV > 0 && co > 0) {
      resultat.prix_achat_ht = (puV / co).toFixed(2)
    }
  } else if (modeLocal === 'av') {
    // Vente ÷ Achat → Coeff
    if ((champ === 'prix_achat_ht' || champ === 'prix_unit_ht') && puA > 0 && puV > 0) {
      resultat.coeff = (puV / puA).toFixed(2)
    }
  }

  const finalQte = parseFloat(resultat.qte ?? ligne.qte) || 0
  const finalPuV = parseFloat(resultat.prix_unit_ht ?? ligne.prix_unit_ht) || 0
  const finalPuA = parseFloat(resultat.prix_achat_ht ?? ligne.prix_achat_ht) || 0
  resultat.total_ht = finalQte * finalPuV
  resultat.total_achat = finalQte * finalPuA

  return resultat
}

// ── Nature d'une ligne (négoce / option / variante / texte / honoraire) ──
// Une ligne "classique" (négoce, valeur par défaut) compte normalement dans
// les totaux. Une "Option" est une proposition facultative pour le client :
// elle reste visible (devis PDF, onglet Lignes) mais hors du total principal
// — voir generateDevisPDF (section "Options" séparée, sous-total à part).
// Une "Variante" est une alternative à une autre ligne (ex: carrelage A ou
// B) : seule celle marquée `variante_active` compte dans les totaux et
// apparaît sur le devis envoyé au client, l'autre reste en base pour
// comparaison mais n'a aucun impact chiffré. "Texte" est une note sans
// montant (comme un titre, mais au milieu d'une liste de lignes). "Honoraire"
// est une ligne de vente pure (ex: honoraires, frais de gestion) : elle
// compte normalement dans le total comme une ligne négoce, mais n'a pas
// d'achat associé — voir calculerLigne (mode 'honoraire') qui force achat
// et coefficient à vide/zéro pour ce type de ligne.
//
// L'UI n'expose qu'un seul sélecteur "Nature" à 6 choix (fusionnant
// categorie_ligne + variante_active en une seule valeur composite) pour
// rester simple à l'usage — ces deux fonctions font l'aller-retour entre
// la valeur affichée et les deux colonnes réellement stockées en base.
export const NATURE_LIGNE_OPTIONS = [
  { value: 'negoce', shortLabel: 'Négoce', label: 'Négoce (ligne classique)' },
  { value: 'honoraire', shortLabel: 'Honoraire', label: 'Honoraire (vente seule, sans achat)' },
  { value: 'option', shortLabel: 'Option', label: 'Option (hors total, proposée à part)' },
  { value: 'variante_active', shortLabel: 'Variante retenue', label: 'Variante — retenue (compte)' },
  { value: 'variante_inactive', shortLabel: 'Variante alt.', label: 'Variante — alternative (ne compte pas)' },
  { value: 'texte', shortLabel: 'Texte', label: 'Texte (note, sans montant)' },
]

export function getNatureLigne(categorieLigne, varianteActive) {
  const cat = categorieLigne || 'negoce'
  if (cat === 'variante') return varianteActive === false ? 'variante_inactive' : 'variante_active'
  return cat
}

export function natureLigneVersChamps(nature) {
  if (nature === 'variante_active') return { categorie_ligne: 'variante', variante_active: true }
  if (nature === 'variante_inactive') return { categorie_ligne: 'variante', variante_active: false }
  return { categorie_ligne: nature, variante_active: true }
}

// Une ligne compte dans les totaux (vente/achat, lot, devis, rentabilité)
// sauf si elle est une Option, une Variante non retenue, ou du Texte — une
// ligne Honoraire compte normalement (comme une ligne négoce), seul son
// achat est nul. N'examine pas `type` — l'appelant doit déjà avoir filtré
// les lignes de type 'ligne' (lots, titres... ne passent pas par cette
// fonction).
export function ligneCompteDansTotal(l) {
  const cat = l?.categorie_ligne || 'negoce'
  if (cat === 'option' || cat === 'texte') return false
  if (cat === 'variante' && l?.variante_active === false) return false
  return true
}

// Lit la colonne "Nature" d'un import Excel (voir parseExcel dans
// ProjetDetail.jsx et le gabarit d'import) : reconnaît le texte du libellé
// affiché dans le sélecteur de l'app (insensible à la casse/aux espaces), et
// retombe sur "Négoce" pour toute cellule vide ou non reconnue — un import
// ne doit jamais échouer à cause d'une colonne Nature mal remplie ou absente
// (fichiers construits avant l'ajout de cette colonne).
export function natureLigneDepuisTexte(texte) {
  const normalise = String(texte || '').trim().toLowerCase()
  if (!normalise) return 'negoce'
  const trouve = NATURE_LIGNE_OPTIONS.find(o => o.shortLabel.toLowerCase() === normalise)
  return trouve ? trouve.value : 'negoce'
}

// Marge brute et taux de marge, utilisés sur le Dashboard et l'onglet
// Rentabilité d'un projet. Centralisé ici pour que les deux ne divergent
// jamais silencieusement.
export function calculerMarge(ca, cout) {
  const chiffreAffaires = ca || 0
  const marge = chiffreAffaires - (cout || 0)
  const taux = chiffreAffaires > 0 ? Number(((marge / chiffreAffaires) * 100).toFixed(1)) : 0
  return { marge, taux }
}

// ── Échéance de facture (conditions de paiement client/fournisseur) ────
// Calcule la date d'échéance d'une facture à partir de sa date d'émission
// et des conditions de paiement du tiers (client ou fournisseur) : un délai
// en jours net, éventuellement reporté au dernier jour du mois obtenu
// ("30 jours fin de mois"). Voir ProjetDetail.jsx, qui pré-remplit
// automatiquement date_echeance avec ce calcul dès que date_facture (ou le
// tiers sélectionné) change, tant que le champ n'a pas été déverrouillé
// manuellement.
// `dateFacture` doit être une chaîne 'YYYY-MM-DD' (format natif d'un
// <input type="date">). Renvoie la même chaîne en sortie, ou '' si
// `dateFacture` est vide/invalide — un import ou une saisie incomplète ne
// doit jamais faire planter le calcul.
export function calculerEcheance(dateFacture, delaiJours, finDeMois) {
  if (!dateFacture) return ''
  const d = new Date(dateFacture + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + (parseInt(delaiJours, 10) || 0))
  if (finDeMois) {
    // Le jour 0 d'un mois = le dernier jour du mois précédent, donc
    // "mois suivant, jour 0" = dernier jour du mois courant de `d`.
    d.setMonth(d.getMonth() + 1, 0)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Raccourcis proposés dans les formulaires (Clients/Fournisseurs et les
// formulaires de facture de ProjetDetail.jsx) — couvrent les conditions de
// paiement les plus courantes sans empêcher une saisie libre à côté.
export const PRESETS_DELAI_PAIEMENT = [
  { label: 'Comptant', jours: 0, finMois: false },
  { label: '30 jours', jours: 30, finMois: false },
  { label: '30 jours fin de mois', jours: 30, finMois: true },
  { label: '45 jours', jours: 45, finMois: false },
  { label: '45 jours fin de mois', jours: 45, finMois: true },
  { label: '60 jours', jours: 60, finMois: false },
]
