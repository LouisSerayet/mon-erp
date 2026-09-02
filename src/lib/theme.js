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
// qu'un badge plein — voir STATUT_MARKER dans Dashboard.jsx pour l'usage.
export function marker(color) {
  return { width: 7, height: 7, flexShrink: 0, display: 'inline-block', background: color }
}
