import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const DEFAULT_LEVELS = [50000, 25000, 10000, 5000, 2500, 1000, 500, 250, 100]

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function suggestCode(name) {
  const year = new Date().getFullYear().toString().slice(-2)
  const word = name.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')
  return word.slice(0, 8) + year
}

// ── Shared field component ────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-gray-400 text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      className="bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-base w-full"
    />
  )
}

// ── Create Event tab ──────────────────────────────────────────────────────────

function CreateEventForm({ onJoined }) {
  const [form, setForm] = useState({
    name: '', code: '', password: '', confirmPassword: '', eventDate: '', spotterName: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field) {
    return (e) => {
      const value = e.target.value
      setForm(prev => {
        const next = { ...prev, [field]: value }
        // Auto-suggest code from name
        if (field === 'name' && !prev.code) {
          next.code = suggestCode(value)
        }
        return next
      })
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) return setError('Event name is required.')
    if (form.code.length < 3) return setError('Event code must be at least 3 characters.')
    if (!/^[A-Za-z0-9]+$/.test(form.code)) return setError('Event code can only contain letters and numbers.')
    if (form.password.length < 4) return setError('Password must be at least 4 characters.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    if (!form.eventDate) return setError('Event date is required.')
    if (!form.spotterName.trim()) return setError('Your name is required.')

    setLoading(true)

    const { data, error: rpcError } = await supabase.rpc('create_event', {
      p_name:       form.name.trim(),
      p_code:       form.code.toUpperCase(),
      p_password:   form.password,
      p_event_date: form.eventDate,
      p_levels:     DEFAULT_LEVELS,
    })

    setLoading(false)

    if (rpcError) return setError(rpcError.message)

    const spotter = { id: randomId(), name: form.spotterName.trim() }
    onJoined({ eventId: data.id, name: data.name, code: data.code, eventDate: data.event_date }, spotter)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Event name">
        <Input
          type="text"
          placeholder="e.g. Hearts for Kids – 2024 Gala"
          value={form.name}
          onChange={set('name')}
          maxLength={80}
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Event date">
          <Input type="date" value={form.eventDate} onChange={set('eventDate')} />
        </Field>
        <Field label="Join code">
          <Input
            type="text"
            placeholder="e.g. HEARTS24"
            value={form.code}
            onChange={set('code')}
            maxLength={20}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Password">
          <Input type="password" placeholder="Shared with all spotters" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Confirm password">
          <Input type="password" placeholder="" value={form.confirmPassword} onChange={set('confirmPassword')} />
        </Field>
      </div>

      <Field label="Your name">
        <Input type="text" placeholder="e.g. Sarah" value={form.spotterName} onChange={set('spotterName')} maxLength={30} />
      </Field>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-lg py-3 rounded-xl transition-colors mt-1"
      >
        {loading ? 'Creating…' : 'Create Event'}
      </button>
    </form>
  )
}

// ── Join Event tab ────────────────────────────────────────────────────────────

function JoinEventForm({ onJoined }) {
  const [form, setForm] = useState({ code: '', password: '', spotterName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field) {
    return (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (!form.code.trim()) return setError('Event code is required.')
    if (!form.password) return setError('Password is required.')
    if (!form.spotterName.trim()) return setError('Your name is required.')

    setLoading(true)

    const { data, error: rpcError } = await supabase.rpc('join_event', {
      p_code:     form.code.trim(),
      p_password: form.password,
    })

    setLoading(false)

    if (rpcError) return setError(rpcError.message)
    if (!data) return setError('Invalid event code or password.')

    const spotter = { id: randomId(), name: form.spotterName.trim() }
    onJoined({ eventId: data.id, name: data.name, code: data.code, eventDate: data.event_date }, spotter)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Event code">
        <Input
          type="text"
          placeholder="e.g. HEARTS24"
          value={form.code}
          onChange={set('code')}
          maxLength={20}
          autoCapitalize="characters"
          autoFocus
        />
      </Field>

      <Field label="Password">
        <Input
          type="password"
          placeholder="Shared password for this event"
          value={form.password}
          onChange={set('password')}
        />
      </Field>

      <Field label="Your name">
        <Input
          type="text"
          placeholder="e.g. Sarah"
          value={form.spotterName}
          onChange={set('spotterName')}
          maxLength={30}
        />
      </Field>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-lg py-3 rounded-xl transition-colors mt-1"
      >
        {loading ? 'Joining…' : 'Join Event'}
      </button>
    </form>
  )
}

// ── Landing screen ────────────────────────────────────────────────────────────

export default function LandingScreen({ onJoined }) {
  const [tab, setTab] = useState('join')

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-700">
          <div className="text-4xl mb-3">🏏</div>
          <h1 className="text-2xl font-bold text-white">Paddle Raise Tracker</h1>
          <p className="text-gray-400 text-sm mt-1">Multi-spotter pledge tracking for charity events</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { key: 'join', label: 'Join Event' },
            { key: 'create', label: 'Create Event' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="p-6">
          {tab === 'join'
            ? <JoinEventForm onJoined={onJoined} />
            : <CreateEventForm onJoined={onJoined} />
          }
        </div>
      </div>
    </div>
  )
}
