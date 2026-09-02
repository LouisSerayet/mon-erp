import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt } from '../lib/calculs'
import { colors, fonts, eyebrow, quietLink, marker, statutProjetMarker } from '../lib/theme'

// 'Brouillon' = devis en préparation (pas encore envoyé) ; 'Perdu' = devis
// refusé / projet abandonné. Un projet démarre toujours en 'Brouillon' et
// devient un devis "réel" (Rentabilité, etc.) dès sa création — voir
// ProjetDetail.jsx pour le détail du cycle de vie et le bouton "Marquer perdu".
const STATUTS = ['Brouillon', 'Devis envoyé', 'Devis signé', 'En cours', 'Finalisation', 'Clôturé', 'Perdu']
const TAUX_TVA_OPTIONS = [20, 10, 5.5, 0]

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const label = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }

export default function Projets() {
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('Tous')
  // 'date' garde l'ordre naturel de fetchAll (created_at décroissant) ;
  // 'statut' regroupe les projets par étape du cycle de vie (voir STATUTS
  // plus haut, qui donne déjà l'ordre du workflow) — pratique pour voir
  // d'un coup d'œil tous les devis envoyés, tous les chantiers en cours...
  const [tri, setTri] = useState('statut')
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ nom: '', client_id: '', statut: 'Brouillon', taux_tva: 20, date_debut: '', date_fin_prevue: '', notes: '' })
  const [error, setError] = useState('')
  const [savingProjet, setSavingProjet] = useState(false) // garde-fou anti double-clic
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('projets').select('*, clients(nom)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nom').is('deleted_at', null).order('nom')
    ])
    setProjets(p || [])
    setClients(c || [])
    setLoading(false)
  }

  async function creerProjet() {
    if (savingProjet) return
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    setSavingProjet(true)
    const { data, error } = await supabase.from('projets').insert([{
      nom: form.nom.trim(),
      client_id: form.client_id || null,
      statut: form.statut,
      taux_tva: form.taux_tva ?? 20,
      date_debut: form.date_debut || null,
      date_fin_prevue: form.date_fin_prevue || null,
      notes: form.notes,
      montant_ht: 0,
    }]).select().single()
    if (error) { setError('Erreur : ' + error.message); setSavingProjet(false); return }
    setShowForm(false)
    // Remis à la même valeur que l'état initial ('Brouillon') — avant, ce
    // reset mettait 'En cours', donc un 2e projet créé juste après le 1er
    // démarrait silencieusement avec le mauvais statut par défaut.
    setForm({ nom: '', client_id: '', statut: 'Brouillon', taux_tva: 20, date_debut: '', date_fin_prevue: '', notes: '' })
    setSavingProjet(false)
    navigate('/projets/' + data.id)
  }

  async function supprimerProjet(e, id) {
    e.stopPropagation()
    if (!confirm('Déplacer ce projet et toutes ses données vers la corbeille ? Tu pourras tout restaurer depuis la Corbeille pendant 30 jours.')) return
    // Suppression douce (deleted_at) en cascade, enfants puis parent, au
    // lieu d'un DELETE définitif — voir sql/06_corbeille_soft_delete.sql.
    // On vérifie l'erreur à chaque étape et on s'arrête immédiatement en
    // cas d'échec, pour ne jamais marquer le projet supprimé alors que des
    // données enfants n'ont pas pu être mises à jour (ou l'inverse).
    const maintenant = new Date().toISOString()
    const etapes = [
      ['projet_lignes', 'projet_id'],
      ['commandes', 'projet_id'],
      ['factures_frs', 'projet_id'],
      ['factures_cli', 'projet_id'],
      ['projets', 'id'],
    ]
    for (const [table, colonne] of etapes) {
      const { error } = await supabase.from(table).update({ deleted_at: maintenant }).eq(colonne, id)
      if (error) {
        alert('Erreur lors de la suppression (' + table + ') : ' + error.message + '\n\nLa suppression a été interrompue — vérifie l\'état du projet avant de réessayer.')
        fetchAll()
        return
      }
    }
    fetchAll()
  }

  const filtered = projets.filter(p => {
    const matchSearch = p.nom?.toLowerCase().includes(search.toLowerCase()) || p.clients?.nom?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtreStatut === 'Tous' || p.statut === filtreStatut)
  })
  // .filter() renvoie déjà un nouveau tableau — .sort() en place ici ne
  // touche pas `projets` (l'ordre par date reste intact au prochain fetch).
  // Un statut absent de STATUTS (ne devrait pas arriver) part en fin de
  // liste plutôt que de planter le tri.
  if (tri === 'statut') {
    filtered.sort((a, b) => {
      const ia = STATUTS.indexOf(a.statut), ib = STATUTS.indexOf(b.statut)
      return (ia === -1 ? STATUTS.length : ia) - (ib === -1 ? STATUTS.length : ib)
    })
  }

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Projets</h1>
        </div>
        <button onClick={() => { setShowForm(true); setError('') }} style={btnPrimary}>
          + Nouveau projet
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32, borderBottom: '1px solid ' + colors.line, paddingBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet..."
          style={{ ...inputUnderline, flex: 2 }} />
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
          <option>Tous</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={tri} onChange={e => setTri(e.target.value)}
          style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
          <option value="date">Trier par date</option>
          <option value="statut">Trier par statut</option>
        </select>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
          <div style={{ background: colors.surface, padding: isMobile ? 22 : 32, width: isMobile ? '100%' : 500, maxWidth: '100%', maxHeight: isMobile ? '90vh' : 'none', overflow: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>Nouveau projet</h3>
            <p style={{ margin: '0 0 22px', fontSize: 12, color: colors.inkMuted }}>Un projet démarre en devis (Brouillon) : tu retrouveras toutes les infos (lignes, rentabilité...) dans sa fiche, avant même qu'il soit signé.</p>
            {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

            <label style={label}>Nom du projet *</label>
            <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
              placeholder="Ex: Aménagement bureaux Tour Eiffel"
              style={{ ...inputUnderline, marginBottom: 18 }} />

            <label style={label}>Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              style={{ ...inputUnderline, marginBottom: 18, cursor: 'pointer' }}>
              <option value=''>— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}
                  style={inputUnderline} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Date fin prévue</label>
                <input type="date" value={form.date_fin_prevue} onChange={e => setForm(p => ({ ...p, date_fin_prevue: e.target.value }))}
                  style={inputUnderline} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Statut</label>
                <select value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}
                  style={{ ...inputUnderline, cursor: 'pointer' }}>
                  {STATUTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>TVA</label>
                <select value={form.taux_tva} onChange={e => setForm(p => ({ ...p, taux_tva: Number(e.target.value) }))}
                  style={{ ...inputUnderline, cursor: 'pointer' }}>
                  {TAUX_TVA_OPTIONS.map(t => <option key={t} value={t}>{t === 0 ? 'Non applicable (0%)' : t + ' %'}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError('') }} style={btnGhost}>Annuler</button>
              <button onClick={creerProjet} disabled={savingProjet}
                style={{ ...btnPrimary, cursor: savingProjet ? 'default' : 'pointer', opacity: savingProjet ? 0.6 : 1 }}>{savingProjet ? 'Création...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: colors.ink }}>Aucun projet</div>
            <div style={{ fontSize: 13 }}>Crée un projet pour démarrer un devis — il évoluera vers un chantier réel une fois signé</div>
          </div>
        ) : (
          <div>
            {filtered.map((p, i) => {
              // En tri par statut, un petit intitulé au-dessus du premier
              // projet de chaque groupe — sinon le regroupement n'est
              // visible qu'au marqueur de statut de chaque ligne, facile à
              // manquer en survolant vite la liste.
              const nouveauGroupe = tri === 'statut' && (i === 0 || filtered[i - 1].statut !== p.statut)
              return (
                <div key={p.id}>
                  {nouveauGroupe && (
                    <div style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 8, margin: i === 0 ? '0 0 8px' : '28px 0 8px' }}>
                      <span style={marker(statutProjetMarker[p.statut])} />{p.statut}
                    </div>
                  )}
                  <div onClick={() => navigate('/projets/' + p.id)}
                    style={{ borderTop: '1px solid ' + colors.line, padding: isMobile ? '14px 0' : '16px 0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 16, cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nom}</div>
                      <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 3 }}>
                        {p.clients?.nom || 'Sans client'}
                        {p.date_debut ? ' · ' + new Date(p.date_debut).toLocaleDateString('fr-FR') : ''}
                        {p.date_fin_prevue ? ' → ' + new Date(p.date_fin_prevue).toLocaleDateString('fr-FR') : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: isMobile ? 'left' : 'right', display: 'flex', flexDirection: isMobile ? 'row-reverse' : 'row', justifyContent: isMobile ? 'space-between' : 'flex-start', alignItems: 'center', gap: 20 }}>
                      <div>
                        <div style={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 15, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{fmt(p.montant_ht)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.inkMuted, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                          <span style={marker(statutProjetMarker[p.statut])} />{p.statut}
                        </div>
                      </div>
                      <button onClick={e => supprimerProjet(e, p.id)} style={{ ...quietLink, flexShrink: 0 }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
