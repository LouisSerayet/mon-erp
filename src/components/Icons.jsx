// Petites icônes ligne (SVG inline, pas de dépendance externe) pour
// remplacer les libellés texte des actions répétitives dans les tableaux
// (Aperçu / Envoyer / Pièces / Supprimer) — sur une ligne de commande ou de
// facture, quatre boutons texte prennent beaucoup de place et alourdissent
// visuellement le tableau ; une icône + un `title` (infobulle au survol)
// gardent l'action lisible sans le poids du texte. Tracé volontairement
// simple (lignes, cercles, polygones) plutôt que des courbes complexes —
// plus sûr à dessiner à la main et cohérent avec le reste de la DA
// (aucune ombre, aucun remplissage, `currentColor` pour hériter la couleur
// du bouton qui l'entoure, comme quietLink un peu partout dans l'app).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconApercu({ size = 15, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="16.3" y1="16.3" x2="12.6" y2="12.6" />
    </svg>
  )
}

export function IconEnvoyer({ size = 15, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <polygon points="2,10 18,3 11,17 9,11 2,10" />
    </svg>
  )
}

export function IconPieces({ size = 15, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <path d="M6 2.5h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
      <path d="M12 2.5v3h3" />
    </svg>
  )
}

export function IconSupprimer({ size = 15, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <line x1="4" y1="5.5" x2="16" y2="5.5" />
      <path d="M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M5.5 5.5 6.3 16a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-10.5" />
      <line x1="8.3" y1="8.5" x2="8.3" y2="13.5" />
      <line x1="11.7" y1="8.5" x2="11.7" y2="13.5" />
    </svg>
  )
}
