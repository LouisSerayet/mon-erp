import { describe, it, expect } from 'vitest'
import { calculerLigne, calculerMarge, getNatureLigne, natureLigneVersChamps, ligneCompteDansTotal } from './calculs'

describe('calculerLigne', () => {
  const ligneBase = { qte: 2, prix_achat_ht: 100, prix_unit_ht: 130, coeff: 1.3 }

  it('mode ac (Achat x Coeff -> Vente) : change le prix d\'achat, recalcule la vente', () => {
    const r = calculerLigne({ modeLocal: 'ac', champ: 'prix_achat_ht', valeur: '200', current: {}, ligne: ligneBase })
    expect(r.prix_achat_ht).toBe('200')
    expect(r.prix_unit_ht).toBe('260.00') // 200 * 1.3
    expect(r.total_ht).toBe(520)   // qte(2) * 260
    expect(r.total_achat).toBe(400) // qte(2) * 200
  })

  it('mode ac : changer le coefficient recalcule aussi la vente', () => {
    const r = calculerLigne({ modeLocal: 'ac', champ: 'coeff', valeur: '1.5', current: {}, ligne: ligneBase })
    expect(r.prix_unit_ht).toBe('150.00') // 100 * 1.5
  })

  it('mode vc (Vente / Coeff -> Achat) : change le prix de vente, recalcule l\'achat', () => {
    const r = calculerLigne({ modeLocal: 'vc', champ: 'prix_unit_ht', valeur: '260', current: {}, ligne: ligneBase })
    expect(r.prix_unit_ht).toBe('260')
    expect(r.prix_achat_ht).toBe('200.00') // 260 / 1.3
  })

  it('mode av (Vente / Achat -> Coeff) : change le prix d\'achat, recalcule le coefficient', () => {
    const r = calculerLigne({ modeLocal: 'av', champ: 'prix_achat_ht', valeur: '100', current: {}, ligne: ligneBase })
    expect(r.coeff).toBe('1.30') // 130 / 100
  })

  it('ne recalcule rien si achat ou coeff est à zéro (évite une division par zéro)', () => {
    const r = calculerLigne({ modeLocal: 'vc', champ: 'coeff', valeur: '0', current: {}, ligne: { ...ligneBase, prix_unit_ht: 130 } })
    // coeff = 0 -> pas de recalcul de prix_achat_ht, il garde la valeur de la ligne d'origine
    expect(r.prix_achat_ht).toBeUndefined()
  })

  it('recalcule toujours les totaux même quand le champ modifié est la quantité', () => {
    const r = calculerLigne({ modeLocal: 'ac', champ: 'qte', valeur: '5', current: {}, ligne: ligneBase })
    expect(r.total_ht).toBe(650)   // 5 * 130 (prix vente ligne d'origine, inchangé)
    expect(r.total_achat).toBe(500) // 5 * 100
  })

  it('empile les modifications déjà en cours (current non vide)', () => {
    // Un premier changement de qte a déjà été fait, on modifie maintenant le prix d'achat
    const enCours = { qte: '3' }
    const r = calculerLigne({ modeLocal: 'ac', champ: 'prix_achat_ht', valeur: '100', current: enCours, ligne: ligneBase })
    expect(r.qte).toBe('3')
    expect(r.total_ht).toBe(390)   // 3 * 130
    expect(r.total_achat).toBe(300) // 3 * 100
  })
})

describe('calculerMarge', () => {
  it('calcule une marge positive et son taux', () => {
    const { marge, taux } = calculerMarge(1000, 600)
    expect(marge).toBe(400)
    expect(taux).toBe(40)
  })

  it('calcule une marge négative (projet déficitaire)', () => {
    const { marge, taux } = calculerMarge(1000, 1200)
    expect(marge).toBe(-200)
    expect(taux).toBe(-20)
  })

  it('renvoie un taux de 0 quand le CA est nul (évite une division par zéro)', () => {
    const { marge, taux } = calculerMarge(0, 500)
    expect(marge).toBe(-500)
    expect(taux).toBe(0)
  })

  it('gère les valeurs undefined/null comme des zéros', () => {
    const { marge, taux } = calculerMarge(undefined, null)
    expect(marge).toBe(0)
    expect(taux).toBe(0)
  })

  it('arrondit le taux à une décimale', () => {
    const { taux } = calculerMarge(3, 1) // marge = 2, taux = 66.666...
    expect(taux).toBe(66.7)
  })
})

describe('getNatureLigne / natureLigneVersChamps (aller-retour valeur composite <-> colonnes)', () => {
  it('négoce (défaut) : categorie_ligne vide ou absent -> "negoce"', () => {
    expect(getNatureLigne(undefined, true)).toBe('negoce')
    expect(getNatureLigne('', true)).toBe('negoce')
    expect(getNatureLigne('negoce', true)).toBe('negoce')
  })

  it('option -> "option" quel que soit variante_active', () => {
    expect(getNatureLigne('option', true)).toBe('option')
    expect(getNatureLigne('option', false)).toBe('option')
  })

  it('texte -> "texte"', () => {
    expect(getNatureLigne('texte', true)).toBe('texte')
  })

  it('variante active -> "variante_active", variante inactive -> "variante_inactive"', () => {
    expect(getNatureLigne('variante', true)).toBe('variante_active')
    expect(getNatureLigne('variante', undefined)).toBe('variante_active') // undefined != false -> considérée active
    expect(getNatureLigne('variante', false)).toBe('variante_inactive')
  })

  it('natureLigneVersChamps fait l\'aller-retour exact avec getNatureLigne', () => {
    for (const nature of ['negoce', 'option', 'texte', 'variante_active', 'variante_inactive']) {
      const { categorie_ligne, variante_active } = natureLigneVersChamps(nature)
      expect(getNatureLigne(categorie_ligne, variante_active)).toBe(nature)
    }
  })
})

describe('ligneCompteDansTotal', () => {
  it('une ligne négoce (par défaut, categorie_ligne absent) compte', () => {
    expect(ligneCompteDansTotal({})).toBe(true)
    expect(ligneCompteDansTotal({ categorie_ligne: 'negoce' })).toBe(true)
  })

  it('une option ne compte jamais dans le total principal', () => {
    expect(ligneCompteDansTotal({ categorie_ligne: 'option' })).toBe(false)
  })

  it('une ligne texte ne compte jamais', () => {
    expect(ligneCompteDansTotal({ categorie_ligne: 'texte' })).toBe(false)
  })

  it('une variante compte seulement si variante_active !== false', () => {
    expect(ligneCompteDansTotal({ categorie_ligne: 'variante', variante_active: true })).toBe(true)
    expect(ligneCompteDansTotal({ categorie_ligne: 'variante' })).toBe(true) // undefined -> considérée active
    expect(ligneCompteDansTotal({ categorie_ligne: 'variante', variante_active: false })).toBe(false)
  })
})
