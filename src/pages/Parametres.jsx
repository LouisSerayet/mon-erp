import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow } from '../lib/theme'

// "Mes informations" — chaque utilisateur y renseigne son nom et son
// téléphone (table profils_utilisateurs, voir
// sql/profils_utilisateurs_migration.sql). Ces coordonnées remplacent
// automatiquement celles de Louis (ENTREPRISE.contact) sur les devis,
// factures et bons de commande des projets que cet utilisateur crée — voir
// src/lib/contacts.js (contactPourProjet) et projets.created_by_email.
// L'email n'est pas modifiable ici : c'est celui du compte de connexion,
// déjà connu et utilisé pour retrouver la bonne fiche.

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 14, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 22px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }

export default function Parametres() {
  const isMobile = useIsMobile()
  const { session } = useAuth()
  const email = session?.user?.email || ''
  const [loading, setLoading] = useState(true)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('profils_utilisateurs').select('nom, telephone').eq('user_id', session.user.id).maybeSingle()
      setNom(data?.nom || '')
      setTelephone(data?.telephone || '')
      setLoading(false)
    })()
  }, [session?.user?.id])

  async function enregistrer() {
    if (!session?.user?.id) return
    setSaving(true); setError(''); setEnregistre(false)
    const { error: err } = await supabase.from('profils_utilisateurs')
      .upsert({ user_id: session.user.id, email, nom: nom.trim(), telephone: telephone.trim() }, { onConflict: 'user_id' })
    if (err) { setError('Erreur : ' + err.message); setSaving(false); return }
    setSaving(false)
    setEnregistre(true)
  }

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 520, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Mes informations</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
        Ton nom et ton téléphone apparaissent comme contact sur les devis, factures et bons de commande des projets que tu crées — à la place de ceux de Louis par défaut.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
      ) : (
        <div style={{ marginTop: 36 }}>
          {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 20, fontSize: 13 }}>{error}</div>}

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabel}>Email (compte de connexion)</label>
            <div style={{ fontSize: 14, color: colors.inkMuted, padding: '8px 2px' }}>{email || '—'}</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabel}>Nom affiché sur les documents</label>
            <input value={nom} onChange={e => { setNom(e.target.value); setEnregistre(false) }} placeholder="Ex. Louis Serayet"
              style={inputUnderline} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={fieldLabel}>Téléphone</label>
            <input value={telephone} onChange={e => { setTelephone(e.target.value); setEnregistre(false) }} placeholder="Ex. 06 11 24 50 39"
              style={inputUnderline} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={enregistrer} disabled={saving}
              style={{ ...btnPrimary, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            {enregistre && <span style={{ fontSize: 12.5, color: colors.success }}>Enregistré.</span>}
          </div>

          {!nom.trim() && (
            <p style={{ color: colors.inkFaint, fontSize: 11.5, marginTop: 28, lineHeight: 1.5 }}>
              Tant que ce champ est vide, les documents des projets que tu crées affichent les coordonnées par défaut de Partenaires Particuliers.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
