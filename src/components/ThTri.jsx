import { colors } from '../lib/theme'

// En-tête de colonne cliquable pour trier un tableau — voir src/lib/useTri.js
// pour l'état de tri (cle/sens/trierPar). `col` est la clé de cette colonne
// dans la config passée à appliquerTri ; `triActuel` = { cle, sens } l'état
// courant. Affiche une flèche ▲ (croissant) / ▼ (décroissant) quand cette
// colonne est le tri actif — toujours en réservant sa place (opacité 0
// plutôt qu'absente) pour que les en-têtes ne bougent pas horizontalement
// au clic.
export function ThTri({ col, label, triActuel, onClick, align = 'left', style, width }) {
  const actif = triActuel?.cle === col
  return (
    <th onClick={() => onClick(col)} title="Cliquer pour trier"
      style={{
        padding: '0 14px 10px 0', textAlign: align, color: actif ? colors.ink : colors.inkFaint,
        fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em',
        whiteSpace: 'nowrap', borderBottom: '1px solid ' + colors.line, cursor: 'pointer',
        userSelect: 'none', width, ...style,
      }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
        {label}
        <span style={{ fontSize: 9, opacity: actif ? 1 : 0.3, width: 8, display: 'inline-block', flexShrink: 0 }}>
          {actif && triActuel.sens === 'desc' ? '▼' : '▲'}
        </span>
      </span>
    </th>
  )
}
