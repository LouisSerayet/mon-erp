import { useState } from 'react'
import { colors, fonts } from '../lib/theme'
import { TAUX_TVA_COURANTS, ttcDepuisHt, htDepuisTtc } from '../lib/tva'

// Champ de saisie d'un montant HT accompagné de son taux de TVA, avec un
// bouton pour basculer la SAISIE en TTC quand c'est ça qu'on a sous les
// yeux (reçu de carte bancaire, ticket de caisse...) plutôt que de devoir
// calculer le HT à la main avant de le taper — voir sql/
// taux_tva_achats_migration.sql et lib/tva.js (htDepuisTtc/ttcDepuisHt).
//
// Le HT (`montantHt`) reste la SEULE valeur stockée en base, comme
// avant — ce composant ne fait qu'aider à le saisir. Basculer en "TTC"
// convertit l'affichage à l'instant du clic avec le taux actuellement
// sélectionné ; retaper une valeur en mode TTC recalcule le HT à la
// volée. Changer le taux ENSUITE recalcule l'affichage depuis le HT
// stocké (donc en mode TTC, le TTC affiché bouge, pas le HT) — dans le
// flux normal (choisir le taux puis taper le TTC du reçu), ça n'arrive
// jamais : le taux se choisit avant de taper le montant.
//
// `onChangeMontant(valeurTexte)` / `onChangeTaux(nombre)` suivent le même
// principe que les autres champs d'édition inline de l'app (une valeur à
// la fois, l'appelant décide quoi en faire — voir editCmd/editFacFrs/
// editer dans ProjetDetail.jsx et Depenses.jsx).
export function SaisieMontantTva({ montantHt, tauxTva, onChangeMontant, onChangeTaux, compact = false, disabled = false, style }) {
  const [affichage, setAffichage] = useState('ht') // 'ht' | 'ttc'
  const taux = Number(tauxTva ?? 20)
  const valeurAffichee = affichage === 'ht'
    ? montantHt
    : String(ttcDepuisHt(parseFloat(montantHt) || 0, taux))

  function surSaisieMontant(texte) {
    if (affichage === 'ht') { onChangeMontant(texte); return }
    onChangeMontant(String(htDepuisTtc(parseFloat(texte) || 0, taux)))
  }

  const inputStyle = {
    padding: '3px 6px', border: 'none', borderBottom: '1px solid transparent', fontSize: compact ? 12 : 13,
    background: 'transparent', boxSizing: 'border-box', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums',
    color: colors.ink, width: compact ? 70 : 100, textAlign: 'right',
    opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'text',
  }
  const selectStyle = {
    border: 'none', background: 'transparent', fontSize: compact ? 11 : 12, color: colors.inkMuted,
    fontFamily: fonts.display, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, width: 54,
  }
  const toggleStyle = {
    background: 'none', border: '1px solid ' + colors.line, borderRadius: 3, padding: '2px 5px',
    fontSize: 10, fontWeight: 600, color: colors.inkFaint, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: fonts.display, lineHeight: 1.4, opacity: disabled ? 0.55 : 1,
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      <input type="number" min="0" value={valeurAffichee} disabled={disabled}
        onChange={e => surSaisieMontant(e.target.value)} style={inputStyle} />
      <select value={taux} disabled={disabled} onChange={e => onChangeTaux(Number(e.target.value))} style={selectStyle}
        title="Taux de TVA">
        {(TAUX_TVA_COURANTS.includes(taux) ? TAUX_TVA_COURANTS : [...TAUX_TVA_COURANTS, taux].sort((a, b) => a - b))
          .map(t => <option key={t} value={t}>{t}%</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={() => setAffichage(a => a === 'ht' ? 'ttc' : 'ht')}
        title={affichage === 'ht' ? 'Saisie en HT — cliquer pour basculer en TTC' : 'Saisie en TTC — cliquer pour revenir en HT'}
        style={toggleStyle}>
        {affichage === 'ht' ? 'HT' : 'TTC'}
      </button>
    </span>
  )
}
