import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { PRESETS_DELAI_PAIEMENT, fmtEUR as fmt } from '../lib/calculs'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker, statutProjetMarker } from '../lib/theme'

// Suggestions de types de contact (voir client_contacts_migration.sql) — le
// champ reste du texte libre en base, ces valeurs ne sont qu'une <datalist>
// pour accélérer la saisie des cas courants.
const TYPES_CONTACT_SUGGERES = ['Facturation', 'Livraison', 'Personnel', 'Général', 'Technique', 'Direction']

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnPrimarySmall = { ...btnPrimary, padding: '7px 14px', fontSize: 12 }
const btnGhostSmall = { ...btnGhost, padding: '7px 12px', fontSize: 12 }

// Sélecteur "Conditions de paiement" (délai en jours + case "fin de mois"),
// partagé entre le formulaire de création et le formulaire d'édition — sert
// à pré-remplir automatiquement l'échéance des factures de ce client (voir
// calculerEcheance dans lib/calculs.js et son usage dans ProjetDetail.jsx).
// Composant local (non exporté) : pas de conflit avec
// react-refresh/only-export-components puisque ce fichier n'exporte que
// le composant Clients par défaut.
function ConditionsPaiement({ jours, finMois, onChange }) {
  const actif = p => Number(jours) === p.jours && !!finMois === p.finMois
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={fieldLabel}>Conditions de paiement</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 10 }}>
        {PRESETS_DELAI_PAIEMENT.map(p => (
          <button key={p.label} type="button" onClick={() => onChange(p.jours, p.finMois)}
            style={{ background: 'none', border: 'none', padding: '0 0 3px', borderBottom: '1px solid ' + (actif(p) ? colors.ink : 'transparent'), color: actif(p) ? colors.ink : colors.inkMuted, cursor: 'pointer', fontSize: 12, fontFamily: fonts.display, fontWeight: actif(p) ? 600 : 400 }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input type="number" min="0" value={jours ?? 30} onChange={e => onChange(parseInt(e.target.value, 10) || 0, !!finMois)}
          style={{ ...inputUnderline, width: 60 }} />
        <span style={{ fontSize: 13, color: colors.inkMuted }}>jours</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: colors.inkMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!finMois} onChange={e => onChange(Number(jours) || 0, e.target.checked)} />
          Fin de mois
        </label>
      </div>
    </div>
  )
}

export default function Clients() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  // Pré-rempli quand on arrive depuis la recherche globale (Layout.jsx) —
  // faute de route dédiée par fiche client, c'est notre équivalent d'un
  // lien direct vers le bon résultat.
  const [search, setSearch] = useState(location.state?.q || '')
  const [showForm, setShowForm] = useState(false)
  const [clientOuvert, setClientOuvert] = useState(null)
  const [projets, setProjets] = useState([])
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({ nom: '', contact: '', email: '', telephone: '', adresse: '', rue: '', code_postal: '', ville: '', pays: 'FR', delai_paiement_jours: 30, delai_paiement_fin_mois: false })
  const [formEdit, setFormEdit] = useState({})
  const [error, setError] = useState('')
  const [savingClient, setSavingClient] = useState(false) // garde-fou anti double-clic
  // Contacts multiples du client ouvert (Facturation, Livraison, Personnel...)
  // — voir client_contacts_migration.sql, distincts du champ "contact" unique
  // historique conservé ci-dessus pour compatibilité avec les PDF/Pennylane.
  const [contacts, setContacts] = useState([])
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState({ type: 'Facturation', nom: '', email: '', telephone: '' })
  const [contactEnEdition, setContactEnEdition] = useState(null)
  const [contactEditForm, setContactEditForm] = useState({})
  const [contactError, setContactError] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').is('deleted_at', null).order('nom')
    setClients(data || [])
    setLoading(false)
  }

  async function ouvrirClient(c) {
    const { data: p } = await supabase.from('projets').select('*').eq('client_id', c.id).is('deleted_at', null).order('created_at', { ascending: false })
    setProjets(p || [])
    setClientOuvert(c)
    setEditMode(false)
    setShowContactForm(false)
    setContactEnEdition(null)
    setContactError('')
    fetchContacts(c.id)
  }

  async function fetchContacts(clientId) {
    const { data } = await supabase.from('client_contacts').select('*').eq('client_id', clientId).is('deleted_at', null).order('created_at')
    setContacts(data || [])
  }

  async function ajouterContact() {
    if (savingContact) return
    setContactError('')
    if (!contactForm.type.trim()) { setContactError('Le type de contact est obligatoire.'); return }
    setSavingContact(true)
    const { data, error } = await supabase.from('client_contacts')
      .insert([{ client_id: clientOuvert.id, type: contactForm.type.trim(), nom: contactForm.nom.trim() || null, email: contactForm.email.trim() || null, telephone: contactForm.telephone.trim() || null }])
      .select().single()
    setSavingContact(false)
    if (error) { setContactError('Erreur : ' + error.message); return }
    setContacts(prev => [...prev, data])
    setContactForm({ type: 'Facturation', nom: '', email: '', telephone: '' })
    setShowContactForm(false)
  }

  function commencerEditionContact(c) {
    setContactEnEdition(c.id)
    setContactEditForm({ type: c.type || '', nom: c.nom || '', email: c.email || '', telephone: c.telephone || '' })
    setContactError('')
  }

  async function sauvegarderContact() {
    if (!contactEditForm.type?.trim()) { setContactError('Le type de contact est obligatoire.'); return }
    const champs = { type: contactEditForm.type.trim(), nom: contactEditForm.nom?.trim() || null, email: contactEditForm.email?.trim() || null, telephone: contactEditForm.telephone?.trim() || null }
    const { data, error } = await supabase.from('client_contacts').update(champs).eq('id', contactEnEdition).select().single()
    if (error) { setContactError('Erreur : ' + error.message); return }
    setContacts(prev => prev.map(c => c.id === contactEnEdition ? data : c))
    setContactEnEdition(null)
  }

  async function supprimerContact(contactId) {
    if (!confirm('Supprimer ce contact ? (récupérable depuis la Corbeille)')) return
    const { error } = await supabase.from('client_contacts').update({ deleted_at: new Date().toISOString() }).eq('id', contactId)
    if (error) { alert('Erreur lors de la suppression du contact : ' + error.message); return }
    setContacts(prev => prev.filter(c => c.id !== contactId))
  }

  async function creerClient() {
    if (savingClient) return
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    setSavingClient(true)
    const { data, error } = await supabase.from('clients').insert([{ ...form }]).select().single()
    if (error) { setError('Erreur : ' + error.message); setSavingClient(false); return }
    setShowForm(false)
    setForm({ nom: '', contact: '', email: '', telephone: '', adresse: '', rue: '', code_postal: '', ville: '', pays: 'FR', delai_paiement_jours: 30, delai_paiement_fin_mois: false })
    await fetchClients()
    setSavingClient(false)
    ouvrirClient(data)
  }

  async function sauvegarderClient() {
    const { error } = await supabase.from('clients').update(formEdit).eq('id', clientOuvert.id)
    if (error) { alert('Erreur lors de l\'enregistrement : ' + error.message); return }
    setClientOuvert(prev => ({ ...prev, ...formEdit }))
    setClients(prev => prev.map(c => c.id === clientOuvert.id ? { ...c, ...formEdit } : c))
    setEditMode(false)
  }

  async function supprimerClient(id) {
    if (!confirm('Déplacer ce client vers la corbeille ? Tu pourras le restaurer depuis la Corbeille pendant 30 jours.')) return
    // Suppression douce (deleted_at) au lieu d'un DELETE définitif — voir
    // sql/06_corbeille_soft_delete.sql et la page Corbeille.
    const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erreur lors de la suppression : ' + error.message); return }
    setClientOuvert(null)
    fetchClients()
  }

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact?.toLowerCase().includes(search.toLowerCase())
  )

  // ── Fiche client ─────────────────────────────────────────────
  if (clientOuvert) {
    const totalCA = projets.reduce((s, p) => s + (p.montant_ht || 0), 0)
    return (
      <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, marginBottom: 40 }}>
          <button onClick={() => setClientOuvert(null)} style={{ ...quietLink, marginBottom: 4 }}>← Clients</button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={eyebrow}>Client</p>
            <h1 style={{ margin: '10px 0 0', fontSize: isMobile ? 24 : 30, fontWeight: 700, letterSpacing: '-0.015em' }}>{clientOuvert.nom}</h1>
            {clientOuvert.adresse && <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 6 }}>{clientOuvert.adresse}</div>}
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <button onClick={() => { setEditMode(true); setFormEdit({ nom: clientOuvert.nom, contact: clientOuvert.contact || '', email: clientOuvert.email || '', telephone: clientOuvert.telephone || '', adresse: clientOuvert.adresse || '', rue: clientOuvert.rue || '', code_postal: clientOuvert.code_postal || '', ville: clientOuvert.ville || '', pays: clientOuvert.pays || 'FR', delai_paiement_jours: clientOuvert.delai_paiement_jours ?? 30, delai_paiement_fin_mois: clientOuvert.delai_paiement_fin_mois ?? false }) }}
              style={quietLink}>Modifier</button>
            <button onClick={() => supprimerClient(clientOuvert.id)} style={quietLink}>Supprimer</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: isMobile ? 36 : 48 }}>
          {/* Colonne gauche — infos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

            {/* Infos contact */}
            <div>
              <h2 style={sectionTitle}>Contact</h2>
              <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12, paddingTop: 16 }}>
                {editMode ? (
                  <div>
                    {[['nom', 'Nom'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['adresse', 'Adresse'], ['rue', 'Rue (pour Pennylane)'], ['code_postal', 'Code postal (pour Pennylane)'], ['ville', 'Ville (pour Pennylane)'], ['pays', 'Pays (code, ex: FR)']].map(([key, lbl]) => (
                      <div key={key} style={{ marginBottom: 16 }}>
                        <label style={fieldLabel}>{lbl}</label>
                        <input value={formEdit[key] || ''} onChange={e => setFormEdit(p => ({ ...p, [key]: e.target.value }))}
                          style={inputUnderline} />
                      </div>
                    ))}
                    <ConditionsPaiement jours={formEdit.delai_paiement_jours} finMois={formEdit.delai_paiement_fin_mois}
                      onChange={(j, f) => setFormEdit(p => ({ ...p, delai_paiement_jours: j, delai_paiement_fin_mois: f }))} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setEditMode(false)} style={btnGhostSmall}>Annuler</button>
                      <button onClick={sauvegarderClient} style={btnPrimarySmall}>Sauvegarder</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {[
                      ['Contact', clientOuvert.contact],
                      ['Email', clientOuvert.email],
                      ['Téléphone', clientOuvert.telephone],
                      ['Adresse', clientOuvert.adresse],
                      ['Rue', clientOuvert.rue],
                      ['Code postal', clientOuvert.code_postal],
                      ['Ville', clientOuvert.ville],
                    ].map(([lbl, val]) => val ? (
                      <div key={lbl} style={{ marginBottom: 12 }}>
                        <div style={fieldLabel}>{lbl}</div>
                        <div style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>{val}</div>
                      </div>
                    ) : null)}
                    {!clientOuvert.contact && !clientOuvert.email && !clientOuvert.telephone && (
                      <div style={{ fontSize: 13, color: colors.inkFaint, fontStyle: 'italic' }}>Aucune info de contact</div>
                    )}
                    <div>
                      <div style={fieldLabel}>Conditions</div>
                      <div style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>
                        {(clientOuvert.delai_paiement_jours ?? 30) === 0 ? 'Comptant' : (clientOuvert.delai_paiement_jours ?? 30) + ' jours' + (clientOuvert.delai_paiement_fin_mois ? ' fin de mois' : '')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Contacts multiples (facturation, livraison, personnel...) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={sectionTitle}>Contacts</h2>
                <button onClick={() => { setShowContactForm(v => !v); setContactError('') }} style={quietLink}>{showContactForm ? 'Annuler' : '+ Ajouter'}</button>
              </div>
              <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12, paddingTop: 16 }}>
                <datalist id="types-contact-suggeres">
                  {TYPES_CONTACT_SUGGERES.map(t => <option key={t} value={t} />)}
                </datalist>

                {contactError && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{contactError}</div>}

                {showContactForm && (
                  <div style={{ borderBottom: '1px solid ' + colors.line, paddingBottom: 16, marginBottom: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={fieldLabel}>Type</label>
                      <input list="types-contact-suggeres" value={contactForm.type} onChange={e => setContactForm(p => ({ ...p, type: e.target.value }))}
                        placeholder="Ex : Facturation, Livraison..."
                        style={inputUnderline} />
                    </div>
                    {[['nom', 'Nom'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([key, lbl]) => (
                      <div key={key} style={{ marginBottom: 12 }}>
                        <label style={fieldLabel}>{lbl}</label>
                        <input value={contactForm[key]} onChange={e => setContactForm(p => ({ ...p, [key]: e.target.value }))}
                          style={inputUnderline} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                      <button onClick={() => { setShowContactForm(false); setContactError('') }} style={btnGhostSmall}>Annuler</button>
                      <button onClick={ajouterContact} disabled={savingContact}
                        style={{ ...btnPrimarySmall, cursor: savingContact ? 'default' : 'pointer', opacity: savingContact ? 0.6 : 1 }}>{savingContact ? 'Ajout...' : 'Ajouter'}</button>
                    </div>
                  </div>
                )}

                {contacts.length === 0 && !showContactForm ? (
                  <div style={{ fontSize: 13, color: colors.inkFaint, fontStyle: 'italic' }}>Aucun contact secondaire</div>
                ) : (
                  <div>
                    {contacts.map(c => (
                      contactEnEdition === c.id ? (
                        <div key={c.id} style={{ borderBottom: '1px solid ' + colors.line, padding: '14px 0' }}>
                          <input list="types-contact-suggeres" value={contactEditForm.type} onChange={e => setContactEditForm(p => ({ ...p, type: e.target.value }))}
                            placeholder="Type"
                            style={{ ...inputUnderline, marginBottom: 10 }} />
                          {[['nom', 'Nom'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([key, lbl]) => (
                            <input key={key} value={contactEditForm[key] || ''} onChange={e => setContactEditForm(p => ({ ...p, [key]: e.target.value }))}
                              placeholder={lbl}
                              style={{ ...inputUnderline, marginBottom: 10 }} />
                          ))}
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setContactEnEdition(null)} style={btnGhostSmall}>Annuler</button>
                            <button onClick={sauvegarderContact} style={btnPrimarySmall}>Enregistrer</button>
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
                            <button onClick={() => commencerEditionContact(c)} style={quietLink}>Modifier</button>
                            <button onClick={() => supprimerContact(c.id)} style={quietLink}>Supprimer</button>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div>
              <h2 style={sectionTitle}>Statistiques</h2>
              <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
                {[
                  ['Projets', projets.length],
                  ['CA total', fmt(totalCA)],
                  ['En cours', projets.filter(p => p.statut === 'En cours').length],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ borderBottom: '1px solid ' + colors.line, padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, color: colors.inkMuted }}>{lbl}</span>
                    <span style={{ fontFamily: fonts.mono, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Colonne droite — projets */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={sectionTitle}>Projets ({projets.length})</h2>
              <button onClick={() => navigate('/projets')} style={quietLink}>+ Nouveau projet</button>
            </div>
            <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
              {projets.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>
                  Aucun projet pour ce client
                </div>
              ) : projets.map(p => (
                <div key={p.id} onClick={() => navigate('/projets/' + p.id)}
                  style={{ padding: '14px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nom}</div>
                    <div style={{ fontSize: 11.5, color: colors.inkMuted, marginTop: 3 }}>
                      {p.date_debut ? new Date(p.date_debut).toLocaleDateString('fr-FR') : ''}
                      {p.date_fin_prevue ? ' → ' + new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 14, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{fmt(p.montant_ht)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted, justifyContent: 'flex-end' }}>
                      <span style={marker(statutProjetMarker[p.statut])} />{p.statut}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Liste clients ─────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Clients</h1>
        </div>
        <button onClick={() => { setShowForm(true); setError('') }} style={btnPrimary}>
          + Nouveau client
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un client..."
        style={{ ...inputUnderline, marginBottom: 32, paddingBottom: 12 }} />

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div style={{ background: colors.surface, padding: isMobile ? 22 : 32, width: isMobile ? '100%' : 480, maxWidth: '100%', maxHeight: isMobile ? '90vh' : 'none', overflow: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700 }}>Nouveau client</h3>
            {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
            {[['nom', 'Nom *'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['adresse', 'Adresse'], ['rue', 'Rue (pour Pennylane)'], ['code_postal', 'Code postal (pour Pennylane)'], ['ville', 'Ville (pour Pennylane)'], ['pays', 'Pays (code, ex: FR)']].map(([key, lbl]) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={fieldLabel}>{lbl}</label>
                <input value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  style={inputUnderline} />
              </div>
            ))}
            <ConditionsPaiement jours={form.delai_paiement_jours} finMois={form.delai_paiement_fin_mois}
              onChange={(j, f) => setForm(prev => ({ ...prev, delai_paiement_jours: j, delai_paiement_fin_mois: f }))} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => { setShowForm(false); setError('') }} style={btnGhost}>Annuler</button>
              <button onClick={creerClient} disabled={savingClient}
                style={{ ...btnPrimary, cursor: savingClient ? 'default' : 'pointer', opacity: savingClient ? 0.6 : 1 }}>{savingClient ? 'Création...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucun client</div>
          </div>
        ) : (
          <div>
            {filtered.map(c => (
              <div key={c.id} onClick={() => ouvrirClient(c)}
                style={{ borderTop: '1px solid ' + colors.line, padding: '16px 0', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.nom}</div>
                  <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 3 }}>
                    {[c.contact, c.email, c.telephone].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
