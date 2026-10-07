import { useState, useRef } from 'react'
import { colors, fonts } from '../lib/theme'

// Comparaison insensible aux accents et à la casse — permet de retrouver
// "Électricité Générale" en tapant "elec", pas seulement "Élec".
function normaliserTexte(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Champ "fournisseur" en saisie libre avec suggestions qui s'affichent au
// fur et à mesure de la frappe — ce qui COMMENCE PAR le texte tapé (pas une
// recherche plein texte), pour répondre à la demande de Louis : taper le
// début d'un nom plutôt que parcourir à la souris le <select> classique
// (liste qui peut être longue, voir Fournisseurs.jsx).
//
// Reste toujours contraint à un fournisseur RÉEL de la liste : il n'y a pas
// de saisie libre qui "colle" sans sélection — fournisseur_id est une clé
// étrangère, donc au blur le texte retombe soit sur le fournisseur choisi
// (correspondance exacte ou clic sur une suggestion), soit sur vide si rien
// ne correspond, jamais sur un texte flottant sans id derrière.
//
// `value` = fournisseur_id (ou '' / null/undefined), `onChange(fournisseur_id)`
// — même contrat que les <select> fournisseur qu'il remplace (voir
// ProjetDetail.jsx : formCmd.fournisseur_id, formFfrs.fournisseur_id,
// l'édition inline des commandes et des factures fournisseurs).
//
// Même principe d'affichage que SaisieMontantTva.jsx : pendant la frappe on
// affiche le texte TEL QUE TAPÉ (`texteSaisi`, état local), dérivé du
// fournisseur réellement sélectionné (`value`) uniquement quand on n'est
// pas en train d'éditer — pas de useEffect de resynchronisation, qui
// écraserait la saisie en cours à chaque rechargement de la ligne
// (sauvegarde, édition d'un autre champ...).
export function SelecteurFournisseur({ fournisseurs, value, onChange, disabled = false, placeholder = '— Aucun —', style }) {
  const selectionne = (fournisseurs || []).find(f => f.id === value) || null
  const [enEdition, setEnEdition] = useState(false)
  const [texteSaisi, setTexteSaisi] = useState('')
  const texte = enEdition ? texteSaisi : (selectionne?.nom || '')
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const inputRef = useRef(null)

  const texteNorm = normaliserTexte(texte)
  const suggestions = (fournisseurs || [])
    .filter(f => !texteNorm || normaliserTexte(f.nom).startsWith(texteNorm))
    .slice(0, 8)

  function choisir(f) {
    onChange(f ? f.id : '')
    setOuvert(false)
    setEnEdition(false)
  }

  function surFocus(e) {
    setTexteSaisi(selectionne?.nom || '')
    setEnEdition(true)
    setOuvert(true)
    setSurligne(0)
    e.target.select()
  }

  function surSaisie(v) {
    // `enEdition` repassé à true à CHAQUE frappe, pas seulement à la prise
    // de focus : après une sélection (clic ou Entrée), `choisir` le remet à
    // false mais le champ reste focus — si l'utilisateur continue à taper
    // tout de suite pour changer d'avis, sans re-cliquer dans le champ,
    // aucun évènement focus ne se redéclenche. Sans ça, l'affichage restait
    // bloqué sur le fournisseur juste sélectionné pendant la frappe.
    setTexteSaisi(v)
    setEnEdition(true)
    setOuvert(true)
    setSurligne(0)
  }

  function surBlur() {
    // Laisse le temps à l'onMouseDown d'une suggestion de s'exécuter avant
    // de valider/fermer — sinon le blur (qui se déclenche avant le clic)
    // fermerait la liste avant que la sélection ait pu avoir lieu.
    setTimeout(() => {
      setOuvert(false)
      setEnEdition(false)
      const n = normaliserTexte(texteSaisi)
      const exact = (fournisseurs || []).find(f => normaliserTexte(f.nom) === n)
      if (exact) { onChange(exact.id); return }
      if (!n && value) onChange('')
      // Sinon (texte tapé qui ne correspond à rien) : on abandonne la
      // saisie sans rien changer — `enEdition` repassé à false ci-dessus
      // fait retomber l'affichage sur le fournisseur déjà sélectionné.
    }, 150)
  }

  function surTouche(e) {
    if (!ouvert && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOuvert(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurligne(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSurligne(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (suggestions[surligne]) { e.preventDefault(); choisir(suggestions[surligne]) } }
    else if (e.key === 'Escape') { setOuvert(false); inputRef.current?.blur() }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input ref={inputRef} type="text" value={texte} disabled={disabled} placeholder={placeholder}
        onChange={e => surSaisie(e.target.value)} onFocus={surFocus} onBlur={surBlur} onKeyDown={surTouche}
        style={{ cursor: disabled ? 'not-allowed' : 'text', ...style }} />
      {ouvert && !disabled && (
        suggestions.length > 0 ? (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
            background: colors.surface, border: '1px solid ' + colors.line, boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            maxHeight: 220, overflowY: 'auto',
          }}>
            {suggestions.map((f, i) => (
              <div key={f.id} onMouseDown={e => { e.preventDefault(); choisir(f) }} onMouseEnter={() => setSurligne(i)}
                style={{
                  padding: '7px 10px', fontSize: 12, fontFamily: fonts.display, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: i === surligne ? colors.bg : 'transparent', color: colors.ink,
                }}>
                {f.nom}
              </div>
            ))}
          </div>
        ) : texteNorm && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
            background: colors.surface, border: '1px solid ' + colors.line, padding: '7px 10px',
            fontSize: 12, fontFamily: fonts.display, color: colors.inkFaint, whiteSpace: 'nowrap',
          }}>
            Aucun fournisseur ne commence par "{texte}"
          </div>
        )
      )}
    </div>
  )
}
