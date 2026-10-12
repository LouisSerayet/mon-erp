import { useNavigate, useParams } from 'react-router-dom'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow } from '../lib/theme'
import Comptes from './tresorerie/Comptes'
import Tva from './tresorerie/Tva'
import Rapprochement from './tresorerie/Rapprochement'
import CompteResultat from './tresorerie/CompteResultat'

// Trésorerie — hub à onglets regroupant tout ce qui était avant éclaté
// entre plusieurs pages séparées (/tresorerie, /resultat, /rapprochement),
// chacune n'étant atteignable que depuis les widgets du Dashboard. Louis
// trouvait que ça "allait à droite à gauche" : même argent de la société,
// quatre endroits différents. Chaque onglet garde son propre fichier
// (voir le dossier tresorerie/) avec son propre état/chargement — seul le
// cadre (titre, barre d'onglets) est commun, porté par ce composant.
//
// Chaque onglet a sa propre URL (/tresorerie/comptes, /tresorerie/tva...)
// pour qu'un favori ou qu'un lien depuis le Dashboard ouvre directement le
// bon onglet — voir App.jsx pour les routes, dont les redirections
// /resultat -> /tresorerie/resultat et /rapprochement ->
// /tresorerie/rapprochement qui préservent les anciens liens.
const TABS = [
  { id: 'comptes', label: 'Comptes', Contenu: Comptes },
  { id: 'tva', label: 'TVA', Contenu: Tva },
  { id: 'rapprochement', label: 'Rapprochement', Contenu: Rapprochement },
  { id: 'resultat', label: 'Compte de résultat', Contenu: CompteResultat },
]

export default function Tresorerie() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const activeTab = TABS.find(t => t.id === tab) || TABS[0]
  const Contenu = activeTab.Contenu

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1280, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Trésorerie</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Comptes, TVA, rapprochement bancaire et compte de résultat</p>

      {/* Onglets */}
      <div style={{ display: 'flex', borderBottom: '1px solid ' + colors.line, margin: '28px 0 0', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => navigate('/tresorerie/' + t.id)}
            style={{ padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontFamily: fonts.display,
              fontWeight: activeTab.id === t.id ? 600 : 400, color: activeTab.id === t.id ? colors.ink : colors.inkFaint,
              borderBottom: activeTab.id === t.id ? '2px solid ' + colors.ink : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <Contenu />
      </div>
    </div>
  )
}
