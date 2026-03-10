import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, username, display_name: username })
        if (profileError) { setError(profileError.message); setLoading(false); return }
      }
      setMessage('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-[#111]">Lock In</h1>
          <p className="text-sm text-[#888] mt-1">
            {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-white border border-[#e5e5e5] text-sm text-[#111] placeholder-[#bbb] focus:outline-none focus:border-[#4F46E5] transition-colors"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-white border border-[#e5e5e5] text-sm text-[#111] placeholder-[#bbb] focus:outline-none focus:border-[#4F46E5] transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-white border border-[#e5e5e5] text-sm text-[#111] placeholder-[#bbb] focus:outline-none focus:border-[#4F46E5] transition-colors"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}
          {message && <p className="text-xs text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#111] text-white text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-xs text-[#888]">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
            className="text-[#4F46E5] hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}