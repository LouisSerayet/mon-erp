import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { colors, fonts, sectionTitle, quietLink } from '../lib/theme'

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimarySmall = { background: colors.ink, color: colors.surface, border: 'none', padding: '7px 14px', fontSize: 12, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhostSmall = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '7px 12px', fontSize: 12, fontFamily: fonts.display, cursor: 'pointer' }

// Section "Contacts" — plusieurs contacts nommés par tiers (ex: un contact
// Facturation, un contact Commercial, un contact Livraison...), en plus des
// champs contact/email/telephone uniques déjà présents sur la fiche (ceux-là
// restent inchangés, utilisés tels quels par les PDF devis/factures,
// Pennylane, etc.). Partagé entre Clients.jsx (table client_contacts,
// client_contacts_migration.sql) et Fournisseurs.jsx (table
// fournisseur_contacts, fournisseur_contacts_migration.sql) — mêmes besoins,
// mêmes règles (suppression douce, type en texte libre), un seul composant
// à faire évoluer plutôt que deux copies qui risquent de diverger. Voir la
// demande de Louis (ajouter plusieurs emails type "facturation"/"commercial"
// sur une fiche) — déjà disponible côté Clients avant cette extraction,
// étendu ici aux Fournisseurs.
//
// `table` : nom de la table ('client_contacts' | 'fournisseur_contacts').
// `ownerIdColumn` : colonne de clé étrangère ('client_id' | 'fournisseur_id').
// `ownerId` : id du client/fournisseur dont on affiche les contacts.
// `typesSuggeres` : suggestions de type proposées dans une <datalist> — texte
// libre en base, n'importe quelle valeur reste acceptée.
export function ContactsMultiples({ table, ownerIdColumn, ownerId, typesSuggeres }) {
  const [contacts, setContacts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: typesSuggeres[0] || 'Général', nom: '', email: '', telephone: '' })
  const [enEdition, setEnEdition] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const datalistId = table + '-types-suggeres'

  useEffect(() => { fetchContacts() }, [ownerId])

  async function fetchContacts() {
    if (!ownerId) { setContacts([]); return }
    const { data } = await supabase.from(table).select('*').eq(ownerIdColumn, ownerId).is('deleted_at', null).order('created_at')
    setContacts(data || [])
  }

  async function ajouter() {
    if (saving) return
    setError('')
    if (!form.type.trim()) { setError('Le type de contact est obligatoire.'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from(table)
      .insert([{ [ownerIdColumn]: ownerId, type: form.type.trim(), nom: form.nom.trim() || null, email: form.email.trim() || null, telephone: form.telephone.trim() || null }])
      .select().single()
    setSaving(false)
    if (err) { setError('Erreur : ' + err.message + (err.message?.includes('relation') ? ' — la migration sql/' + table + '_migration.sql a-t-elle été exécutée dans Supabase ?' : '')); return }
    setContacts(prev => [...prev, data])
    setForm({ type: typesSuggeres[0] || 'Général', nom: '', email: '', telephone: '' })
    setShowForm(false)
  }

  function commencerEdition(c) {
    setEnEdition(c.id)
    setEditForm({ type: c.type || '', nom: c.nom || '', email: c.email || '', telephone: c.telephone || '' })
    setError('')
  }

  async function sauvegarder() {
    if (!editForm.type?.trim()) { setError('Le type de contact est obligatoire.'); return }
    const champs = { type: editForm.type.trim(), nom: editForm.nom?.trim() || null, email: editForm.email?.trim() || null, telephone: editForm.telephone?.trim() || null }
    const { data, error: err } = await supabase.from(table).update(champs).eq('id', enEdition).select().single()
    if (err) { setError('Erreur : ' + err.message); return }
    setContacts(prev => prev.map(c => c.id === enEdition ? data : c))
    setEnEdition(null)
  }

  async function supprimer(id) {
    if (!confirm('Supprimer ce contact ? (récupérable depuis la Corbeille)')) return
    const { error: err } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (err) { alert('Erreur lors de la suppression du contact : ' + err.message); return }
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionTitle}>Contacts</h2>
        <button onClick={() => { setShowForm(v => !v); setError('') }} style={quietLink}>{showForm ? 'Annuler' : '+ Ajouter'}</button>
      </div>
      <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12, paddingTop: 16 }}>
        <datalist id={datalistId}>
          {typesSuggeres.map(t => <option key={t} value={t} />)}
        </datalist>

        {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{error}</div>}

        {showForm && (
          <div style={{ borderBottom: '1px solid ' + colors.line, paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={fieldLabel}>Type</label>
              <input list={datalistId} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                placeholder="Ex : Facturation, Commercial..."
                style={inputUnderline} />
            </div>
            {[['nom', 'Nom'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([key, lbl]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={fieldLabel}>{lbl}</label>
                <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={inputUnderline} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowForm(false); setError('') }} style={btnGhostSmall}>Annuler</button>
              <button onClick={ajouter} disabled={saving}
                style={{ ...btnPrimarySmall, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Ajout...' : 'Ajouter'}</button>
            </div>
          </div>
        )}

        {contacts.length === 0 && !showForm ? (
          <div style={{ fontSize: 13, color: colors.inkFaint, fontStyle: 'italic' }}>Aucun contact secondaire</div>
        ) : (
          <div>
            {contacts.map(c => (
              enEdition === c.id ? (
                <div key={c.id} style={{ borderBottom: '1px solid ' + colors.line, padding: '14px 0' }}>
                  <input list={datalistId} value={editForm.type} onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}
                    placeholder="Type"
                    style={{ ...inputUnderline, marginBottom: 10 }} />
                  {[['nom', 'Nom'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([key, lbl]) => (
                    <input key={key} value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={lbl}
                      style={{ ...inputUnderline, marginBottom: 10 }} />
                  ))}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEnEdition(null)} style={btnGhostSmall}>Annuler</button>
                    <button onClick={sauvegarder} style={btnPrimarySmall}>Enregistrer</button>
                  </div>
                </div>
              ) : (
                <div key={c.id} style={{ borderBottom: '1px solid ' + colors.line, padding: '12px 0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{c.type}</div>
                    <div style={{ fontSize: 13, color: colors.ink, fontWeight: 500, marginTop: 4 }}>{c.nom || '—'}</div>
                    <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 2 }}>{[c.email, c.telephone].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                    <button onClick={() => commencerEdition(c)} style={quietLink}>Modifier</button>
                    <button onClick={() => supprimer(c.id)} style={quietLink}>Supprimer</button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
