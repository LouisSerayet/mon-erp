import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { PRESETS_DELAI_PAIEMENT, fmtEUR as fmt } from '../lib/calculs'
import { useIsMobile } from '../lib/useIsMobile'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'

const METIERS = ['Électricité', 'Plomberie', 'CVC', 'Menuiserie', 'Cloisons', 'Sols', 'Peinture', 'Serrurerie', 'Informatique', 'Autre']

// Couleur de statut commande, cohérente avec le reste de l'app (voir
// statutProjetMarker dans theme.js pour l'équivalent projets).
const STATUT_COMMANDE_MARKER = { 'Validée': colors.success, 'Annulée': colors.danger, 'Brouillon': colors.inkFaint }

const inputUnderline = {
  width: '100%', padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }
const btnPrimary = { background: colors.ink, color: colors.surface, border: 'none', padding: '10px 20px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }
const btnGhost = { background: 'none', color: colors.inkMuted, border: '1px solid ' + colors.line, padding: '10px 18px', fontSize: 13, fontFamily: fonts.display, cursor: 'pointer' }

// Sélecteur "Conditions de paiement" (délai en jours + case "fin de mois")
// — pré-remplit automatiquement l'échéance des factures de ce fournisseur
// (voir calculerEcheance dans lib/calculs.js et son usage dans
// ProjetDetail.jsx). Composant local (non exporté) : pas de conflit avec
// react-refresh/only-export-components puisque ce fichier n'exporte que le
// composant Fournisseurs par défaut.
function ConditionsPaiement({ jours, finMois, onChange }) {
  const actif = p => Number(jours) === p.jours && !!finMois === p.finMois
  return (
    <div style={{ marginBottom: 20 }}>
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

export default function Fournisseurs() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  // Pré-rempli quand on arrive depuis la recherche globale (Layout.jsx).
  const [search, setSearch] = useState(location.state?.q || '')
  const [filtreMetier, setFiltreMetier] = useState('Tous')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // id du fournisseur en cours de modification, null = création
  const [fournisseurOuvert, setFournisseurOuvert] = useState(null)
  const [commandes, setCommandes] = useState([])
  const [form, setForm] = useState({ nom: '', contact: '', email: '', telephone: '', metier: '', rue: '', code_postal: '', ville: '', pays: 'FR', delai_paiement_jours: 30, delai_paiement_fin_mois: false })
  const [error, setError] = useState('')
  const [savingFournisseur, setSavingFournisseur] = useState(false) // garde-fou anti double-clic
  // true = le champ Métier est en saisie libre (nouveau métier hors liste),
  // false = choix dans la liste déroulante existante.
  const [metierLibre, setMetierLibre] = useState(false)

  const FORM_VIDE = { nom: '', contact: '', email: '', telephone: '', metier: '', rue: '', code_postal: '', ville: '', pays: 'FR', delai_paiement_jours: 30, delai_paiement_fin_mois: false }

  useEffect(() => { fetchFournisseurs() }, [])

  async function fetchFournisseurs() {
    setLoading(true)
    const { data } = await supabase.from('fournisseurs').select('*').is('deleted_at', null).order('nom')
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function ouvrirFournisseur(f) {
    const { data } = await supabase
      .from('commandes')
      .select('*, projets(nom)')
      .eq('fournisseur_id', f.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setCommandes(data || [])
    setFournisseurOuvert(f)
  }

  async function sauvegarderFournisseur() {
    if (savingFournisseur) return
    setError('')
    if (!form.nom.trim()) { setError('Le nom est obligatoire.'); return }
    setSavingFournisseur(true)
    if (editingId) {
      const { data, error } = await supabase.from('fournisseurs').update({ ...form }).eq('id', editingId).select().single()
      if (error) { setError('Erreur : ' + error.message); setSavingFournisseur(false); return }
      setShowForm(false); setEditingId(null); setForm(FORM_VIDE)
      setFournisseurOuvert(data) // rafraîchit la vue détail sans repasser par la liste
      fetchFournisseurs()
    } else {
      const { error } = await supabase.from('fournisseurs').insert([{ ...form }])
      if (error) { setError('Erreur : ' + error.message); setSavingFournisseur(false); return }
      setShowForm(false)
      setForm(FORM_VIDE)
      fetchFournisseurs()
    }
    setSavingFournisseur(false)
  }

  function ouvrirEdition(f) {
    setForm({ nom: f.nom || '', contact: f.contact || '', email: f.email || '', telephone: f.telephone || '', metier: f.metier || '', rue: f.rue || '', code_postal: f.code_postal || '', ville: f.ville || '', pays: f.pays || 'FR', delai_paiement_jours: f.delai_paiement_jours ?? 30, delai_paiement_fin_mois: f.delai_paiement_fin_mois ?? false })
    setEditingId(f.id)
    setError('')
    // Si son métier actuel n'est pas dans la liste connue, on ouvre directement en saisie libre.
    setMetierLibre(!!f.metier && !metiersConnus.includes(f.metier))
    setShowForm(true)
  }

  async function supprimerFournisseur(id) {
    if (!confirm('Déplacer ce fournisseur vers la corbeille ? Tu pourras le restaurer depuis la Corbeille pendant 30 jours.')) return
    // Suppression douce (deleted_at) au lieu d'un DELETE définitif — voir
    // sql/06_corbeille_soft_delete.sql et la page Corbeille.
    const { error } = await supabase.from('fournisseurs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erreur lors de la suppression : ' + error.message); return }
    setFournisseurOuvert(null)
    fetchFournisseurs()
  }

  // Union de la liste de base et des métiers déjà utilisés (permet de proposer
  // dans le menu déroulant les métiers ajoutés en saisie libre par le passé).
  const metiersConnus = [...new Set([...METIERS, ...fournisseurs.map(f => f.metier).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'))
  const metiersDispos = ['Tous', ...new Set(fournisseurs.map(f => f.metier).filter(Boolean))]
  const filtered = fournisseurs.filter(f => {
    const matchSearch = f.nom?.toLowerCase().includes(search.toLowerCase()) ||
      f.metier?.toLowerCase().includes(search.toLowerCase()) ||
      f.contact?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtreMetier === 'Tous' || f.metier === filtreMetier)
  })

  const totalCommandes = commandes.reduce((s, c) => s + (c.montant_ht || 0), 0)

  // Modale de création/modification — partagée entre la vue liste et la vue
  // détail (toutes deux peuvent l'ouvrir : "+ Nouveau fournisseur" côté
  // liste, "Modifier" côté détail). Un simple élément JSX (pas un
  // composant déclaré dans le rendu) pour éviter que React ne le
  // recrée/réinitialise à chaque re-rendu (react-hooks/static-components).
  const modalFournisseur = showForm && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,24,26,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div style={{ background: colors.surface, padding: isMobile ? 22 : 32, width: isMobile ? '100%' : 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', border: '1px solid ' + colors.line }}>
        <h3 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700 }}>{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
        {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
        {[['nom', 'Nom *'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['rue', 'Rue (pour Pennylane)'], ['code_postal', 'Code postal (pour Pennylane)'], ['ville', 'Ville (pour Pennylane)'], ['pays', 'Pays (code, ex: FR)']].map(([key, label]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>{label}</label>
            <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              style={inputUnderline} />
          </div>
        ))}
        <ConditionsPaiement jours={form.delai_paiement_jours} finMois={form.delai_paiement_fin_mois}
          onChange={(j, f) => setForm(p => ({ ...p, delai_paiement_jours: j, delai_paiement_fin_mois: f }))} />
        <label style={fieldLabel}>Métier</label>
        {metierLibre ? (
          <div style={{ display: 'flex', gap: 12, marginBottom: 22, alignItems: 'flex-end' }}>
            <input value={form.metier} onChange={e => setForm(p => ({ ...p, metier: e.target.value }))} placeholder="Nouveau métier..." autoFocus
              style={{ ...inputUnderline, flex: 1 }} />
            <button type="button" onClick={() => { setMetierLibre(false); setForm(p => ({ ...p, metier: '' })) }} style={{ ...quietLink, whiteSpace: 'nowrap' }}>
              Liste
            </button>
          </div>
        ) : (
          <select value={form.metier} onChange={e => {
            if (e.target.value === '__NOUVEAU__') { setMetierLibre(true); setForm(p => ({ ...p, metier: '' })) }
            else setForm(p => ({ ...p, metier: e.target.value }))
          }} style={{ ...inputUnderline, marginBottom: 22, cursor: 'pointer' }}>
            <option value=''>— Sélectionner —</option>
            {metiersConnus.map(m => <option key={m}>{m}</option>)}
            <option value='__NOUVEAU__'>+ Ajouter un nouveau métier...</option>
          </select>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowForm(false); setEditingId(null); setError(''); setForm(FORM_VIDE); setMetierLibre(false) }} style={btnGhost}>Annuler</button>
          <button onClick={sauvegarderFournisseur} disabled={savingFournisseur}
            style={{ ...btnPrimary, cursor: savingFournisseur ? 'default' : 'pointer', opacity: savingFournisseur ? 0.6 : 1 }}>{savingFournisseur ? 'Enregistrement...' : (editingId ? 'Enregistrer' : 'Créer')}</button>
        </div>
      </div>
    </div>
  )

  // ── Vue détail fournisseur ────────────────────────────────────
  if (fournisseurOuvert) {
    return (
      <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
        {modalFournisseur}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, marginBottom: 40 }}>
          <button onClick={() => setFournisseurOuvert(null)} style={{ ...quietLink, marginBottom: 4 }}>← Fournisseurs</button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={eyebrow}>{fournisseurOuvert.metier || 'Fournisseur'}</p>
            <h1 style={{ margin: '10px 0 0', fontSize: isMobile ? 24 : 30, fontWeight: 700, letterSpacing: '-0.015em' }}>{fournisseurOuvert.nom}</h1>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <button onClick={() => ouvrirEdition(fournisseurOuvert)} style={quietLink}>Modifier</button>
            <button onClick={() => supprimerFournisseur(fournisseurOuvert.id)} style={quietLink}>Supprimer</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 36 : 48, marginBottom: 48 }}>
          {/* Infos contact */}
          <div>
            <h2 style={sectionTitle}>Contact</h2>
            <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
              {[
                ['Contact', fournisseurOuvert.contact],
                ['Email', fournisseurOuvert.email],
                ['Téléphone', fournisseurOuvert.telephone],
                ['Métier', fournisseurOuvert.metier],
                ['Rue', fournisseurOuvert.rue],
                ['Code postal', fournisseurOuvert.code_postal],
                ['Ville', fournisseurOuvert.ville],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ borderBottom: '1px solid ' + colors.line, padding: '10px 0', display: 'flex', gap: 16, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: colors.inkMuted, minWidth: 100 }}>{label}</span>
                  <span style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>{val}</span>
                </div>
              ) : null)}
              <div style={{ borderBottom: '1px solid ' + colors.line, padding: '10px 0', display: 'flex', gap: 16, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: colors.inkMuted, minWidth: 100 }}>Conditions</span>
                <span style={{ fontSize: 13, color: colors.ink, fontWeight: 500 }}>
                  {(fournisseurOuvert.delai_paiement_jours ?? 30) === 0 ? 'Comptant' : (fournisseurOuvert.delai_paiement_jours ?? 30) + ' jours' + (fournisseurOuvert.delai_paiement_fin_mois ? ' fin de mois' : '')}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div>
            <h2 style={sectionTitle}>Statistiques</h2>
            <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
              {[
                ['Commandes', commandes.length],
                ['Total commandé', fmt(totalCommandes)],
              ].map(([label, val]) => (
                <div key={label} style={{ borderBottom: '1px solid ' + colors.line, padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: colors.inkMuted }}>{label}</span>
                  <span style={{ fontFamily: fonts.mono, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Historique commandes */}
        <div>
          <h2 style={sectionTitle}>Commandes liées</h2>
          {commandes.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
              Aucune commande pour ce fournisseur
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 560 : 'auto' }}>
                <thead>
                  <tr>
                    {['Projet', 'N°', 'Description', 'Date', 'Montant HT', 'Statut'].map(h => (
                      <th key={h} style={{ padding: '0 14px 10px 0', textAlign: h === 'Montant HT' ? 'right' : 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commandes.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid ' + colors.line }}>
                      <td style={{ padding: '11px 14px 11px 0', fontWeight: 500 }}>{c.projets?.nom || '—'}</td>
                      <td style={{ padding: '11px 14px', color: colors.inkFaint, fontSize: 12 }}>{c.numero || '—'}</td>
                      <td style={{ padding: '11px 14px', color: colors.inkMuted }}>{c.description}</td>
                      <td style={{ padding: '11px 14px', color: colors.inkMuted }}>{c.date_commande ? new Date(c.date_commande).toLocaleDateString('fr-FR') : '—'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.montant_ht)}</td>
                      <td style={{ padding: '11px 0 11px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkMuted }}>
                          <span style={marker(STATUT_COMMANDE_MARKER[c.statut] || colors.inkFaint)} />{c.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Liste fournisseurs ────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Fournisseurs</h1>
        </div>
        <button onClick={() => { setForm(FORM_VIDE); setEditingId(null); setMetierLibre(false); setShowForm(true); setError('') }} style={btnPrimary}>
          + Nouveau fournisseur
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: 24, marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid ' + colors.line }}>
        {[
          { label: 'Total fournisseurs', value: fournisseurs.length },
          { label: 'Métiers', value: metiersDispos.length - 1 },
          { label: 'Ce mois', value: fournisseurs.filter(f => new Date(f.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length },
        ].map(k => (
          <div key={k.label}>
            <div style={eyebrow}>{k.label}</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 26, fontWeight: 500, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, marginBottom: 32 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ ...inputUnderline, flex: 2 }} />
        <select value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
          style={{ ...inputUnderline, flex: 1, cursor: 'pointer' }}>
          {metiersDispos.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Modal nouveau fournisseur */}
      {modalFournisseur}

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucun fournisseur</div>
          </div>
        ) : isMobile ? (
          // Lignes empilées plutôt qu'un tableau large — un tableau à 5
          // colonnes ne rentre pas sur un écran de téléphone, alors que
          // c'est justement le cas d'usage principal ici (retrouver le
          // téléphone d'un fournisseur depuis le chantier).
          <div>
            {filtered.map(f => (
              <div key={f.id} onClick={() => ouvrirFournisseur(f)}
                style={{ borderTop: '1px solid ' + colors.line, padding: '14px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.nom}</span>
                  {f.metier && <span style={{ fontSize: 11, color: colors.inkFaint, flexShrink: 0 }}>{f.metier}</span>}
                </div>
                <div style={{ fontSize: 12, color: colors.inkMuted }}>
                  {[f.contact, f.email, f.telephone].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Nom', 'Contact', 'Email', 'Téléphone', 'Métier'].map(h => (
                  <th key={h} style={{ padding: '0 14px 10px 0', textAlign: 'left', color: colors.inkFaint, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid ' + colors.line }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} onClick={() => ouvrirFournisseur(f)} style={{ borderBottom: '1px solid ' + colors.line, cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px 12px 0', fontWeight: 600 }}>{f.nom}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted }}>{f.contact || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted }}>{f.email || '—'}</td>
                  <td style={{ padding: '12px 14px', color: colors.inkMuted }}>{f.telephone || '—'}</td>
                  <td style={{ padding: '12px 0 12px 14px', color: colors.inkMuted }}>{f.metier || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}
