import { useEffect, useMemo } from 'react'
import { colors, fonts } from '../lib/theme'

// Aperçu visuel d'un PDF généré (devis, commande, facture client) avant de
// le télécharger ou de l'envoyer — évite de devoir télécharger le fichier
// juste pour vérifier son rendu. `doc` est un document jsPDF déjà généré
// (voir ProjetDetail.jsx : previewDoc, calculé selon pdfPreview.tipo) ; ce
// composant se contente de l'afficher dans un cadre et de proposer les
// actions courantes. Le blob affiché est régénéré par le parent à chaque
// changement de langue (voir onLangChange) — ce composant ne fait que
// transformer le doc courant en URL affichable et la libérer proprement.
export default function PdfPreviewModal({ titre, doc, lang, onLangChange, onTelecharger, onEnvoyer, onClose }) {
  // L'URL est dérivée du doc pendant le rendu (useMemo), pas depuis un
  // effet — seule sa libération (revokeObjectURL), un pur effet de bord
  // externe sans mise à jour d'état React, a besoin d'un useEffect.
  const url = useMemo(() => (doc ? URL.createObjectURL(doc.output('blob')) : ''), [doc])
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [url])

  if (!doc) return null

  const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '9px 16px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
  const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '9px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
  const langBtn = actif => ({
    background: 'none', border: 'none', borderBottom: '2px solid ' + (actif ? colors.ink : 'transparent'),
    padding: '0 0 4px', fontSize: 12.5, fontFamily: fonts.display, color: actif ? colors.ink : colors.inkFaint,
    fontWeight: actif ? 600 : 400, cursor: 'pointer',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: colors.surface, width: 'min(860px, 100%)', height: 'min(92vh, 1100px)', display: 'flex', flexDirection: 'column', border: '1px solid ' + colors.line, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid ' + colors.line, flexShrink: 0, gap: 14, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, fontFamily: fonts.display, color: colors.ink }}>{titre}</h3>
          {onLangChange && (
            <div style={{ display: 'flex', gap: 14 }}>
              <button onClick={() => onLangChange('fr')} style={langBtn(lang === 'fr')}>FR</button>
              <button onClick={() => onLangChange('en')} style={langBtn(lang === 'en')}>EN</button>
            </div>
          )}
        </div>
        <iframe src={url} title={titre} style={{ flex: 1, border: 'none', width: '100%', background: colors.bg }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid ' + colors.line, flexShrink: 0 }}>
          <button onClick={onClose} style={btnGhost}>Fermer</button>
          {onEnvoyer && <button onClick={onEnvoyer} style={btnGhost}>Envoyer par email</button>}
          <button onClick={onTelecharger} style={btnPrimary}>Télécharger</button>
        </div>
      </div>
    </div>
  )
}
