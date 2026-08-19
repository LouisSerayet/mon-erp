import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

// Corbeille : regroupe tout ce qui a été "supprimé" (deleted_at renseigné)
// dans l'app, avec une option Restaurer ou Supprimer définitivement.
// Voir sql/06_corbeille_soft_delete.sql pour le schéma.

const SECTIONS = [
  { table: 'projets', label: 'Projets', icon: '📋', nomChamp: p => p.nom, sousTitre: p => p.clients?.nom },
  { table: 'clients', label: 'Clients', icon: '👤', nomChamp: c => c.nom, sousTitre: c => c.email },
  { table: 'fournisseurs', label: 'Fournisseurs', icon: '🏢', nomChamp: f => f.nom, sousTitre: f => f.metier },
  { table: 'depenses_generales', label: 'Dépenses', icon: '💸', nomChamp: d => d.libelle || '(sans libellé)', sousTitre: d => d.categorie },
]

// Les 4 tables "enfants" d'un projet — leur restauration/suppression suit
// celle du projet quand celui-ci est supprimé/restauré en cascade, mais un
// élément peut aussi avoir été supprimé individuellement (sans supprimer
// tout le projet) : dans ce cas il apparaît ici séparément.
const SECTIONS_ENFANTS = [
  { table: 'projet_lignes', label: 'Lignes de projet', icon: '📐', nomChamp: l => l.descriptif || '(sans description)' },
  { table: 'commandes', label: 'Commandes', icon: '🛒', nomChamp: c => c.description || c.numero || '(sans description)' },
  { table: 'factures_frs', label: 'Factures fournisseurs', icon: '📄', nomChamp: f => f.numero || '(sans numéro)' },
  { table: 'factures_cli', label: 'Factures clients', icon: '💶', nomChamp: f => f.numero || '(sans numéro)' },
]

// Même principe que SECTIONS_ENFANTS mais pour les tables "enfants" d'un
// client plutôt que d'un projet (voir client_contacts_migration.sql).
const SECTIONS_ENFANTS_CLIENT = [
  { table: 'client_contacts', label: 'Contacts clients', icon: '📇', nomChamp: c => (c.type ? c.type + ' — ' : '') + (c.nom || '(sans nom)') },
]

