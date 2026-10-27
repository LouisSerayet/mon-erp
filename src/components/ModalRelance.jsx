import { colors, fonts, quietLink } from '../lib/theme'
import { useIsMobile } from '../lib/useIsMobile'

// Ajoute/retire une adresse du champ "À" (chaîne d'emails séparés par une
// virgule) — même principe que toggleDestinataireEmail dans
// ProjetDetail.jsx (modale d'envoi de facture/commande).
function toggleDestinataire(setModalRelance, email) {
  setModalRelance(prev => {
    if (!prev) return prev
    const actuels = prev.to.split(',').map(e => e.trim()).filter(Boolean)
    const dejaPresent = actuels.some(e => e.toLowerCase() === email.toLowerCase())
    const nouveaux = dejaPresent ? actuels.filter(e => e.toLowerCase() !== email.toLowerCase()) : [...actuels, email]
    return { ...prev, to: nouveaux.join(', ') }
  })
}

// Modale d'aperçu/édition avant l'envoi d'une relance — voir
// src/lib/useRelance.js, qui fournit toutes les props ci-dessous
// (`<ModalRelance {...useRelance()} />`). L'email ne part jamais
// directement au clic sur "Relancer", il faut valider (et éventuellement
// corriger le contenu, ou cocher des destinataires en plus) ici.
export function ModalRelance({ modalRelance, setModalRelance, modalRelanceBusy, modalRelanceError, modalRelanceDraftBusy, envoyerRelanceDepuisModal, creerBrouillonDepuisModal }) {
  const isMobile = useIsMobile()
  if (!modalRelance) return null

  const destinatairesActifs = modalRelance.to.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.45)', zIndex: 200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 14 }}>
      <div style={{ background: colors.surface, padding: isMobile ? 20 : 32, width: isMobile ? '100%' : 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 22px', fontSize: 16, fontWeight: 600 }}>Relance par email</h3>

        {modalRelanceError && (
          <div style={{ background: colors.dangerBg, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
            {modalRelanceError}
          </div>
        )}

        {/* Contacts secondaires du client (Facturation, Livraison...) à
            cocher en plus de l'email principal — voir client_contacts et
            useRelance.ouvrirRelance. N'apparaît que s'il y en a au moins un
            (sinon le champ "À" ci-dessous suffit). */}
        {modalRelance.destinatairesDisponibles?.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Destinataires</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {modalRelance.destinatairesDisponibles.map(d => {
                const actif = destinatairesActifs.includes(d.email.toLowerCase())
                return (
                  <label key={d.email} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', color: actif ? colors.ink : colors.inkMuted }}>
                    <input type="checkbox" checked={actif} onChange={() => toggleDestinataire(setModalRelance, d.email)} />
                    {d.label}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>À</label>
        <input value={modalRelance.to} onChange={e => setModalRelance(p => ({ ...p, to: e.target.value }))} placeholder="Séparer plusieurs adresses par une virgule"
          style={{ width: '100%', padding: '9px 0', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 18, fontFamily: fonts.display, background: 'transparent' }} />

        <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Objet</label>
        <input value={modalRelance.subject} onChange={e => setModalRelance(p => ({ ...p, subject: e.target.value }))}
          style={{ width: '100%', padding: '9px 0', border: 'none', borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 18, fontFamily: fonts.display, background: 'transparent' }} />

        <label style={{ display: 'block', fontSize: 11, color: colors.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Message</label>
        <textarea value={modalRelance.body} onChange={e => setModalRelance(p => ({ ...p, body: e.target.value }))} rows={9}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box', marginBottom: 22, fontFamily: 'inherit', resize: 'vertical', background: 'transparent' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={creerBrouillonDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to} style={{ ...quietLink, fontSize: 12 }}>
            {modalRelanceDraftBusy ? 'Création du brouillon...' : 'ou créer un brouillon dans Outlook'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setModalRelance(null)} disabled={modalRelanceBusy}
              style={{ padding: '9px 18px', border: '1px solid ' + colors.line, background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: fonts.display, color: colors.ink }}>Annuler</button>
            <button onClick={envoyerRelanceDepuisModal} disabled={modalRelanceBusy || modalRelanceDraftBusy || !modalRelance.to}
              style={{ padding: '9px 20px', border: 'none', background: colors.ink, color: colors.surface, cursor: 'pointer', fontWeight: 500, fontSize: 13, fontFamily: fonts.display }}>
              {modalRelanceBusy ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
