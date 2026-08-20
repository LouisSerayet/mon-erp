import { describe, it, expect } from 'vitest'
import { calculerLigne, calculerMarge, getNatureLigne, natureLigneVersChamps, ligneCompteDansTotal, natureLigneDepuisTexte, calculerEcheance, fmtEUR, fmtDateFr, termeNettoye, montantSaisi } from './calculs'

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

  it('mode honoraire : le prix de vente est saisi directement, achat et coeff forcés à vide/zéro', () => {
    const r = calculerLigne({ modeLocal: 'honoraire', champ: 'prix_unit_ht', valeur: '500', current: {}, ligne: ligneBase })
    expect(r.prix_unit_ht).toBe('500')
    expect(r.prix_achat_ht).toBe('0')
    expect(r.coeff).toBe('')
    expect(r.total_ht).toBe(1000) // qte(2) * 500
    expect(r.total_achat).toBe(0)
  })

  it('mode honoraire : ignore un éventuel achat/coeff déjà présent sur la ligne d\'origine', () => {
    // Une ligne qui avait un achat avant de basculer en Honoraire ne doit
    // plus jamais faire réapparaître ce coût dans le total.
    const r = calculerLigne({ modeLocal: 'honoraire', champ: 'qte', valeur: '3', current: {}, ligne: ligneBase })
    expect(r.prix_achat_ht).toBe('0')
    expect(r.total_achat).toBe(0)
    expect(r.total_ht).toBe(390) // 3 * 130 (prix vente ligne d'origine, inchangé)
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
    for (const nature of ['negoce', 'honoraire', 'option', 'texte', 'variante_active', 'variante_inactive']) {
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

  it('une ligne honoraire compte normalement, comme une ligne négoce', () => {
    expect(ligneCompteDansTotal({ categorie_ligne: 'honoraire' })).toBe(true)
  })
})

describe('natureLigneDepuisTexte (colonne "Nature" de l\'import Excel)', () => {
  it('reconnaît chaque libellé exact du sélecteur', () => {
    expect(natureLigneDepuisTexte('Négoce')).toBe('negoce')
    expect(natureLigneDepuisTexte('Honoraire')).toBe('honoraire')
    expect(natureLigneDepuisTexte('Option')).toBe('option')
    expect(natureLigneDepuisTexte('Variante retenue')).toBe('variante_active')
    expect(natureLigneDepuisTexte('Variante alt.')).toBe('variante_inactive')
    expect(natureLigneDepuisTexte('Texte')).toBe('texte')
  })

  it('est insensible à la casse et aux espaces superflus', () => {
    expect(natureLigneDepuisTexte('  option  ')).toBe('option')
    expect(natureLigneDepuisTexte('NÉGOCE')).toBe('negoce')
  })

  it('retombe sur "negoce" si vide, absent ou non reconnu — un import ne doit jamais échouer pour ça', () => {
    expect(natureLigneDepuisTexte('')).toBe('negoce')
    expect(natureLigneDepuisTexte(undefined)).toBe('negoce')
    expect(natureLigneDepuisTexte(null)).toBe('negoce')
    expect(natureLigneDepuisTexte('n\'importe quoi')).toBe('negoce')
  })
})

describe('calculerEcheance (échéance auto d\'une facture depuis les conditions de paiement du tiers)', () => {
  it('comptant (0 jour) : échéance = date de facture', () => {
    expect(calculerEcheance('2026-08-18', 0, false)).toBe('2026-08-18')
  })

  it('délai net simple (sans fin de mois)', () => {
    expect(calculerEcheance('2026-08-18', 30, false)).toBe('2026-09-17')
  })

  it('délai + fin de mois : reporte au dernier jour du mois obtenu', () => {
    expect(calculerEcheance('2026-08-18', 30, true)).toBe('2026-09-30')
  })

  it('fin de mois sur un mois de 31 jours (janvier)', () => {
    expect(calculerEcheance('2026-01-15', 45, true)).toBe('2026-03-31')
    expect(calculerEcheance('2026-01-15', 45, false)).toBe('2026-03-01')
  })

  it('franchit une fin d\'année civile correctement', () => {
    expect(calculerEcheance('2025-12-20', 30, false)).toBe('2026-01-19')
    expect(calculerEcheance('2025-12-05', 20, true)).toBe('2025-12-31')
  })

  it('renvoie une chaîne vide si la date de facture est vide/absente — ne doit jamais planter', () => {
    expect(calculerEcheance('', 30, false)).toBe('')
    expect(calculerEcheance(undefined, 30, false)).toBe('')
    expect(calculerEcheance(null, 30, true)).toBe('')
  })

  it('traite un délai non numérique comme 0 jour', () => {
    expect(calculerEcheance('2026-08-18', undefined, false)).toBe('2026-08-18')
    expect(calculerEcheance('2026-08-18', '', false)).toBe('2026-08-18')
  })
})

describe('fmtEUR (formatage monétaire centralisé)', () => {
  it('formate un montant positif avec le symbole €', () => {
    // Le séparateur de milliers fr-FR est une espace fine insécable
    // (U+202F), pas une espace normale — on la construit ici plutôt que
    // de la coller en dur dans le fichier source pour éviter tout souci
    // d'encodage entre éditeurs.
    const espaceFine = ' '
    expect(fmtEUR(1234.5)).toBe(`1${espaceFine}234,50 €`)
  })

  it('affiche bien "0,00 €" pour un montant de zéro — pas "—" (régression : un montant à 0 est une valeur valide, pas une absence de valeur)', () => {
    expect(fmtEUR(0)).toBe('0,00 €')
  })

  it('affiche "—" seulement pour undefined/null (valeur réellement absente)', () => {
    expect(fmtEUR(undefined)).toBe('—')
    expect(fmtEUR(null)).toBe('—')
  })
})

describe('fmtDateFr (formatage date courte centralisé)', () => {
  it('formate une date ISO en jj/mm/aaaa', () => {
    expect(fmtDateFr('2026-08-20')).toBe('20/08/2026')
  })

  it('affiche "—" pour une date vide/absente', () => {
    expect(fmtDateFr('')).toBe('—')
    expect(fmtDateFr(undefined)).toBe('—')
    expect(fmtDateFr(null)).toBe('—')
  })
})

describe('termeNettoye (recherche avancée)', () => {
  it('retire les virgules et parenthèses qui casseraient un filtre .or() PostgREST', () => {
    expect(termeNettoye('Dupont, (SARL)')).toBe('Dupont   SARL')
  })

  it('laisse un terme normal inchangé (à part le trim)', () => {
    expect(termeNettoye('  Aménagement bureaux  ')).toBe('Aménagement bureaux')
  })
})

describe('montantSaisi (recherche avancée)', () => {
  it('reconnaît un montant entier', () => {
    expect(montantSaisi('1250')).toBe(1250)
  })

  it('reconnaît un montant avec virgule décimale (format FR)', () => {
    expect(montantSaisi('1250,50')).toBe(1250.5)
  })

  it('reconnaît un montant avec point décimal', () => {
    expect(montantSaisi('1250.5')).toBe(1250.5)
  })

  it('ignore les espaces (ex: séparateur de milliers)', () => {
    expect(montantSaisi('1 250,50')).toBe(1250.5)
  })

  it('renvoie null pour un texte qui n\'est pas un montant', () => {
    expect(montantSaisi('Dupont')).toBe(null)
    expect(montantSaisi('FC-2026-014')).toBe(null)
    expect(montantSaisi('')).toBe(null)
  })
})
