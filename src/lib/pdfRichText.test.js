import { describe, it, expect } from 'vitest'
import { aDeLaMiseEnForme, analyserMiseEnForme } from './pdfRichText'

describe('aDeLaMiseEnForme', () => {
  it('détecte le gras/italique/souligné', () => {
    expect(aDeLaMiseEnForme('**gras**')).toBe(true)
    expect(aDeLaMiseEnForme('_italique_')).toBe(true)
    expect(aDeLaMiseEnForme('~souligné~')).toBe(true)
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
    expect(segments).toEqual([{ text: 'Pose de parquet', bold: false, italic: false, underline: false }])
  })

  it('gras simple', () => {
    const { segments, plain } = analyserMiseEnForme('**Attention** : poser avant la chape')
    expect(plain).toBe('Attention : poser avant la chape')
    expect(segments[0]).toEqual({ text: 'Attention', bold: true, italic: false, underline: false })
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
    expect(segments).toEqual([{ text: 'à confirmer', bold: true, italic: true, underline: false }])
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
})
