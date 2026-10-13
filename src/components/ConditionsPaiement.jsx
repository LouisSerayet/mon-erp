import { useState } from 'react'
import { PRESETS_DELAI_PAIEMENT } from '../lib/calculs'
import { colors, fonts } from '../lib/theme'

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }

// Sélecteur "Conditions de paiement" (délai en jours + case "fin de mois")
// — pré-remplit automatiquement l'échéance des factures/commandes de ce
// tiers (voir calculerEcheance dans lib/calculs.js et son usage dans
// ProjetDetail.jsx). Partagé entre Fournisseurs.jsx et Clients.jsx (anciennement
// deux copies identiques de ce composant, une par fichier).
//
// Avant ce composant : les boutons presets ET les champs détaillés
// (jours + "fin de mois") étaient affichés en permanence côte à côte pour
// la même information — repéré par Louis comme pas logique. Désormais, les
// champs détaillés ne s'affichent que si la valeur actuelle ne correspond à
// aucun preset standard, ou si "Personnalisé" est cliqué explicitement.
export function ConditionsPaiement({ jours, finMois, onChange }) {
  const matchPreset = PRESETS_DELAI_PAIEMENT.find(p => Number(jours) === p.jours && !!finMois === p.finMois)
  // Initialisé une seule fois (pas de useEffect pour resynchroniser) : ce
  // composant est toujours démonté/remonté quand on change de fiche
  // (fermeture de modale, ou bascule d'un autre mode d'édition) — voir
  // Fournisseurs.jsx/Clients.jsx, donc l'état initial correspond toujours à
  // la bonne fiche au premier rendu.
  const [personnalise, setPersonnalise] = useState(!matchPreset)

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={fieldLabel}>Conditions de paiement</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 10 }}>
        {PRESETS_DELAI_PAIEMENT.map(p => {
          const actif = !personnalise && Number(jours) === p.jours && !!finMois === p.finMois
          return (
            <button key={p.label} type="button" onClick={() => { onChange(p.jours, p.finMois); setPersonnalise(false) }}
              style={{ background: 'none', border: 'none', padding: '0 0 3px', borderBottom: '1px solid ' + (actif ? colors.ink : 'transparent'), color: actif ? colors.ink : colors.inkMuted, cursor: 'pointer', fontSize: 12, fontFamily: fonts.display, fontWeight: actif ? 600 : 400 }}>
              {p.label}
            </button>
          )
        })}
        <button type="button" onClick={() => setPersonnalise(v => !v)}
          style={{ background: 'none', border: 'none', padding: '0 0 3px', borderBottom: '1px solid ' + (personnalise ? colors.ink : 'transparent'), color: personnalise ? colors.ink : colors.inkMuted, cursor: 'pointer', fontSize: 12, fontFamily: fonts.display, fontWeight: personnalise ? 600 : 400 }}>
          Personnalisé
        </button>
      </div>
      {personnalise && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="number" min="0" value={jours ?? 30} onChange={e => onChange(parseInt(e.target.value, 10) || 0, !!finMois)}
            style={{ ...inputUnderline, width: 60 }} />
          <span style={{ fontSize: 13, color: colors.inkMuted }}>jours</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.inkMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!finMois} onChange={e => onChange(Number(jours) || 0, e.target.checked)} />
            Fin de mois
          </label>
        </div>
      )}
    </div>
  )
}
