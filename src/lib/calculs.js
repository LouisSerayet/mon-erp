// Calculs métier (marge, coefficient, prix) extraits des pages pour être
// testables indépendamment de React/Supabase — voir calculs.test.js.

// Une ligne de projet peut être pilotée par 3 modes selon quel champ on
// considère "fixe" : Achat×Coeff→Vente, Vente÷Coeff→Achat, Vente÷Achat→Coeff.
// Étant donné le champ qui vient de changer, dérive le(s) champ(s)
// manquant(s) puis recalcule les totaux (qté × prix).
export function calculerLigne({ modeLocal, champ, valeur, current, ligne }) {
  const resultat = { ...current, [champ]: valeur }

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

// ── Nature d'une ligne (négoce / option / variante / texte) ────────────
// Une ligne "classique" (négoce, valeur par défaut) compte normalement dans
// les totaux. Une "Option" est une proposition facultative pour le client :
// elle reste visible (devis PDF, onglet Lignes) mais hors du total principal
// — voir generateDevisPDF (section "Options" séparée, sous-total à part).
// Une "Variante" est une alternative à une autre ligne (ex: carrelage A ou
// B) : seule celle marquée `variante_active` compte dans les totaux et
// apparaît sur le devis envoyé au client, l'autre reste en base pour
// comparaison mais n'a aucun impact chiffré. "Texte" est une note sans
// montant (comme un titre, mais au milieu d'une liste de lignes).
//
// L'UI n'expose qu'un seul sélecteur "Nature" à 5 choix (fusionnant
// categorie_ligne + variante_active en une seule valeur composite) pour
// rester simple à l'usage — ces deux fonctions font l'aller-retour entre
// la valeur affichée et les deux colonnes réellement stockées en base.
export const NATURE_LIGNE_OPTIONS = [
  { value: 'negoce', shortLabel: 'Négoce', label: 'Négoce (ligne classique)' },
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
// sauf si elle est une Option, une Variante non retenue, ou du Texte.
// N'examine pas `type` — l'appelant doit déjà avoir filtré les lignes de
// type 'ligne' (lots, titres... ne passent pas par cette fonction).
export function ligneCompteDansTotal(l) {
  const cat = l?.categorie_ligne || 'negoce'
  if (cat === 'option' || cat === 'texte') return false
  if (cat === 'variante' && l?.variante_active === false) return false
  return true
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
