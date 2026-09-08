import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtDateFr as fmtDate } from '../lib/calculs'
import { colors, fonts, eyebrow, quietLink } from '../lib/theme'
import { verifierNouvellesFactures } from '../lib/useImportFactures'
import { envoyerFactureFrsAutoPennylane } from '../lib/usePennylane'

// Boîte de réception des factures fournisseurs reçues par email — voir
// sql/factures_frs_a_traiter_migration.sql et api/import-factures-frs.js
// pour le contexte général. Louis transfère (ou fait transférer par ses
// fournisseurs) les emails de facture vers une adresse dédiée ; cette page
// va les chercher à la demande, tente de deviner le fournisseur et la
// commande concernés, et n'a plus qu'à être validée pour créer la vraie
// facture fournisseur (même effet qu'une création manuelle : PDF archivé,
// envoi automatique à Pennylane inclus).

const inputUnderline = {
  padding: '7px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink, width: '100%',
}
const fieldLabel = { display: 'block', fontSize: 10.5, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }

function getDocUrl(path) {
  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return data.publicUrl
}

export default function BoiteReceptionFactures() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [boite, setBoite] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [commandes, setCommandes] = useState([])
  const [projets, setProjets] = useState([])
  const [loading, setLoading] = useState(true)
  const [verifBusy, setVerifBusy] = useState(false)
  const [verifResume, setVerifResume] = useState('')
  const [error, setError] = useState('')
  const [forms, setForms] = useState({}) // { [itemId]: { fournisseur_id, commande_id, projet_id, numero, montant_ht, statut, date_facture, date_echeance } }
  const [busyId, setBusyId] = useState(null)
  const [pdfOuvert, setPdfOuvert] = useState(null) // id de l'item dont le PDF est déplié
  const [texteOuvert, setTexteOuvert] = useState(null)

  async function charger() {
    setLoading(true)
    const [{ data: items }, { data: frs }, { data: cmds }, { data: prjs }] = await Promise.all([
      supabase.from('factures_frs_a_traiter').select('*').eq('statut', 'a_traiter').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('fournisseurs').select('id, nom').is('deleted_at', null).order('nom'),
      supabase.from('commandes').select('id, numero, description, fournisseur_id, projet_id').is('deleted_at', null),
      supabase.from('projets').select('id, nom').is('deleted_at', null).order('nom'),
    ])
    setBoite(items || [])
    setFournisseurs(frs || [])
    setCommandes(cmds || [])
    setProjets(prjs || [])
    // Pré-remplit le formulaire d'édition de chaque brouillon à partir de
    // ce que l'import a deviné, sans écraser une éventuelle saisie déjà en
    // cours sur un item déjà présent (recharge après "Vérifier").
    setForms(prev => {
      const next = { ...prev }
      for (const item of (items || [])) {
        if (next[item.id]) continue
        next[item.id] = {
          fournisseur_id: item.fournisseur_id || '',
          commande_id: item.commande_id || '',
          projet_id: item.projet_id || '',
          numero: '',
          montant_ht: '',
          statut: 'À payer',
          date_facture: '',
          date_echeance: '',
        }
      }
      return next
    })
    setLoading(false)
  }

  // setLoading(true) (première ligne de charger()) est déclenché depuis le
  // timer, donc de façon asynchrone, plutôt que directement dans le corps
  // de l'effet — même contournement que useRechercheGlobale dans
  // Layout.jsx (voir react-hooks/set-state-in-effect).
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [])

  function editForm(itemId, champ, valeur) {
    setForms(prev => {
      const courant = { ...(prev[itemId] || {}), [champ]: valeur }
      // Choisir une commande déduit le fournisseur et le projet — même
      // logique que le formulaire de création de commande dans
      // ProjetDetail.jsx (fournisseur → régime TVA).
      if (champ === 'commande_id' && valeur) {
        const c = commandes.find(c => c.id === valeur)
        if (c) { courant.fournisseur_id = c.fournisseur_id || courant.fournisseur_id; courant.projet_id = c.projet_id || courant.projet_id }
      }
      // Changer de fournisseur invalide un choix de commande qui ne lui
      // appartient plus.
      if (champ === 'fournisseur_id') {
        const c = commandes.find(c => c.id === courant.commande_id)
        if (c && c.fournisseur_id !== valeur) courant.commande_id = ''
      }
      return { ...prev, [itemId]: courant }
    })
  }

  async function verifier() {
    setVerifBusy(true); setError(''); setVerifResume('')
    try {
      const res = await verifierNouvellesFactures()
      const morceaux = []
      if (res.importees) morceaux.push(res.importees + ' nouvelle' + (res.importees > 1 ? 's' : '') + ' facture' + (res.importees > 1 ? 's' : ''))
      if (res.sansCommande) morceaux.push(res.sansCommande + ' sans commande reconnue')
      if (res.sansPdf) morceaux.push(res.sansPdf + ' email' + (res.sansPdf > 1 ? 's' : '') + ' ignoré' + (res.sansPdf > 1 ? 's' : '') + ' (pas de PDF)')
      if (res.dejaTraitees) morceaux.push(res.dejaTraitees + ' déjà importée' + (res.dejaTraitees > 1 ? 's' : ''))
      setVerifResume((morceaux.join(' · ') || 'Aucun nouvel email.') + (res.autresRestantes ? ' — d\'autres emails restent à traiter, reclique sur "Vérifier".' : ''))
      if (res.erreurs?.length) setError(res.erreurs.join(' · '))
      await charger()
    } catch (err) {
      setError(err.message)
    }
    setVerifBusy(false)
  }

  async function valider(item) {
    const f = forms[item.id] || {}
    if (!f.fournisseur_id) { alert('Sélectionne le fournisseur.'); return }
    if (!f.projet_id) { alert('Sélectionne le projet concerné.'); return }
    if (!f.numero?.trim()) { alert('Le numéro de facture est obligatoire.'); return }
    setBusyId(item.id); setError('')

    const { data: inserted, error: insertErr } = await supabase.from('factures_frs').insert([{
      fournisseur_id: f.fournisseur_id,
      commande_id: f.commande_id || null,
      projet_id: f.projet_id,
      numero: f.numero.trim(),
      montant_ht: parseFloat(f.montant_ht) || 0,
      statut: f.statut || 'À payer',
      date_facture: f.date_facture || null,
      date_echeance: f.date_echeance || null,
      fichier_path: item.fichier_path, // déjà archivé lors de l'import, pas besoin de re-uploader
    }]).select().single()

    if (insertErr) { setError('Erreur lors de la création de la facture : ' + insertErr.message); setBusyId(null); return }

    // Même comportement qu'une création manuelle (voir ProjetDetail.jsx,
    // ajouterFactureFrs) : envoi automatique à Pennylane, non bloquant.
    if (item.fichier_path) {
      const { data: blob } = await supabase.storage.from('documents').download(item.fichier_path)
      if (blob) {
        const file = new File([blob], item.fichier_path.split('/').pop(), { type: 'application/pdf' })
        envoyerFactureFrsAutoPennylane(inserted, file).catch(err => {
          setError('Facture créée, mais échec de l\'envoi automatique à Pennylane : ' + err.message)
        })
      }
    }

    await supabase.from('factures_frs_a_traiter').update({ statut: 'traitee', facture_frs_id: inserted.id, traite_at: new Date().toISOString() }).eq('id', item.id)
    setBoite(prev => prev.filter(x => x.id !== item.id))
    setBusyId(null)
  }

  async function rejeter(item) {
    if (!confirm('Rejeter cet email (pas une facture, doublon...) ? Il ne réapparaîtra plus ici.')) return
    setBusyId(item.id)
    await supabase.from('factures_frs_a_traiter').update({ statut: 'rejetee', traite_at: new Date().toISOString() }).eq('id', item.id)
    setBoite(prev => prev.filter(x => x.id !== item.id))
    setBusyId(null)
  }

  const commandesDuFournisseur = fId => commandes.filter(c => c.fournisseur_id === fId)

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1180, margin: '0 auto' }}>
      <p style={eyebrow}>Partenaires Particuliers</p>
      <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Boîte de réception factures</h1>
      <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', maxWidth: 640 }}>
        Transfère tes factures fournisseurs reçues par email vers l'adresse dédiée — elles arrivent ici en brouillon, avec le fournisseur et la commande pré-remplis quand la référence de commande est reconnue sur la facture. Il ne reste qu'à vérifier et valider.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '28px 0 8px' }}>
        <button onClick={verifier} disabled={verifBusy} style={{ ...quietLink, fontSize: 13, paddingBottom: 6 }}>
          {verifBusy ? 'Vérification...' : 'Vérifier les nouvelles factures'}
        </button>
      </div>
      {verifResume && <div style={{ borderLeft: '2px solid ' + colors.success, color: colors.success, padding: '10px 14px', marginTop: 12, fontSize: 13 }}>{verifResume}</div>}
      {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', marginTop: 12, fontSize: 13 }}>{error}</div>}

      <div style={{ marginTop: 32 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: colors.inkFaint, fontSize: 13 }}>Chargement...</div>
        ) : boite.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.inkFaint, borderTop: '1px solid ' + colors.line, borderBottom: '1px solid ' + colors.line }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink }}>Rien à traiter</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Clique sur "Vérifier les nouvelles factures" après avoir transféré un email.</div>
          </div>
        ) : boite.map(item => {
          const f = forms[item.id] || {}
          return (
            <div key={item.id} style={{ borderTop: '1px solid ' + colors.line, padding: '22px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.sujet || '(sans objet)'}</div>
                  <div style={{ fontSize: 12, color: colors.inkMuted, marginTop: 3 }}>
                    {item.expediteur || '—'}{item.recu_le ? ' · reçu le ' + fmtDate(item.recu_le) : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <button onClick={() => setPdfOuvert(pdfOuvert === item.id ? null : item.id)} style={{ ...quietLink, fontSize: 12 }}>
                    {pdfOuvert === item.id ? 'Masquer le PDF' : 'Voir le PDF'}
                  </button>
                  {item.texte_extrait && (
                    <button onClick={() => setTexteOuvert(texteOuvert === item.id ? null : item.id)} style={{ ...quietLink, fontSize: 12, color: colors.inkFaint, borderBottomColor: colors.inkFaint }}>
                      {texteOuvert === item.id ? 'Masquer le texte' : 'Texte extrait'}
                    </button>
                  )}
                </div>
              </div>

              {item.alerte && (
                <div style={{ borderLeft: '2px solid ' + colors.warning, color: colors.warning, padding: '8px 12px', marginBottom: 14, fontSize: 12.5 }}>
                  {item.alerte}
                </div>
              )}

              {pdfOuvert === item.id && item.fichier_path && (
                <iframe src={getDocUrl(item.fichier_path)} title="Facture" style={{ width: '100%', height: 500, border: '1px solid ' + colors.line, marginBottom: 16 }} />
              )}
              {texteOuvert === item.id && (
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, color: colors.inkMuted, background: colors.bg, padding: 12, marginBottom: 16, maxHeight: 220, overflow: 'auto', fontFamily: fonts.mono }}>{item.texte_extrait}</pre>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
                <div>
                  <label style={fieldLabel}>Fournisseur *</label>
                  <select value={f.fournisseur_id || ''} onChange={e => editForm(item.id, 'fournisseur_id', e.target.value)} style={{ ...inputUnderline, cursor: 'pointer' }}>
                    <option value=''>—</option>
                    {fournisseurs.map(fr => <option key={fr.id} value={fr.id}>{fr.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Commande</label>
                  <select value={f.commande_id || ''} onChange={e => editForm(item.id, 'commande_id', e.target.value)} style={{ ...inputUnderline, cursor: 'pointer' }}>
                    <option value=''>— Aucune —</option>
                    {commandesDuFournisseur(f.fournisseur_id).map(c => <option key={c.id} value={c.id}>{c.numero || c.description}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Projet *</label>
                  <select value={f.projet_id || ''} onChange={e => editForm(item.id, 'projet_id', e.target.value)} style={{ ...inputUnderline, cursor: 'pointer' }}>
                    <option value=''>—</option>
                    {projets.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>N° facture *</label>
                  <input value={f.numero || ''} onChange={e => editForm(item.id, 'numero', e.target.value)} style={inputUnderline} />
                </div>
                <div>
                  <label style={fieldLabel}>Montant HT</label>
                  <input type="number" step="0.01" value={f.montant_ht || ''} onChange={e => editForm(item.id, 'montant_ht', e.target.value)} style={inputUnderline} />
                </div>
                <div>
                  <label style={fieldLabel}>Date facture</label>
                  <input type="date" value={f.date_facture || ''} onChange={e => editForm(item.id, 'date_facture', e.target.value)} style={inputUnderline} />
                </div>
                <div>
                  <label style={fieldLabel}>Échéance</label>
                  <input type="date" value={f.date_echeance || ''} onChange={e => editForm(item.id, 'date_echeance', e.target.value)} style={inputUnderline} />
                </div>
                <div>
                  <label style={fieldLabel}>Statut</label>
                  <select value={f.statut || 'À payer'} onChange={e => editForm(item.id, 'statut', e.target.value)} style={{ ...inputUnderline, cursor: 'pointer' }}>
                    <option value='À payer'>À payer</option>
                    <option value='Payée'>Payée</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <button onClick={() => valider(item)} disabled={busyId === item.id} style={{ ...quietLink, fontSize: 13 }}>
                  {busyId === item.id ? 'Enregistrement...' : 'Valider → créer la facture fournisseur'}
                </button>
                {f.projet_id && (
                  <button onClick={() => navigate('/projets/' + f.projet_id)} style={{ ...quietLink, fontSize: 12, color: colors.inkFaint, borderBottomColor: colors.inkFaint }}>
                    Voir le projet
                  </button>
                )}
                <button onClick={() => rejeter(item)} disabled={busyId === item.id} style={{ ...quietLink, fontSize: 12, color: colors.danger, borderBottomColor: colors.danger }}>
                  Rejeter
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
