import { describe, it, expect } from 'vitest'
import { aDeLaMiseEnForme, analyserMiseEnForme, hexVersRgb, PALETTE_COULEURS } from './pdfRichText'

describe('aDeLaMiseEnForme', () => {
  it('détecte le gras/italique/souligné/couleur', () => {
    expect(aDeLaMiseEnForme('**gras**')).toBe(true)
    expect(aDeLaMiseEnForme('_italique_')).toBe(true)
    expect(aDeLaMiseEnForme('~souligné~')).toBe(true)
    expect(aDeLaMiseEnForme('{rouge:important}')).toBe(true)
  })

  it('ignore un texte sans marqueur', () => {
    expect(aDeLaMiseEnForme('Pose de parquet massif chêne')).toBe(false)
    expect(aDeLaMiseEnForme('')).toBe(false)
    expect(aDeLaMiseEnForme(null)).toBe(false)
  })

  it('ne se déclenche pas sur un simple tiret ou underscore isolé (ex: "non_réalisable" sans fermeture)', () => {
    expect(aDeLaMiseEnForme('réf_produit sans second underscore')).toBe(false)
  })
})

describe('analyserMiseEnForme', () => {
  it('texte sans marqueur : un seul segment, non stylé', () => {
    const { segments, plain } = analyserMiseEnForme('Pose de parquet')
    expect(plain).toBe('Pose de parquet')
    expect(segments).toEqual([{ text: 'Pose de parquet', bold: false, italic: false, underline: false, couleur: null }])
  })

  it('gras simple', () => {
    const { segments, plain } = analyserMiseEnForme('**Attention** : poser avant la chape')
    expect(plain).toBe('Attention : poser avant la chape')
    expect(segments[0]).toEqual({ text: 'Attention', bold: true, italic: false, underline: false, couleur: null })
    expect(segments[1].bold).toBe(false)
  })

  it('italique et souligné dans la même ligne', () => {
    const { plain, segments } = analyserMiseEnForme('du placo _hydrofuge_ et ~non peint~')
    expect(plain).toBe('du placo hydrofuge et non peint')
    const italique = segments.find(s => s.text === 'hydrofuge')
    const souligne = segments.find(s => s.text === 'non peint')
    expect(italique.italic).toBe(true)
    expect(souligne.underline).toBe(true)
  })

  it('combine gras + italique par imbrication', () => {
    const { plain, segments } = analyserMiseEnForme('**_à confirmer_**')
    expect(plain).toBe('à confirmer')
    expect(segments).toEqual([{ text: 'à confirmer', bold: true, italic: true, underline: false, couleur: null }])
  })

  it('marqueur non fermé reste du texte brut (pas de crash, pas de style appliqué)', () => {
    const { plain, segments } = analyserMiseEnForme('**gras non fermé')
    expect(plain).toBe('**gras non fermé')
    expect(segments.every(s => !s.bold)).toBe(true)
  })

  it('texte vide', () => {
    expect(analyserMiseEnForme('').segments).toEqual([])
    expect(analyserMiseEnForme('').plain).toBe('')
  })

  it('couleur simple', () => {
    const { plain, segments } = analyserMiseEnForme('{rouge:Attention}, à ne pas oublier')
    expect(plain).toBe('Attention, à ne pas oublier')
    expect(segments[0]).toEqual({ text: 'Attention', bold: false, italic: false, underline: false, couleur: 'rouge' })
    expect(segments[1].couleur).toBe(null)
  })

  it('couleur combinée avec le gras, couleur à l\'extérieur', () => {
    const { plain, segments } = analyserMiseEnForme('{bleu:**important**}')
    expect(plain).toBe('important')
    expect(segments).toEqual([{ text: 'important', bold: true, italic: false, underline: false, couleur: 'bleu' }])
  })

  it('ignore un nom de couleur inconnu de la palette au moment du dessin (pas ici) mais le parse quand même', () => {
    // analyserMiseEnForme ne valide pas le nom contre PALETTE_COULEURS —
    // c'est dessiner()/markupVersHtml qui ignorent une couleur inconnue
    // (voir pdfRichText.test de dessiner plus bas et richTextEditeur).
    const { segments } = analyserMiseEnForme('{inconnue:texte}')
    expect(segments[0].couleur).toBe('inconnue')
  })
})

describe('hexVersRgb', () => {
  it('convertit chaque couleur de la palette en triplet 0-255', () => {
    expect(hexVersRgb('#d32f2f')).toEqual([211, 47, 47])
    expect(hexVersRgb('#000000')).toEqual([0, 0, 0])
    expect(hexVersRgb('#ffffff')).toEqual([255, 255, 255])
  })

  it('PALETTE_COULEURS ne contient que des hexadécimaux valides à 6 chiffres', () => {
    for (const [, hex] of PALETTE_COULEURS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
