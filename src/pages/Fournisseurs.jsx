import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { PRESETS_DELAI_PAIEMENT, fmtEUR as fmt } from '../lib/calculs'
import { useIsMobile } from '../lib/useIsMobile'

const METIERS = ['Électricité', 'Plomberie', 'CVC', 'Menuiserie', 'Cloisons', 'Sols', 'Peinture', 'Serrurerie', 'Informatique', 'Autre']

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
      <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Conditions de paiement</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {PRESETS_DELAI_PAIEMENT.map(p => (
          <button key={p.label} type="button" onClick={() => onChange(p.jours, p.finMois)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (actif(p) ? '#2563EB' : '#E5E7EB'), background: actif(p) ? '#EFF6FF' : '#fff', color: actif(p) ? '#2563EB' : '#374151', cursor: 'pointer', fontSize: 12 }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="number" min="0" value={jours ?? 30} onChange={e => onChange(parseInt(e.target.value, 10) || 0, !!finMois)}
          style={{ width: 70, padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
        <span style={{ fontSize: 13, color: '#6B7280' }}>jours</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
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
  // liste, "✎ Modifier" côté détail). Un simple élément JSX (pas un
  // composant déclaré dans le rendu) pour éviter que React ne le
  // recrée/réinitialise à chaque re-rendu (react-hooks/static-components).
  const modalFournisseur = showForm && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: isMobile ? '14px 14px 0 0' : 14, padding: isMobile ? 20 : 28, width: isMobile ? '100%' : 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
        {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
        {[['nom', 'Nom *'], ['contact', 'Contact'], ['email', 'Email'], ['telephone', 'Téléphone'], ['rue', 'Rue (pour Pennylane)'], ['code_postal', 'Code postal (pour Pennylane)'], ['ville', 'Ville (pour Pennylane)'], ['pays', 'Pays (code, ex: FR)']].map(([key, label]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{label}</label>
            <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        ))}
        <ConditionsPaiement jours={form.delai_paiement_jours} finMois={form.delai_paiement_fin_mois}
          onChange={(j, f) => setForm(p => ({ ...p, delai_paiement_jours: j, delai_paiement_fin_mois: f }))} />
        <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Métier</label>
        {metierLibre ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input value={form.metier} onChange={e => setForm(p => ({ ...p, metier: e.target.value }))} placeholder="Nouveau métier..." autoFocus
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
            <button type="button" onClick={() => { setMetierLibre(false); setForm(p => ({ ...p, metier: '' })) }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
              ↩ Liste
            </button>
          </div>
        ) : (
          <select value={form.metier} onChange={e => {
            if (e.target.value === '__NOUVEAU__') { setMetierLibre(true); setForm(p => ({ ...p, metier: '' })) }
            else setForm(p => ({ ...p, metier: e.target.value }))
          }} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
            <option value=''>— Sélectionner —</option>
            {metiersConnus.map(m => <option key={m}>{m}</option>)}
            <option value='__NOUVEAU__'>+ Ajouter un nouveau métier...</option>
          </select>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => { setShowForm(false); setEditingId(null); setError(''); setForm(FORM_VIDE); setMetierLibre(false) }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          <button onClick={sauvegarderFournisseur} disabled={savingFournisseur}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: savingFournisseur ? 'default' : 'pointer', fontWeight: 500, fontSize: 13, opacity: savingFournisseur ? 0.7 : 1 }}>{savingFournisseur ? 'Enregistrement...' : (editingId ? 'Enregistrer' : 'Créer')}</button>
        </div>
      </div>
    </div>
  )

  // ── Vue détail fournisseur ────────────────────────────────────
  if (fournisseurOuvert) {
    return (
      <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
        {modalFournisseur}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: isMobile ? 16 : 24 }}>
          <button onClick={() => setFournisseurOuvert(null)}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
            ← Retour
          </button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{fournisseurOuvert.nom}</h2>
            {fournisseurOuvert.metier && (
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontWeight: 500 }}>
                {fournisseurOuvert.metier}
              </span>
            )}
          </div>
          <button onClick={() => ouvrirEdition(fournisseurOuvert)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}>
            ✎ Modifier
          </button>
          <button onClick={() => supprimerFournisseur(fournisseurOuvert.id)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 13 }}>
            Supprimer
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Infos contact */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Contact</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['👤 Contact', fournisseurOuvert.contact],
                ['✉️ Email', fournisseurOuvert.email],
                ['📞 Téléphone', fournisseurOuvert.telephone],
                ['🔧 Métier', fournisseurOuvert.metier],
                ['🏠 Rue', fournisseurOuvert.rue],
                ['📮 Code postal', fournisseurOuvert.code_postal],
                ['🏙️ Ville', fournisseurOuvert.ville],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#6B7280', minWidth: 100 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{val}</span>
                </div>
              ) : null)}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6B7280', minWidth: 100 }}>💳 Conditions</span>
                <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>
                  {(fournisseurOuvert.delai_paiement_jours ?? 30) === 0 ? 'Comptant' : (fournisseurOuvert.delai_paiement_jours ?? 30) + ' jours' + (fournisseurOuvert.delai_paiement_fin_mois ? ' fin de mois' : '')}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Statistiques</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#2563EB' }}>Commandes</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1E40AF' }}>{commandes.length}</span>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#059669' }}>Total commandé</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>{fmt(totalCommandes)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Historique commandes */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', fontSize: 14, fontWeight: 600 }}>
            Commandes liées
          </div>
          {commandes.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Aucune commande pour ce fournisseur
            </div>
          ) : (
            <div style={{ overflowX: isMobile ? 'auto' : 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 560 : 'auto' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Projet', 'N°', 'Description', 'Date', 'Montant HT', 'Statut'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Montant HT' ? 'right' : 'left', color: '#6B7280', fontWeight: 500, borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: '#2563EB' }}>{c.projets?.nom || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{c.numero || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{c.description}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{c.date_commande ? new Date(c.date_commande).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(c.montant_ht)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: c.statut === 'Validée' ? '#ECFDF5' : c.statut === 'Annulée' ? '#FEF2F2' : '#F3F4F6',
                        color: c.statut === 'Validée' ? '#059669' : c.statut === 'Annulée' ? '#DC2626' : '#6B7280',
                        fontWeight: 500 }}>{c.statut}</span>
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
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 0, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Fournisseurs</h2>
        <button onClick={() => { setForm(FORM_VIDE); setEditingId(null); setMetierLibre(false); setShowForm(true); setError('') }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          + Nouveau fournisseur
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total fournisseurs', value: fournisseurs.length, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Métiers', value: metiersDispos.length - 1, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Ce mois', value: fournisseurs.filter(f => new Date(f.created_at) > new Date(Date.now() - 30*24*60*60*1000)).length, color: '#059669', bg: '#F0FDF4' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '14px 18px', border: '1px solid ' + k.color + '30' }}>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
        <select value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer' }}>
          {metiersDispos.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Modal nouveau fournisseur */}
      {modalFournisseur}

      {/* Liste */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Aucun fournisseur</div>
          </div>
        ) : isMobile ? (
          // Cartes empilées plutôt qu'un tableau large — un tableau à 5
          // colonnes ne rentre pas sur un écran de téléphone, alors que
          // c'est justement le cas d'usage principal ici (retrouver le
          // téléphone d'un fournisseur depuis le chantier).
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(f => (
              <div key={f.id} onClick={() => ouvrirFournisseur(f)}
                style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{f.nom}</span>
                  {f.metier && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontWeight: 500, flexShrink: 0 }}>{f.metier}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {[f.contact, f.email, f.telephone].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['Nom', 'Contact', 'Email', 'Téléphone', 'Métier'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => (
                  <tr key={f.id} onClick={() => ouvrirFournisseur(f)}
                    style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAFA'}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{f.nom}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.contact || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.email || '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#6B7280' }}>{f.telephone || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {f.metier ? (
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontWeight: 500 }}>{f.metier}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
