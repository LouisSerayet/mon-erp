import { useState, useRef, useEffect } from 'react'
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
//
// Champ en type="text" (pas type="number") : un <input type="number">
// rejette silencieusement la virgule décimale française à la frappe (elle
// n'est pas insérée, les chiffres suivants s'enchaînent sans elle — "61,67"
// devient "6167"). On normalise virgule -> point nous-mêmes à la saisie.
export function SaisieMontantTva({ montantHt, tauxTva, onChangeMontant, onChangeTaux, compact = false, disabled = false, tauxSansEffet = false, style }) {
  const [affichage, setAffichage] = useState('ht') // 'ht' | 'ttc'
  const taux = Number(tauxTva ?? 20)
  const valeurCalculee = affichage === 'ht'
    ? montantHt
    : String(ttcDepuisHt(parseFloat(montantHt) || 0, taux))

  // Pendant la frappe, on affiche le texte TEL QUE TAPÉ (`texteSaisi`), pas
  // la valeur recalculée à chaque caractère. Avant ce correctif, en mode
  // TTC, chaque frappe déclenchait TTC->HT->TTC et réécrasait le champ
  // avec le résultat arrondi : taper "61.67" character par caractère se
  // faisait donc interrompre par ce ré-affichage dès le "." (le champ
  // retombait sur "61", sans décimales, un nombre déjà arrondi) — on
  // perdait la fin de la saisie en cours de frappe. `enEdition` bascule à
  // la prise de focus (texteSaisi initialisé avec la valeur affichée et
  // sélectionnée en entier, pour une saisie directe par-dessus) et
  // s'éteint au blur, moment où l'affichage revient à la valeur HT/TTC
  // canonique recalculée.
  const [enEdition, setEnEdition] = useState(false)
  const [texteSaisi, setTexteSaisi] = useState('')
  const valeurAffichee = enEdition ? texteSaisi : (valeurCalculee ?? '')

  const inputRef = useRef(null)
  const declencherFocusSelect = useRef(false)
  useEffect(() => {
    if (declencherFocusSelect.current) {
      declencherFocusSelect.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  })

  function surFocus(e) {
    setEnEdition(true)
    setTexteSaisi(String(valeurCalculee ?? ''))
    e.target.select()
  }
  function surSaisieMontant(texte) {
    // Le champ est en type="text" (pas type="number") précisément pour
    // accepter la virgule française comme séparateur décimal : un
    // <input type="number"> rejette silencieusement la virgule à la
    // frappe (elle n'est juste pas insérée) et les chiffres tapés après
    // s'enchaînent sans elle — "61,67" devient "6167" sans que rien ne
    // le signale, un montant 100x trop grand. On normalise donc virgule
    // -> point avant tout calcul ou renvoi au parent (qui fait lui aussi
    // un parseFloat, lequel tronque silencieusement à la virgule).
    const texteNormalise = texte.replace(',', '.')
    setTexteSaisi(texteNormalise)
    if (affichage === 'ht') { onChangeMontant(texteNormalise); return }
    onChangeMontant(String(htDepuisTtc(parseFloat(texteNormalise) || 0, taux)))
  }
  function surBlur() {
    setEnEdition(false)
  }
  function basculerAffichage() {
    if (disabled) return
    setAffichage(a => a === 'ht' ? 'ttc' : 'ht')
    declencherFocusSelect.current = true
  }

  const inputStyle = {
    padding: '3px 6px', border: 'none', borderBottom: '1px solid transparent', fontSize: compact ? 12 : 13,
    background: 'transparent', boxSizing: 'border-box', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums',
    color: colors.ink, width: compact ? 70 : 100, textAlign: 'right',
    opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'text',
  }
  const selectStyle = {
    border: 'none', background: 'transparent', fontSize: compact ? 11 : 12, color: colors.inkMuted,
    fontFamily: fonts.display, cursor: (disabled || tauxSansEffet) ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : tauxSansEffet ? 0.35 : 1, width: 54,
  }
  const toggleStyle = {
    background: 'none', border: '1px solid ' + colors.line, borderRadius: 3, padding: '2px 5px',
    fontSize: 10, fontWeight: 600, color: colors.inkFaint, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: fonts.display, lineHeight: 1.4, opacity: disabled ? 0.55 : 1,
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      <input ref={inputRef} type="text" inputMode="decimal" value={valeurAffichee} disabled={disabled}
        onChange={e => surSaisieMontant(e.target.value)} onFocus={surFocus} onBlur={surBlur} style={inputStyle} />
      {/* tauxSansEffet (ex. ligne en autoliquidation) : le sélecteur reste
          visible mais grisé et désactivé — en autoliquidation, calculerTva()
          ignore ce taux quel qu'il soit (TVA déclarée et déduite en même
          temps, impact net nul), donc l'afficher actif à côté du badge
          "Autoliq." donnait l'impression contradictoire d'un vrai taux de
          20% appliqué malgré l'autoliquidation. */}
      <select value={taux} disabled={disabled || tauxSansEffet} onChange={e => onChangeTaux(Number(e.target.value))} style={selectStyle}
        title={tauxSansEffet ? 'Autoliquidation : la TVA est auto-liquidée (déclarée et déduite en même temps), ce taux n\'a aucun effet ici.' : 'Taux de TVA'}>
        {(TAUX_TVA_COURANTS.includes(taux) ? TAUX_TVA_COURANTS : [...TAUX_TVA_COURANTS, taux].sort((a, b) => a - b))
          .map(t => <option key={t} value={t}>{t}%</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={basculerAffichage}
        title={affichage === 'ht' ? 'Saisie en HT — cliquer pour basculer en TTC' : 'Saisie en TTC — cliquer pour revenir en HT'}
        style={toggleStyle}>
        {affichage === 'ht' ? 'HT' : 'TTC'}
      </button>
    </span>
  )
}