export default function Corbeille() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: projets }, { data: clients }, { data: fournisseurs }, { data: depenses },
      { data: lignes }, { data: commandes }, { data: ffrs }, { data: fcli }, { data: contactsClients }] = await Promise.all([
      supabase.from('projets').select('id, nom, deleted_at, clients(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('clients').select('id, nom, email, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('fournisseurs').select('id, nom, metier, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('depenses_generales').select('id, libelle, categorie, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('projet_lignes').select('id, descriptif, deleted_at, projet_id, projets(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('commandes').select('id, description, numero, deleted_at, projet_id, projets(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('factures_frs').select('id, numero, deleted_at, projet_id, projets(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('factures_cli').select('id, numero, deleted_at, projet_id, projets(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('client_contacts').select('id, type, nom, deleted_at, client_id, clients(nom)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])

    const idsProjetsSupprimes = new Set((projets || []).map(p => p.id))
    // On ne montre pas séparément les éléments dont le projet parent est
    // lui-même dans la corbeille — ils réapparaîtront automatiquement en
    // restaurant le projet, les lister à part serait redondant.
    const filtreEnfant = arr => (arr || []).filter(x => !idsProjetsSupprimes.has(x.projet_id))

    const idsClientsSupprimes = new Set((clients || []).map(c => c.id))
    // Même logique côté client : un contact dont le client est déjà dans la
    // corbeille réapparaîtra avec lui, pas besoin de le lister à part.
    const filtreEnfantClient = arr => (arr || []).filter(x => !idsClientsSupprimes.has(x.client_id))

    setData({
      projets: projets || [],
      clients: clients || [],
      fournisseurs: fournisseurs || [],
      depenses_generales: depenses || [],
      projet_lignes: filtreEnfant(lignes),
      commandes: filtreEnfant(commandes),
      factures_frs: filtreEnfant(ffrs),
      factures_cli: filtreEnfant(fcli),
      client_contacts: filtreEnfantClient(contactsClients),
    })
    setLoading(false)
  }

  async function restaurerProjet(projetId) {
    // Restauration en cascade, symétrique de la suppression : le projet et
    // toutes ses données redeviennent visibles ensemble.
    const tables = ['projet_lignes', 'commandes', 'factures_frs', 'factures_cli', 'projets']
    for (const table of tables) {
      const colonne = table === 'projets' ? 'id' : 'projet_id'
      const { error } = await supabase.from(table).update({ deleted_at: null }).eq(colonne, projetId)
      if (error) { alert('Erreur lors de la restauration (' + table + ') : ' + error.message); fetchAll(); return }
    }
    fetchAll()
  }

  async function restaurer(table, itemId) {
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', itemId)
    if (error) { alert('Erreur lors de la restauration : ' + error.message); return }
    fetchAll()
  }

  async function purgerProjetDefinitivement(projetId, nom) {
    if (!confirm('Supprimer DÉFINITIVEMENT "' + nom + '" et toutes ses données ? Cette action est irréversible.')) return
    const tables = ['projet_lignes', 'commandes', 'factures_frs', 'factures_cli', 'projets']
    for (const table of tables) {
      const colonne = table === 'projets' ? 'id' : 'projet_id'
      const { error } = await supabase.from(table).delete().eq(colonne, projetId)
      if (error) { alert('Erreur lors de la suppression définitive (' + table + ') : ' + error.message); fetchAll(); return }
    }
    fetchAll()
  }

  async function purgerDefinitivement(table, itemId, nom) {
    if (!confirm('Supprimer DÉFINITIVEMENT "' + nom + '" ? Cette action est irréversible.')) return
    const { error } = await supabase.from(table).delete().eq('id', itemId)
    if (error) { alert('Erreur lors de la suppression définitive : ' + error.message + (error.message.includes('foreign key') ? '\n\nCet élément a probablement des données liées.' : '')); return }
    fetchAll()
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const totalCount = Object.values(data).reduce((s, arr) => s + (arr?.length || 0), 0)

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>
  )

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🗑 Corbeille</h2>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
          Les éléments supprimés restent ici, restaurables à tout moment — pense à vider la corbeille de temps en temps si tu n'en as plus besoin.
        </div>
      </div>

      {totalCount === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12, border: '2px dashed #E5E7EB' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗑</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>La corbeille est vide</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SECTIONS.map(({ table, label, icon, nomChamp, sousTitre }) => (
            data[table]?.length > 0 && (
              <div key={table} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3F4F6', fontSize: 13, fontWeight: 600 }}>
                  {icon} {label} ({data[table].length})
                </div>
                {data[table].map(item => (
                  <div key={item.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {sousTitre?.(item) ? sousTitre(item) + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                      </div>
                    </div>
                    <button onClick={() => table === 'projets' ? restaurerProjet(item.id) : restaurer(table, item.id)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                      ↺ Restaurer
                    </button>
                    <button onClick={() => table === 'projets' ? purgerProjetDefinitivement(item.id, nomChamp(item)) : purgerDefinitivement(table, item.id, nomChamp(item))}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                      Supprimer déf.
                    </button>
                  </div>
                ))}
              </div>
            )
          ))}

          {SECTIONS_ENFANTS.map(({ table, label, icon, nomChamp }) => (
            data[table]?.length > 0 && (
              <div key={table} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3F4F6', fontSize: 13, fontWeight: 600 }}>
                  {icon} {label} ({data[table].length})
                </div>
                {data[table].map(item => (
                  <div key={item.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {item.projets?.nom ? 'Projet : ' + item.projets.nom + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                      </div>
                    </div>
                    {item.projet_id && (
                      <button onClick={() => navigate('/projets/' + item.projet_id)}
                        style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                        Voir le projet
                      </button>
                    )}
                    <button onClick={() => restaurer(table, item.id)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                      ↺ Restaurer
                    </button>
                    <button onClick={() => purgerDefinitivement(table, item.id, nomChamp(item))}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                      Supprimer déf.
                    </button>
                  </div>
                ))}
              </div>
            )
          ))}

          {SECTIONS_ENFANTS_CLIENT.map(({ table, label, icon, nomChamp }) => (
            data[table]?.length > 0 && (
              <div key={table} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3F4F6', fontSize: 13, fontWeight: 600 }}>
                  {icon} {label} ({data[table].length})
                </div>
                {data[table].map(item => (
                  <div key={item.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {item.clients?.nom ? 'Client : ' + item.clients.nom + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                      </div>
                    </div>
                    <button onClick={() => restaurer(table, item.id)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#059669', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
                      ↺ Restaurer
                    </button>
                    <button onClick={() => purgerDefinitivement(table, item.id, nomChamp(item))}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                      Supprimer déf.
                    </button>
                  </div>
                ))}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
