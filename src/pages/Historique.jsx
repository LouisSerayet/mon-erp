import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Historique des modifications — lecture seule de la table audit_log,
// alimentée par un trigger Postgres générique (voir
// sql/07_historique_modifications.sql). Montre qui a changé quoi et
// quand sur les projets, lignes, commandes, factures, clients et
// fournisseurs — y compris les changements faits hors de l'app.

const TABLE_LABELS = {
  projets: 'Projet',
  projet_lignes: 'Ligne de projet',
  commandes: 'Commande',
  factures_frs: 'Facture fournisseur',
  factures_cli: 'Facture client',
  clients: 'Client',
  fournisseurs: 'Fournisseur',
}

const ACTION_STYLE = {
  CREATION: { label: 'Création', bg: '#F0FDF4', color: '#059669', icon: '＋' },
  MODIFICATION: { label: 'Modification', bg: '#EFF6FF', color: '#2563EB', icon: '✏️' },
  SUPPRESSION: { label: 'Suppression', bg: '#FFF7ED', color: '#EA580C', icon: '🗑' },
  RESTAURATION: { label: 'Restauration', bg: '#F5F3FF', color: '#7C3AED', icon: '↺' },
  SUPPRESSION_DEFINITIVE: { label: 'Suppression définitive', bg: '#FEF2F2', color: '#DC2626', icon: '⛔' },
}

// Champs utilisés pour identifier une ligne dans l'historique (le premier
// trouvé dans la ligne gagne) — génériques car communs à plusieurs tables.
const CHAMPS_IDENTIFIANTS = ['nom', 'numero', 'descriptif', 'description']
// Champs techniques à ignorer dans le résumé des changements — trop
// bruyants pour être utiles à l'utilisateur.
const CHAMPS_IGNORES = new Set(['id', 'created_at', 'updated_at', 'projet_id', 'client_id', 'fournisseur_id', 'commande_id'])

function identifiant(row) {
  if (!row) return null
  for (const champ of CHAMPS_IDENTIFIANTS) {
    if (row[champ]) return row[champ]
  }
  return null
}

function champsModifies(avant, apres) {
  if (!avant || !apres) return []
  const cles = new Set([...Object.keys(avant), ...Object.keys(apres)])
  const diffs = []
  for (const cle of cles) {
    if (CHAMPS_IGNORES.has(cle) || cle === 'deleted_at') continue
    const v1 = avant[cle], v2 = apres[cle]
    if (JSON.stringify(v1) !== JSON.stringify(v2)) diffs.push([cle, v1, v2])
  }
  return diffs
}

export default function Historique() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtreTable, setFiltreTable] = useState('Toutes')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(200)
    setEntries(data || [])
    setLoading(false)
  }

  const filtered = filtreTable === 'Toutes' ? entries : entries.filter(e => e.table_name === filtreTable)
  const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🕓 Historique des modifications</h2>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Les 200 dernières actions sur les projets, factures, commandes, clients et fournisseurs.</div>
      </div>

      <select value={filtreTable} onChange={e => setFiltreTable(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>
        <option>Toutes</option>
        {Object.entries(TABLE_LABELS).map(([table, label]) => <option key={table} value={table}>{label}</option>)}
      </select>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🕓</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Aucune activité enregistrée</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {filtered.map((e, i) => {
            const style = ACTION_STYLE[e.action] || { label: e.action, bg: '#F9FAFB', color: '#6B7280', icon: '•' }
            const row = e.action === 'SUPPRESSION_DEFINITIVE' || e.action === 'CREATION' ? e.diff : e.diff?.apres
            const nom = identifiant(row) || identifiant(e.diff?.avant)
            const diffs = e.action === 'MODIFICATION' ? champsModifies(e.diff?.avant, e.diff?.apres) : []
            return (
              <div key={e.id} style={{ padding: '12px 18px', borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: style.bg, color: style.color, fontWeight: 600, flexShrink: 0 }}>
                    {style.icon} {style.label}
                  </span>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{TABLE_LABELS[e.table_name] || e.table_name}</span>
                  {nom && <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{nom}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{e.changed_by}</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(e.changed_at)}</span>
                </div>
                {diffs.length > 0 && (
                  <div style={{ marginTop: 6, marginLeft: 4, fontSize: 12, color: '#6B7280' }}>
                    {diffs.slice(0, 5).map(([champ, avant, apres]) => (
                      <div key={champ}>
                        <span style={{ fontWeight: 500 }}>{champ}</span> : {String(avant ?? '—')} → <span style={{ color: '#111827', fontWeight: 500 }}>{String(apres ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
