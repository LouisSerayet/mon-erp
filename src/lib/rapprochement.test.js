import { describe, it, expect } from 'vitest'
import { montantsCandidats, rapprocherFactures } from './rapprochement'

describe('montantsCandidats — taux réel plutôt que 20% fixe', () => {
  it('teste le TTC au taux réel de la facture (0%)', () => {
    const candidats = montantsCandidats(100, 0)
    // À 0%, HT === TTC : un seul candidat (voir la dédup dans la fonction).
    expect(candidats).toEqual([{ base: 'HT', cents: 10000 }])
  })

  it('teste le TTC au taux réel de la facture (5,5%)', () => {
    const candidats = montantsCandidats(100, 5.5)
    expect(candidats).toEqual([
      { base: 'HT', cents: 10000 },
      { base: 'TTC (5.5 %)', cents: 10550 },
    ])
  })

  it('retombe sur 20% quand aucun taux n\'est fourni (factures clients, pas encore de taux_tva par ligne)', () => {
    const candidats = montantsCandidats(100, undefined)
    expect(candidats).toEqual([
      { base: 'HT', cents: 10000 },
      { base: 'TTC (20 %)', cents: 12000 },
    ])
  })
})

describe('rapprocherFactures — utilise le vrai taux_tva de chaque facture', () => {
  it('matche une facture fournisseur à 0% dont le TTC réel ne correspondrait à aucun candidat à 20%', () => {
    // 100€ HT à 0% de TVA -> payé 100€ exactement. L'ancien code aurait
    // testé seulement 100€ (HT) et 120€ (HT+20% inventé) : la transaction
    // réelle de 100€ aurait quand même matché ici par coïncidence (HT),
    // donc on prend un exemple où seul le candidat "au vrai taux" fonctionne.
    const factures = [{ id: 'f1', numero: 'FRS-1', montant_ht: 100, taux_tva: 5.5 }]
    const transactions = [{ transaction_id: 't1', side: 'debit', status: 'completed', amount_cents: -10550, label: 'paiement FRS-1' }]
    const resultats = rapprocherFactures(factures, transactions, 'debit')
    expect(resultats).toHaveLength(1)
    expect(resultats[0].confiance).toBe('exact')
    expect(resultats[0].base).toBe('TTC (5.5 %)')
  })

  it('ne matche plus par erreur une facture à 10% sur le montant TTC-20% d\'une autre, ni sur son propre faux candidat à 20%', () => {
    // 100€ HT à 10% -> vrai TTC 110€. Une transaction de 120€ (ce qu'aurait
    // donné l'ancienne hypothèse fixe à 20%) ne doit PAS matcher.
    const factures = [{ id: 'f1', numero: 'FRS-1', montant_ht: 100, taux_tva: 10 }]
    const transactions = [{ transaction_id: 't1', side: 'debit', status: 'completed', amount_cents: -12000, label: 'paiement FRS-1' }]
    const resultats = rapprocherFactures(factures, transactions, 'debit')
    expect(resultats).toHaveLength(0)
  })
})
