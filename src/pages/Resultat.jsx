import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtEUR as fmt } from '../lib/calculs'
import { colors, fonts, eyebrow, sectionTitle, quietLink, marker } from '../lib/theme'

// Compte de résultat "en live" — vue d'ensemble de toute la société sur
// une période donnée (par défaut l'année en cours), en comptabilité
// d'engagement : une facture compte dès qu'elle est émise/reçue (sa
// date_facture), pas seulement une fois payée. Recalculé à chaque
// chargement directement depuis les données de l'ERP (projets, factures
// clients/fournisseurs, dépenses générales) — rien n'est mis en cache ou
// figé, contrairement à un vrai bilan comptable.
//
// Volontairement une vue d'ensemble (pas de ventilation facture par
// facture) : CA, achats liés aux projets, marge brute, dépenses
// générales par catégorie, résultat net. Pour le détail projet par
// projet, voir l'onglet "Rentabilité" de chaque projet ; pour le détail
// facture par facture, voir la page "Dépenses" ou l'onglet "Factures".

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const inputUnderline = {
  padding: '7px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}

function anneeCourante() { return new Date().getFullYear() }

export default function Resultat() {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [annee, setAnnee] = useState(anneeCourante())
  const [periodePerso, setPeriodePerso] = useState(false)
  const [debutPerso, setDebutPerso] = useState('')
  const [finPerso, setFinPerso] = useState('')
  const [data, setData] = useState(null) // { totalCA, totalAchats, totalDepenses, margeBrute, resultatNet, depensesParCategorie, parMois }
  const [sansDate, setSansDate] = useState([]) // lignes sans date_facture, donc invisibles dans le calcul ci-dessus quelle que soit la période

  const { debut, fin } = periodePerso && debutPerso && finPerso
    ? { debut: debutPerso, fin: finPerso }
    : { debut: annee + '-01-01', fin: annee + '-12-31' }

  useEffect(() => { charger() }, [annee, periodePerso, debutPerso, finPerso])

  // "En live" doit vraiment vouloir dire à jour, même si l'onglet/la
  // fenêtre était déjà ouverte avant qu'une dépense/facture soit ajoutée
  // ailleurs (autre onglet, autre fenêtre) — sans ce recalcul, la page
  // reste figée sur les chiffres du moment où elle a été chargée, ce qui
  // donne l'impression que des lignes manquent. On recharge donc aussi
  // dès que l'onglet redevient visible/actif.
  useEffect(() => {
    function surRetourFocus() { charger() }
    function surChangementVisibilite() { if (document.visibilityState === 'visible') charger() }
    window.addEventListener('focus', surRetourFocus)
    document.addEventListener('visibilitychange', surChangementVisibilite)
    return () => {
      window.removeEventListener('focus', surRetourFocus)
      document.removeEventListener('visibilitychange', surChangementVisibilite)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [{ data: fcli, error: fcliErr }, { data: ffrs, error: ffrsErr }, { data: dep, error: depErr },
        { data: fcliSansDate }, { data: ffrsSansDate }, { data: depSansDate }] = await Promise.all([
        supabase.from('factures_cli').select('montant_ht, date_facture').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
        supabase.from('factures_frs').select('montant_ht, date_facture').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
        supabase.from('depenses_generales').select('montant_ht, date_facture, categorie').is('deleted_at', null).gte('date_facture', debut).lte('date_facture', fin),
        // Une ligne sans date de facture ne peut matcher aucun filtre
        // gte/lte ci-dessus (comparaison avec null) : elle est donc invisible
        // dans le compte de résultat quelle que soit la période choisie, sans
        // aucune erreur — d'où le signalement explicite ci-dessous plutôt que
        // de laisser croire à un problème de rafraîchissement.
        supabase.from('factures_cli').select('id, numero, montant_ht').is('deleted_at', null).is('date_facture', null),
        supabase.from('factures_frs').select('id, numero, montant_ht').is('deleted_at', null).is('date_facture', null),
        supabase.from('depenses_generales').select('id, libelle, montant_ht').is('deleted_at', null).is('date_facture', null),
      ])
      if (fcliErr) throw fcliErr
      if (ffrsErr) throw ffrsErr
      // depenses_generales peut ne pas encore exister (migration non
      // exécutée) — on l'ignore silencieusement dans ce cas plutôt que de
      // faire planter toute la page, le reste du compte de résultat reste
      // utilisable.
      const depData = depErr ? [] : (dep || [])

      setSansDate([
        ...(fcliSansDate || []).map(f => ({ label: f.numero || 'Facture client sans numéro', montant: f.montant_ht, type: 'Facture client' })),
        ...(ffrsSansDate || []).map(f => ({ label: f.numero || 'Facture fournisseur sans numéro', montant: f.montant_ht, type: 'Facture fournisseur' })),
        ...(depSansDate || []).map(d => ({ label: d.libelle || 'Dépense sans nom', montant: d.montant_ht, type: 'Dépense générale' })),
      ])

      const totalCA = (fcli || []).reduce((s, f) => s + (f.montant_ht || 0), 0)
      const totalAchats = (ffrs || []).reduce((s, f) => s + (f.montant_ht || 0), 0)
      const totalDepenses = depData.reduce((s, d) => s + (d.montant_ht || 0), 0)
      const margeBrute = totalCA - totalAchats
      const resultatNet = margeBrute - totalDepenses

      const parCategorieMap = {}
      for (const d of depData) {
        const cat = d.categorie || 'Autre'
        parCategorieMap[cat] = (parCategorieMap[cat] || 0) + (d.montant_ht || 0)
      }
      const depensesParCategorie = Object.entries(parCategorieMap)
        .map(([categorie, montant]) => ({ categorie, montant }))
        .sort((a, b) => b.montant - a.montant)

      // Répartition mensuelle — un mois par entrée entre `debut` et `fin`
      // (inclus), même si la période est personnalisée et ne tombe pas
      // pile sur une année civile.
      const parMois = []
      const curseur = new Date(debut + 'T00:00:00')
      const finDate = new Date(fin + 'T00:00:00')
      while (curseur <= finDate) {
        const y = curseur.getFullYear()
        const m = curseur.getMonth()
        const cleMois = y + '-' + String(m + 1).padStart(2, '0')
        parMois.push({ cle: cleMois, label: MOIS_LABELS[m] + ' ' + String(y).slice(2), ca: 0, charges: 0 })
        curseur.setMonth(curseur.getMonth() + 1)
      }
      const indexMois = new Map(parMois.map((mo, i) => [mo.cle, i]))
      const cleDe = dateStr => { const d = new Date(dateStr + 'T00:00:00'); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
      for (const f of (fcli || [])) {
        if (!f.date_facture) continue
        const idx = indexMois.get(cleDe(f.date_facture))
        if (idx !== undefined) parMois[idx].ca += (f.montant_ht || 0)
      }
      for (const f of (ffrs || [])) {
        if (!f.date_facture) continue
        const idx = indexMois.get(cleDe(f.date_facture))
        if (idx !== undefined) parMois[idx].charges += (f.montant_ht || 0)
      }
      for (const d of depData) {
        if (!d.date_facture) continue
        const idx = indexMois.get(cleDe(d.date_facture))
        if (idx !== undefined) parMois[idx].charges += (d.montant_ht || 0)
      }

      setData({ totalCA, totalAchats, totalDepenses, margeBrute, resultatNet, depensesParCategorie, parMois })
    } catch (err) {
      setError('Impossible de calculer le compte de résultat : ' + err.message)
    }
    setLoading(false)
  }

  const anneesDispos = Array.from({ length: 6 }, (_, i) => anneeCourante() - 4 + i)
  const tauxMarge = data && data.totalCA ? Math.round((data.margeBrute / data.totalCA) * 1000) / 10 : 0
  const tauxNet = data && data.totalCA ? Math.round((data.resultatNet / data.totalCA) * 1000) / 10 : 0
  const maxMois = data ? Math.max(1, ...data.parMois.flatMap(m => [m.ca, m.charges])) : 1

  return (
    <div style={{ padding: isMobile ? '28px 18px 60px' : '48px 40px 80px', fontFamily: fonts.display, color: colors.ink, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={eyebrow}>Partenaires Particuliers</p>
          <h1 style={{ margin: '14px 0 0', fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.015em' }}>Compte de résultat</h1>
          <p style={{ color: colors.inkMuted, fontSize: 13, margin: '10px 0 0', maxWidth: 480 }}>
            Vue d'ensemble en direct — CA, achats, dépenses générales, à partir des factures émises/reçues (payées ou non)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {!periodePerso && (
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))} style={{ ...inputUnderline, cursor: 'pointer' }}>
              {anneesDispos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {periodePerso && (
            <>
              <input type="date" value={debutPerso} onChange={e => setDebutPerso(e.target.value)} style={inputUnderline} />
              <span style={{ color: colors.inkFaint, fontSize: 13 }}>→</span>
              <input type="date" value={finPerso} onChange={e => setFinPerso(e.target.value)} style={inputUnderline} />
            </>
          )}
          <button onClick={() => setPeriodePerso(p => !p)} style={quietLink}>
            {periodePerso ? 'Annuler la période perso' : 'Période perso'}
          </button>
          <button onClick={charger} disabled={loading} title="Recalculer avec les dernières données" style={quietLink}>
            {loading ? '...' : 'Actualiser'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', margin: '28px 0 0', fontSize: 13 }}>
          {error}
        </div>
      )}

      {sansDate.length > 0 && (
        <div style={{ borderLeft: '2px solid ' + colors.warning, color: colors.ink, padding: '12px 16px', margin: '28px 0 0', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: colors.warning }}>
            {sansDate.length} ligne{sansDate.length > 1 ? 's' : ''} sans date de facture — exclue{sansDate.length > 1 ? 's' : ''} du calcul ci-dessous, quelle que soit la période choisie
          </div>
          <div style={{ marginBottom: 6, color: colors.inkMuted }}>Renseigne une date de facture sur chacune pour qu'elle soit comptée :</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: colors.inkMuted }}>
            {sansDate.map((s, i) => (
              <li key={i}>{s.type} — {s.label} ({fmt(s.montant)})</li>
            ))}
          </ul>
        </div>
      )}

      {loading || !data ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>Calcul en cours...</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', margin: '36px 0 40px' }}>
            {[
              { label: 'Chiffre d\'affaires', value: fmt(data.totalCA), sub: 'Factures clients émises' },
              { label: 'Achats projets', value: fmt(data.totalAchats), sub: 'Factures fournisseurs' },
              { label: 'Marge brute', value: fmt(data.margeBrute), sub: 'Taux : ' + tauxMarge + '%', color: data.margeBrute >= 0 ? colors.success : colors.danger },
              { label: 'Dépenses générales', value: fmt(data.totalDepenses), sub: 'Loyer, compta, assurance...' },
              { label: 'Résultat net', value: fmt(data.resultatNet), sub: 'Taux : ' + tauxNet + '%', color: data.resultatNet >= 0 ? colors.success : colors.danger },
            ].map((k, i) => (
              <div key={k.label} style={{ padding: isMobile ? '16px 0' : '0 24px', borderLeft: (!isMobile && i > 0) ? '1px solid ' + colors.line : 'none', borderTop: (isMobile && i > 1) ? '1px solid ' + colors.line : 'none' }}>
                <div style={eyebrow}>{k.label}</div>
                <div style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 500, margin: '8px 0 4px', fontVariantNumeric: 'tabular-nums', color: k.color || colors.ink }}>{k.value}</div>
                <div style={{ fontSize: 11, color: colors.inkFaint }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 40 : 48 }}>

            {/* Répartition mensuelle */}
            <div>
              <h2 style={sectionTitle}>Évolution mensuelle</h2>
              <div style={{ fontSize: 11.5, color: colors.inkMuted, margin: '12px 0 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={marker(colors.ink)} />CA</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={marker(colors.inkFaint)} />Charges (achats + dépenses générales)</span>
              </div>
              {data.parMois.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line }}>Aucune donnée sur cette période.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 4 : 8, height: 160, overflowX: 'auto', borderBottom: '1px solid ' + colors.line, paddingBottom: 1 }}>
                  {data.parMois.map(m => (
                    <div key={m.cle} style={{ flex: '1 0 auto', minWidth: isMobile ? 28 : 36, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%' }} title={m.label + ' — CA ' + fmt(m.ca) + ' · Charges ' + fmt(m.charges)}>
                        <div style={{ flex: 1, background: colors.ink, height: Math.max(2, (m.ca / maxMois) * 100) + '%' }} />
                        <div style={{ flex: 1, background: colors.inkFaint, height: Math.max(2, (m.charges / maxMois) * 100) + '%' }} />
                      </div>
                      <div style={{ fontSize: 9, color: colors.inkFaint, marginTop: 6, whiteSpace: 'nowrap' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dépenses générales par catégorie */}
            <div>
              <h2 style={sectionTitle}>Dépenses générales par catégorie</h2>
              {data.depensesParCategorie.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13, borderTop: '1px solid ' + colors.line, marginTop: 12 }}>Aucune dépense sur cette période</div>
              ) : (
                <div style={{ borderTop: '1px solid ' + colors.line, marginTop: 12 }}>
                  {data.depensesParCategorie.map(c => (
                    <div key={c.categorie} style={{ padding: '12px 0', borderBottom: '1px solid ' + colors.line }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, color: colors.inkMuted }}>{c.categorie}</span>
                        <span style={{ fontFamily: fonts.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{fmt(c.montant)}</span>
                      </div>
                      <div style={{ background: colors.line, height: 3 }}>
                        <div style={{ background: colors.ink, height: '100%', width: (data.totalDepenses ? (c.montant / data.totalDepenses) * 100 : 0) + '%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
