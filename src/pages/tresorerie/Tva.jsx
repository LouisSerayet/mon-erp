import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchTva } from '../../lib/tva'
import { useIsMobile } from '../../lib/useIsMobile'
import { colors, fonts, quietLink } from '../../lib/theme'
import { BlocTva } from '../../components/BlocTva'

function anneeCourante() { return new Date().getFullYear() }
const inputUnderline = {
  padding: '7px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}

// Onglet "TVA" de Trésorerie — mêmes filtres de période (année ou période
// perso) que l'onglet "Compte de résultat" d'à côté, pour calculer une TVA
// collectée/déductible sur n'importe quelle période sans mélanger ça avec
// CA/marge/dépenses. Calcul partagé via lib/tva.js (fetchTva) — jamais
// recalculé à la main ici, pour ne pas risquer de diverger silencieusement
// du Compte de résultat (qui utilisait avant la même logique en interne,
// voir CompteResultat.jsx).
export default function Tva() {
  const isMobile = useIsMobile()
  const [annee, setAnnee] = useState(anneeCourante())
  const [periodePerso, setPeriodePerso] = useState(false)
  const [debutPerso, setDebutPerso] = useState('')
  const [finPerso, setFinPerso] = useState('')
  const { debut, fin } = periodePerso && debutPerso && finPerso
    ? { debut: debutPerso, fin: finPerso }
    : { debut: annee + '-01-01', fin: annee + '-12-31' }
  const [tvaPeriode, setTvaPeriode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { charger() }, [annee, periodePerso, debutPerso, finPerso])

  async function charger() {
    setLoading(true)
    setError('')
    try {
      setTvaPeriode(await fetchTva(supabase, { debut, fin }))
    } catch (err) {
      console.error('TVA (période) error:', err)
      setTvaPeriode(null)
      setError('Impossible de calculer la TVA sur cette période : ' + err.message)
    }
    setLoading(false)
  }

  const anneesDispos = Array.from({ length: 6 }, (_, i) => anneeCourante() - 4 + i)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
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

      {error && (
        <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '10px 14px', margin: '0 0 20px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !tvaPeriode ? (
        <div style={{ padding: '30px 0', textAlign: 'center', color: colors.inkFaint, fontSize: 13 }}>Calcul en cours...</div>
      ) : (
        <BlocTva data={tvaPeriode} isMobile={isMobile} />
      )}
    </div>
  )
}
