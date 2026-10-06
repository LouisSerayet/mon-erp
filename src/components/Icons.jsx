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

// Dupliquer une ligne (devis, onglet Lignes) — deux rectangles superposés,
// pictogramme "copier" standard, tracé dans le même style que les icônes
// ci-dessus (traits, pas de remplissage).
export function IconDupliquer({ size = 13, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <rect x="3" y="6.5" width="9.5" height="10.5" rx="1.2" />
      <path d="M6.7 6.5V4.3a1 1 0 0 1 1-1H16a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-2" />
    </svg>
  )
}

// Client (silhouette) et Fournisseur (colis) — mini-pictogrammes des deux
// barres de progression "% facturé" sur la liste des projets (Projets.jsx) :
// un symbole par type de facturation, à la fois dans la légende et sur
// chaque ligne, pour reconnaître les deux barres sans lire le texte.
export function IconClient({ size = 13, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 16.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    </svg>
  )
}

export function IconFournisseur({ size = 13, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <path d="M3 6.5 10 3l7 3.5-7 3.5-7-3.5Z" />
      <path d="M3 6.5v7L10 17l7-3.5v-7" />
      <path d="M10 10v7" />
    </svg>
  )
}

// Commande (presse-papier + coche) — troisième mini-pictogramme des barres
// de progression sur la liste des projets (Projets.jsx), à côté de
// IconClient et IconFournisseur : "% commandé" = part du budget d'achat
// prévu au devis déjà couverte par une commande fournisseur passée (voir
// pctCommande dans Projets.jsx).
export function IconCommande({ size = 13, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} {...base}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.2" />
      <path d="M7.5 3.5V2.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.7" />
      <path d="M7 10.5 9 12.5 13.3 8" />
    </svg>
  )
}

// Poignée de glisser-déposer (6 points, style "grip" standard) — voir
// ProjetDetail.jsx onglet Lignes, glisser une ligne pour la déplacer vers un
// autre lot. Seule icône "pleine" (points remplis) du fichier plutôt que des
// traits : un grip se reconnaît par sa texture de points, pas par un tracé.
export function IconGlisser({ size = 13, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block', ...style }} fill="currentColor" stroke="none">
      <circle cx="7" cy="5" r="1.3" />
      <circle cx="13" cy="5" r="1.3" />
      <circle cx="7" cy="10" r="1.3" />
      <circle cx="13" cy="10" r="1.3" />
      <circle cx="7" cy="15" r="1.3" />
      <circle cx="13" cy="15" r="1.3" />
    </svg>
  )
}
