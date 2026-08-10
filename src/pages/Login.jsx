import { useState } from 'react'
import { supabase } from '../lib/supabase'

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F0', fontFamily: 'Inter, sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, padding: 36, width: 360, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB', boxSizing: 'border-box' }}>
        <img src="/logo-pp.png" alt="Partenaires Particuliers" style={{ height: 40, width: 'auto', display: 'block', marginBottom: 6 }} />
        <div style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 24 }}>Partenaires Particuliers — ERP</div>

        {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

        <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Mot de passe</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 20, boxSizing: 'border-box' }} />

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
