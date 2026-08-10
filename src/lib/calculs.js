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

// Marge brute et taux de marge, utilisés sur le Dashboard et l'onglet
// Rentabilité d'un projet. Centralisé ici pour que les deux ne divergent
// jamais silencieusement.
export function calculerMarge(ca, cout) {
  const chiffreAffaires = ca || 0
  const marge = chiffreAffaires - (cout || 0)
  const taux = chiffreAffaires > 0 ? Number(((marge / chiffreAffaires) * 100).toFixed(1)) : 0
  return { marge, taux }
}
