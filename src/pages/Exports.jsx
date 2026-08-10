import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'

// Exports Excel pour la comptabilité — factures clients, factures
// fournisseurs et commandes, tous projets confondus, avec un filtre de
// période optionnel (utile pour un export par exercice/trimestre).

function telechargerExcel(lignes, feuille, fichier) {
  const ws = XLSX.utils.json_to_sheet(lignes)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, feuille)
  XLSX.writeFile(wb, fichier)
}

const fmtDateFr = d => d ? new Date(d).toLocaleDateString('fr-FR') : ''

export default function Exports() {
  const isMobile = useIsMobile()
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  function appliquerPeriode(query, champDate) {
    let q = query
    if (du) q = q.gte(champDate, du)
    if (au) q = q.lte(champDate, au)
    return q
  }

  async function exporterFacturesCli() {
    setBusy('facturesCli'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('factures_cli').select('numero, date_facture, date_echeance, montant_ht, statut, projets(nom)').is('deleted_at', null).order('date_facture', { ascending: true }),
        'date_facture'
      )
      if (err) throw err
      const lignes = (data || []).map(f => ({
        'N° facture': f.numero,
        'Projet': f.projets?.nom || '',
        'Date facture': fmtDateFr(f.date_facture),
        'Date échéance': fmtDateFr(f.date_echeance),
        'Montant HT': f.montant_ht || 0,
        'Statut': f.statut,
      }))
      telechargerExcel(lignes, 'Factures clients', 'factures-clients.xlsx')
    } catch (err) {
      setError('Erreur export factures clients : ' + err.message)
    }
    setBusy('')
  }

  async function exporterFacturesFrs() {
    setBusy('facturesFrs'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('factures_frs').select('numero, date_facture, date_echeance, montant_ht, statut, projets(nom), fournisseurs(nom)').is('deleted_at', null).order('date_facture', { ascending: true }),
        'date_facture'
      )
      if (err) throw err
      const lignes = (data || []).map(f => ({
        'N° facture': f.numero,
        'Fournisseur': f.fournisseurs?.nom || '',
        'Projet': f.projets?.nom || '',
        'Date facture': fmtDateFr(f.date_facture),
        'Date échéance': fmtDateFr(f.date_echeance),
        'Montant HT': f.montant_ht || 0,
        'Statut': f.statut,
      }))
      telechargerExcel(lignes, 'Factures fournisseurs', 'factures-fournisseurs.xlsx')
    } catch (err) {
      setError('Erreur export factures fournisseurs : ' + err.message)
    }
    setBusy('')
  }

  async function exporterCommandes() {
    setBusy('commandes'); setError('')
    try {
      const { data, error: err } = await appliquerPeriode(
        supabase.from('commandes').select('numero, description, date_commande, montant_ht, statut, projets(nom), fournisseurs(nom)').is('deleted_at', null).order('date_commande', { ascending: true }),
        'date_commande'
      )
      if (err) throw err
      const lignes = (data || []).map(c => ({
        'N° commande': c.numero || '',
        'Description': c.description || '',
        'Fournisseur': c.fournisseurs?.nom || '',
        'Projet': c.projets?.nom || '',
        'Date commande': fmtDateFr(c.date_commande),
        'Montant HT': c.montant_ht || 0,
        'Statut': c.statut,
      }))
      telechargerExcel(lignes, 'Commandes', 'commandes.xlsx')
    } catch (err) {
      setError('Erreur export commandes : ' + err.message)
    }
    setBusy('')
  }

  const CARTES = [
    { key: 'facturesCli', label: 'Factures clients', icon: '💶', action: exporterFacturesCli, color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
    { key: 'facturesFrs', label: 'Factures fournisseurs', icon: '📄', action: exporterFacturesFrs, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
    { key: 'commandes', label: 'Commandes', icon: '🛒', action: exporterCommandes, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  ]

  return (
    <div style={{ padding: isMobile ? 14 : 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>📤 Exports</h2>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Exporte les données en Excel, prêtes à transmettre à ta comptabilité.</div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 16, marginBottom: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'stretch' : 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Du (optionnel)</label>
          <input type="date" value={du} onChange={e => setDu(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Au (optionnel)</label>
          <input type="date" value={au} onChange={e => setAu(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>Laisse vide pour tout exporter, quelle que soit la date.</div>
      </div>

      {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
        {CARTES.map(c => (
          <div key={c.key} style={{ background: c.bg, border: '1px solid ' + c.border, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>{c.label}</div>
            <button onClick={c.action} disabled={busy === c.key}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: c.color, color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
              {busy === c.key ? '⏳ Export...' : '⬇ Exporter en Excel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
