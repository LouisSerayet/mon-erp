import { describe, it, expect } from 'vitest'
import { tauxTvaDepense, ttcDepuisHt, htDepuisTtc, calculerTva, TAUX_TVA_COURANTS } from './tva'

describe('ttcDepuisHt / htDepuisTtc', () => {
  it('convertit HT -> TTC à 20%', () => {
    expect(ttcDepuisHt(100, 20)).toBe(120)
  })
  it('convertit TTC -> HT à 20%', () => {
    expect(htDepuisTtc(120, 20)).toBe(100)
  })
  it('fait un aller-retour cohérent à un taux non entier (5.5%)', () => {
    const ht = 83.33
    const ttc = ttcDepuisHt(ht, 5.5)
    expect(htDepuisTtc(ttc, 5.5)).toBeCloseTo(ht, 2)
  })
  it('taux 0% : HT et TTC sont identiques', () => {
    expect(ttcDepuisHt(100, 0)).toBe(100)
    expect(htDepuisTtc(100, 0)).toBe(100)
  })
  it('arrondit au centime', () => {
    expect(ttcDepuisHt(10, 10)).toBe(11) // 10 * 1.10 = 11.00
    expect(htDepuisTtc(99.99, 20)).toBeCloseTo(83.33, 2)
  })
  it('accepte une valeur vide/NaN sans planter', () => {
    expect(ttcDepuisHt(undefined, 20)).toBe(0)
    expect(htDepuisTtc(null, 20)).toBe(0)
  })
})

describe('TAUX_TVA_COURANTS', () => {
  it('contient les quatre taux français courants', () => {
    expect(TAUX_TVA_COURANTS).toEqual([0, 5.5, 10, 20])
  })
})

describe('tauxTvaDepense', () => {
  it('renvoie 0% pour les catégories exonérées', () => {
    expect(tauxTvaDepense('Assurance')).toBe(0)
    expect(tauxTvaDepense('Impôts & taxes')).toBe(0)
    expect(tauxTvaDepense('Banque & frais financiers')).toBe(0)
  })
  it('renvoie 20% par défaut pour les autres catégories', () => {
    expect(tauxTvaDepense('Loyer & charges')).toBe(20)
    expect(tauxTvaDepense('Autre')).toBe(20)
  })
})

describe('calculerTva — taux réel par ligne (achats)', () => {
  it('utilise le taux_tva réel de chaque facture fournisseur, pas un taux fixe de 20%', () => {
    const ffrs = [
      { id: 1, montant_ht: 100, taux_tva: 20 },
      { id: 2, montant_ht: 100, taux_tva: 10 },
      { id: 3, montant_ht: 100, taux_tva: 0 }, // 0% réel, pas autoliquidation
    ]
    const r = calculerTva({ fcli: [], ffrs, depData: [] })
    expect(r.tvaDeductibleAchats).toBeCloseTo(20 + 10 + 0, 2)
    expect(r.nbAutoliquidation).toBe(0)
  })

  it('retombe sur 20% pour une facture fournisseur sans taux_tva renseigné (donnée antérieure au champ)', () => {
    const ffrs = [{ id: 1, montant_ht: 100, taux_tva: null }]
    const r = calculerTva({ fcli: [], ffrs, depData: [] })
    expect(r.tvaDeductibleAchats).toBeCloseTo(20, 2)
  })

  it('exclut toujours l\'autoliquidation du calcul, quel que soit taux_tva', () => {
    const ffrs = [{ id: 1, montant_ht: 100, taux_tva: 20, fournisseurs: { autoliquidation: true } }]
    const r = calculerTva({ fcli: [], ffrs, depData: [] })
    expect(r.tvaDeductibleAchats).toBe(0)
    expect(r.nbAutoliquidation).toBe(1)
    expect(r.montantAutoliquidation).toBe(100)
  })

  it('une commande liée en autoliquidation prime sur le réglage par défaut du fournisseur', () => {
    const ffrs = [{ id: 1, montant_ht: 100, taux_tva: 20, commandes: { regime_tva: 'normale' }, fournisseurs: { autoliquidation: true } }]
    const r = calculerTva({ fcli: [], ffrs, depData: [] })
    // regime_tva='normale' sur la commande l'emporte sur fournisseurs.autoliquidation
    expect(r.nbAutoliquidation).toBe(0)
    expect(r.tvaDeductibleAchats).toBeCloseTo(20, 2)
  })

  it('utilise le taux_tva réel d\'une dépense générale, pas la catégorie devinée', () => {
    const depData = [{ id: 1, montant_ht: 100, categorie: 'Assurance', taux_tva: 20 }] // override explicite à 20% malgré la catégorie exonérée
    const r = calculerTva({ fcli: [], ffrs: [], depData })
    expect(r.tvaDeductibleDepenses).toBeCloseTo(20, 2)
  })

  it('retombe sur la catégorie devinée pour une dépense générale sans taux_tva renseigné', () => {
    const depData = [{ id: 1, montant_ht: 100, categorie: 'Assurance', taux_tva: null }]
    const r = calculerTva({ fcli: [], ffrs: [], depData })
    expect(r.tvaDeductibleDepenses).toBe(0) // Assurance -> 0% par tauxTvaDepense
  })

  it('détail ligne par ligne : le taux affiché correspond au taux réel utilisé', () => {
    const ffrs = [{ id: 1, numero: 'F1', montant_ht: 100, taux_tva: 10 }]
    const r = calculerTva({ fcli: [], ffrs, depData: [] })
    const ligne = r.detailDeductible.find(l => l.id === 'ffrs-1')
    expect(ligne.taux).toBe(10)
    expect(ligne.tva).toBeCloseTo(10, 2)
  })
})
