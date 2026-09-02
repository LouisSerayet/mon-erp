import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { colors, fonts, eyebrow } from '../lib/theme'

const inputUnderline = {
  width: '100%', padding: '9px 2px', background: 'transparent', border: 'none',
  borderBottom: '1px solid ' + colors.line, fontSize: 13, boxSizing: 'border-box',
  fontFamily: fonts.display, color: colors.ink,
}
const fieldLabel = { display: 'block', fontSize: 11, color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Identifiant ou mot de passe incorrect.' : error.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, fontFamily: fonts.display }}>
      <form onSubmit={handleSubmit} style={{ background: colors.surface, padding: 40, width: 360, border: '1px solid ' + colors.line, boxSizing: 'border-box' }}>
        <img src="/logo-pp.png" alt="Partenaires Particuliers" style={{ height: 36, width: 'auto', display: 'block', marginBottom: 10 }} />
        <p style={{ ...eyebrow, marginBottom: 32 }}>Partenaires Particuliers — ERP</p>

        {error && <div style={{ borderLeft: '2px solid ' + colors.danger, color: colors.danger, padding: '8px 12px', marginBottom: 18, fontSize: 13 }}>{error}</div>}

        <label style={fieldLabel}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username"
          style={{ ...inputUnderline, marginBottom: 20 }} />

        <label style={fieldLabel}>Mot de passe</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
          style={{ ...inputUnderline, marginBottom: 28 }} />

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '11px', border: 'none', background: colors.ink, color: colors.surface, fontWeight: 600, fontSize: 14, fontFamily: fonts.display, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
