// Direction visuelle "épurée" de l'ERP — palette et polices partagées,
// pour que chaque page utilise les mêmes valeurs plutôt que des couleurs
// codées en dur (ce qui rendait toute évolution visuelle impossible à faire
// de façon cohérente). L'app reste en style inline (pas de CSS-in-JS ni de
// classes utilitaires) : ce module est donc l'équivalent de variables CSS
// pour ce codebase — `import { colors, fonts } from '../lib/theme'`.
//
// Principes (voir la maquette Dashboard validée) : fond blanc cassé, une
// seule police de texte (Archivo), une police mono pour les montants/dates
// (JetBrains Mono, chargées dans index.html), peu ou pas de cadres/ombres
// (séparation par des filets fins `colors.line` plutôt que des cartes), et
// la couleur réservée aux statuts (succès/attention/danger), jamais
// décorative.

export const colors = {
  bg: '#faf9f6',
  surface: '#ffffff',
  ink: '#17181a',
  inkMuted: '#75746d',
  inkFaint: '#a6a49b',
  line: '#e7e4dc',

  success: '#2f6b4f',
  successBg: '#eaf2ec',
  warning: '#9c5f1e',
  warningBg: '#f5ecdd',
  danger: '#a23b2e',
  dangerBg: '#f7e8e3',
  neutralChip: '#eeece5',
  focus: '#1f3a3d',
}

export const fonts = {
  display: "'Archivo', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
}

// Petits styles réutilisés tels quels sur beaucoup de pages, pour éviter de
// retaper les mêmes objets partout et garder les mêmes valeurs si on les
// affine plus tard.
export const sectionTitle = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: colors.ink,
  margin: 0,
}

export const eyebrow = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: colors.inkFaint,
  margin: 0,
}

export const quietLink = {
  color: colors.inkMuted,
  textDecoration: 'none',
  borderBottom: '1px solid ' + colors.inkFaint,
  paddingBottom: 1,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  borderBottomColor: colors.inkFaint,
  fontFamily: fonts.display,
  fontSize: 12,
}

// Marqueur de statut : petit carré coloré (façon légende de plan) plutôt
// qu'un badge plein.
export function marker(color) {
  return { width: 7, height: 7, flexShrink: 0, display: 'inline-block', background: color }
}

// Badge "avatar" (initiales + couleur) pour identifier un client en un coup
// d'œil sans logo réel à gérer (voir Dashboard.jsx, section "Favoris") —
// une palette discrète plutôt qu'une couleur vive tirée au hasard, et
// toujours la même couleur pour un même nom (hash simple, déterministe).
const PALETTE_AVATAR = ['#5b6f8a', '#8a6b4f', '#4f8a6b', '#8a4f6b', '#6b4f8a', '#8a7a4f', '#4f6b8a', '#6b8a4f']
export function couleurAvatar(nom) {
  const s = nom || '?'
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return PALETTE_AVATAR[Math.abs(hash) % PALETTE_AVATAR.length]
}
export function initiales(nom) {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[1][0]).toUpperCase()
}

// Couleur de statut projet, partagée entre Dashboard, Projets et ProjetDetail
// pour que le même statut soit toujours identifié par la même couleur,
// où qu'on le voie dans l'app.
export const statutProjetMarker = {
  'Brouillon': colors.inkFaint,
  'Devis envoyé': colors.warning,
  'Devis signé': '#5b6f8a',
  'En cours': colors.focus,
  'Finalisation': colors.warning,
  'Clôturé': colors.success,
  'Perdu': colors.danger,
}
