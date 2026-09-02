import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { colors, fonts, eyebrow, marker } from '../lib/theme'

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
  depenses_generales: 'Dépense',
}

const ACTION_STYLE = {
  CREATION: { label: 'Création', color: colors.success },
  MODIFICATION: { label: 'Modification', color: colors.focus },
  SUPPRESSION: { label: 'Suppression', color: colors.warning },
  RESTAURATION: { label: 'Restauration', color: '#7c4a8e' },
  SUPPRESSION_DEFINITIVE: { label: 'Suppression définitive', color: colors.danger },
}

const inputUnderline = {
  padding: '8px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}

// Champs utilisés pour identifier une ligne dans l'historique (le premier
// trouvé dans la ligne gagne) — génériques car communs à plusieurs tables.
const CHAMPS_IDENTIFIANTS = ['nom', 'numero', 'libelle', 'descriptif', 'description']
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
    <div style={{ padding: '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Historique des modifications</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0' }}>Les 200 dernières actions sur les projets, factures, commandes, clients et fournisseurs.</p>

      <select value={filtreTable} onChange={e => setFiltreTable(e.target.value)}
        style={{ ...inputUnderline, cursor: 'pointer', margin: '32px 0 28px' }}>
        <option>Toutes</option>
        {Object.entries(TABLE_LABELS).map(([table, label]) => <option key={table} value={table}>{label}</option>)}
      </select>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Aucune activité enregistrée</div>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid ' + colors.line }}>
          {filtered.map(e => {
            const style = ACTION_STYLE[e.action] || { label: e.action, color: colors.inkFaint }
            const row = e.action === 'SUPPRESSION_DEFINITIVE' || e.action === 'CREATION' ? e.diff : e.diff?.apres
            const nom = identifiant(row) || identifiant(e.diff?.avant)
            const diffs = e.action === 'MODIFICATION' ? champsModifies(e.diff?.avant, e.diff?.apres) : []
            return (
              <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.ink, fontWeight: 600, flexShrink: 0 }}>
                    <span style={marker(style.color)} />{style.label}
                  </span>
                  <span style={{ fontSize: 12, color: colors.inkFaint }}>{TABLE_LABELS[e.table_name] || e.table_name}</span>
                  {nom && <span style={{ fontSize: 13, fontWeight: 600 }}>{nom}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: colors.inkFaint }}>{e.changed_by}</span>
                  <span style={{ fontSize: 11, color: colors.inkFaint }}>{fmtDate(e.changed_at)}</span>
                </div>
                {diffs.length > 0 && (
                  <div style={{ marginTop: 8, marginLeft: 13, fontSize: 12, color: colors.inkMuted }}>
                    {diffs.slice(0, 5).map(([champ, avant, apres]) => (
                      <div key={champ}>
                        <span style={{ fontWeight: 500 }}>{champ}</span> : {String(avant ?? '—')} → <span style={{ color: colors.ink, fontWeight: 500 }}>{String(apres ?? '—')}</span>
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
