import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { colors, fonts, eyebrow, sectionTitle, quietLink } from '../lib/theme'

// Corbeille : regroupe tout ce qui a été "supprimé" (deleted_at renseigné)
// dans l'app, avec une option Restaurer ou Supprimer définitivement.
// Voir sql/06_corbeille_soft_delete.sql pour le schéma.

const SECTIONS = [
  { table: 'projets', label: 'Projets', nomChamp: p => p.nom, sousTitre: p => p.clients?.nom },
  { table: 'clients', label: 'Clients', nomChamp: c => c.nom, sousTitre: c => c.email },
  { table: 'fournisseurs', label: 'Fournisseurs', nomChamp: f => f.nom, sousTitre: f => f.metier },
  { table: 'depenses_generales', label: 'Dépenses', nomChamp: d => d.libelle || '(sans libellé)', sousTitre: d => d.categorie },
]

// Les 4 tables "enfants" d'un projet — leur restauration/suppression suit
// celle du projet quand celui-ci est supprimé/restauré en cascade, mais un
// élément peut aussi avoir été supprimé individuellement (sans supprimer
// tout le projet) : dans ce cas il apparaît ici séparément.
const SECTIONS_ENFANTS = [
  { table: 'projet_lignes', label: 'Lignes de projet', nomChamp: l => l.descriptif || '(sans description)' },
  { table: 'commandes', label: 'Commandes', nomChamp: c => c.description || c.numero || '(sans description)' },
  { table: 'factures_frs', label: 'Factures fournisseurs', nomChamp: f => f.numero || '(sans numéro)' },
  { table: 'factures_cli', label: 'Factures clients', nomChamp: f => f.numero || '(sans numéro)' },
]

// Même principe que SECTIONS_ENFANTS mais pour les tables "enfants" d'un
// client plutôt que d'un projet (voir client_contacts_migration.sql).
const SECTIONS_ENFANTS_CLIENT = [
  { table: 'client_contacts', label: 'Contacts clients', nomChamp: c => (c.type ? c.type + ' — ' : '') + (c.nom || '(sans nom)') },
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
    <div style={{ padding: 60, textAlign: 'center', color: colors.inkFaint, fontFamily: fonts.display, fontSize: 13 }}>Chargement...</div>
  )

  return (
    <div style={{ padding: '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Corbeille</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', maxWidth: 520 }}>
        Les éléments supprimés restent ici, restaurables à tout moment — pense à vider la corbeille de temps en temps si tu n'en as plus besoin.
      </p>

      {totalCount === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line, marginTop: 36 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>La corbeille est vide</div>
        </div>
      ) : (
        <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 36 }}>
          {SECTIONS.map(({ table, label, nomChamp, sousTitre }) => (
            data[table]?.length > 0 && (
              <div key={table}>
                <h2 style={sectionTitle}>{label} ({data[table].length})</h2>
                <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
                  {data[table].map(item => (
                    <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                        <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 2 }}>
                          {sousTitre?.(item) ? sousTitre(item) + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                        </div>
                      </div>
                      <button onClick={() => table === 'projets' ? restaurerProjet(item.id) : restaurer(table, item.id)} style={quietLink}>Restaurer</button>
                      <button onClick={() => table === 'projets' ? purgerProjetDefinitivement(item.id, nomChamp(item)) : purgerDefinitivement(table, item.id, nomChamp(item))}
                        style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer déf.</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {SECTIONS_ENFANTS.map(({ table, label, nomChamp }) => (
            data[table]?.length > 0 && (
              <div key={table}>
                <h2 style={sectionTitle}>{label} ({data[table].length})</h2>
                <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
                  {data[table].map(item => (
                    <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                        <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 2 }}>
                          {item.projets?.nom ? 'Projet : ' + item.projets.nom + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                        </div>
                      </div>
                      {item.projet_id && (
                        <button onClick={() => navigate('/projets/' + item.projet_id)} style={quietLink}>Voir le projet</button>
                      )}
                      <button onClick={() => restaurer(table, item.id)} style={quietLink}>Restaurer</button>
                      <button onClick={() => purgerDefinitivement(table, item.id, nomChamp(item))} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer déf.</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {SECTIONS_ENFANTS_CLIENT.map(({ table, label, nomChamp }) => (
            data[table]?.length > 0 && (
              <div key={table}>
                <h2 style={sectionTitle}>{label} ({data[table].length})</h2>
                <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
                  {data[table].map(item => (
                    <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line, display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomChamp(item)}</div>
                        <div style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 2 }}>
                          {item.clients?.nom ? 'Client : ' + item.clients.nom + ' · ' : ''}Supprimé le {fmtDate(item.deleted_at)}
                        </div>
                      </div>
                      <button onClick={() => restaurer(table, item.id)} style={quietLink}>Restaurer</button>
                      <button onClick={() => purgerDefinitivement(table, item.id, nomChamp(item))} style={{ ...quietLink, color: colors.danger, borderBottomColor: colors.danger }}>Supprimer déf.</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
