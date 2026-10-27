import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useMonRole } from '../lib/useMonRole'
import { ROLES } from '../lib/roles'
import { DROITS } from '../lib/droits'
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
//
// Pour un Gérant, cette page affiche aussi "Rôles de l'équipe" (liste des
// utilisateurs, rôle modifiable directement — voir
// sql/roles_utilisateurs_migration.sql) et "Droits par rôle" (quelle
// action est permise pour quel rôle — voir sql/droits_roles_migration.sql
// et src/lib/droits.js pour le catalogue des droits existants, et
// useDroits() dans le reste de l'appli pour leur usage réel).

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 14, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 22px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const selectRole = {
  padding: '6px 8px', background: colors.surface, border: '1px solid ' + colors.line, borderRadius: 4,
  fontSize: 13, fontFamily: fonts.display, color: colors.ink, cursor: 'pointer',
}

export default function Parametres() {
  const isMobile = useIsMobile()
  const { session } = useAuth()
  const monRole = useMonRole()
  const email = session?.user?.email || ''
  const [loading, setLoading] = useState(true)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [enregistre, setEnregistre] = useState(false)

  const [equipe, setEquipe] = useState([])
  const [loadingEquipe, setLoadingEquipe] = useState(false)
  const [errorEquipe, setErrorEquipe] = useState('')
  const [idEnCours, setIdEnCours] = useState(null)

  // table (role -> droit -> actif), voir sql/droits_roles_migration.sql
  const [droitsRoles, setDroitsRoles] = useState({})
  const [loadingDroits, setLoadingDroits] = useState(false)
  const [errorDroits, setErrorDroits] = useState('')
  const [droitEnCours, setDroitEnCours] = useState(null)

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

  useEffect(() => {
    if (monRole !== 'Gérant') return
    (async () => {
      setLoadingEquipe(true); setErrorEquipe('')
      const { data, error: err } = await supabase.rpc('profils_utilisateurs_tous')
      if (err) { setErrorEquipe('Erreur : ' + err.message); setLoadingEquipe(false); return }
      setEquipe(data || [])
      setLoadingEquipe(false)
    })()
  }, [monRole])

  useEffect(() => {
    if (monRole !== 'Gérant') return
    (async () => {
      setLoadingDroits(true); setErrorDroits('')
      const { data, error: err } = await supabase.from('droits_roles').select('role, droit, actif')
      if (err) { setErrorDroits('Erreur : ' + err.message); setLoadingDroits(false); return }
      const table = {}
      for (const d of data || []) {
        if (!table[d.role]) table[d.role] = {}
        table[d.role][d.droit] = d.actif
      }
      setDroitsRoles(table)
      setLoadingDroits(false)
    })()
  }, [monRole])

  async function enregistrer() {
    if (!session?.user?.id) return
    setSaving(true); setError(''); setEnregistre(false)
    const { error: err } = await supabase.from('profils_utilisateurs')
      .upsert({ user_id: session.user.id, email, nom: nom.trim(), telephone: telephone.trim() }, { onConflict: 'user_id' })
    if (err) { setError('Erreur : ' + err.message); setSaving(false); return }
    setSaving(false)
    setEnregistre(true)
  }

  async function changerRole(userId, nouveauRole) {
    setIdEnCours(userId); setErrorEquipe('')
    const { error: err } = await supabase.rpc('definir_role_utilisateur', { p_user_id: userId, p_role: nouveauRole })
    setIdEnCours(null)
    if (err) { setErrorEquipe('Erreur : ' + err.message); return }
    setEquipe(prev => prev.map(u => u.user_id === userId ? { ...u, role: nouveauRole } : u))
  }

  async function toggleDroit(role, cle, actuel) {
    const nouveauActif = !actuel
    const id = role + '|' + cle
    setDroitEnCours(id); setErrorDroits('')
    const { error: err } = await supabase.from('droits_roles').update({ actif: nouveauActif }).eq('role', role).eq('droit', cle)
    setDroitEnCours(null)
    if (err) { setErrorDroits('Erreur : ' + err.message); return }
    setDroitsRoles(prev => ({ ...prev, [role]: { ...prev[role], [cle]: nouveauActif } }))
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

      {monRole === 'Gérant' && (
        <div style={{ marginTop: 56, paddingTop: 36, borderTop: '1px solid ' + colors.line }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Rôles de l'équipe</h2>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
            Visible uniquement par toi (Gérant). Ces rôles ne restreignent encore aucune action dans l'ERP — c'est la première étape avant d'ajouter de vraies règles par rôle.
          </p>

          {errorEquipe && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', margin: '20px 0', fontSize: 13 }}>{errorEquipe}</div>}

          {loadingEquipe ? (
            <div style={{ textAlign: 'center', padding: 40, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
          ) : (
            <div style={{ marginTop: 24 }}>
              {equipe.map(u => (
                <div key={u.user_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 0', borderBottom: '1px solid ' + colors.line,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{u.nom || u.email}</div>
                    {u.nom && <div style={{ fontSize: 12, color: colors.inkFaint, marginTop: 2 }}>{u.email}</div>}
                  </div>
                  <select
                    value={u.role || 'Collaborateur'}
                    disabled={idEnCours === u.user_id}
                    onChange={e => changerRole(u.user_id, e.target.value)}
                    style={{ ...selectRole, opacity: idEnCours === u.user_id ? 0.6 : 1 }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
              {equipe.length === 0 && (
                <p style={{ color: colors.inkFaint, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucun utilisateur trouvé.</p>
              )}
            </div>
          )}
        </div>
      )}

      {monRole === 'Gérant' && (
        <div style={{ marginTop: 56, paddingTop: 36, borderTop: '1px solid ' + colors.line }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 19 : 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Droits par rôle</h2>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>
            Coche, pour chaque rôle, les actions qu'il peut effectuer dans l'ERP. Un changement prend effet immédiatement pour les personnes concernées.
          </p>

          {errorDroits && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', margin: '20px 0', fontSize: 13 }}>{errorDroits}</div>}

          {loadingDroits ? (
            <div style={{ textAlign: 'center', padding: 40, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
          ) : (
            <div style={{ marginTop: 24, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 480 : undefined }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0 10px 10px 0', fontWeight: 500, color: colors.inkMuted }}></th>
                    {ROLES.map(r => (
                      <th key={r} style={{ padding: '0 10px 10px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: colors.inkMuted }}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DROITS.map(d => (
                    <tr key={d.cle} style={{ borderTop: '1px solid ' + colors.line }}>
                      <td style={{ padding: '10px 10px 10px 0', color: colors.ink }}>{d.label}</td>
                      {ROLES.map(r => {
                        const actif = !!(droitsRoles[r] && droitsRoles[r][d.cle])
                        const id = r + '|' + d.cle
                        return (
                          <td key={r} style={{ padding: '10px', textAlign: 'center' }}>
                            <input type="checkbox" checked={actif} disabled={droitEnCours === id}
                              onChange={() => toggleDroit(r, d.cle, actif)}
                              style={{ width: 16, height: 16, cursor: 'pointer', opacity: droitEnCours === id ? 0.5 : 1 }} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
