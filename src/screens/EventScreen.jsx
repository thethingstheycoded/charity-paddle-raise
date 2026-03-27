import { useState, useRef } from 'react'
import { useEvent } from '../hooks/useEvent.js'
import { useTheme } from '../hooks/useTheme.js'
import ReconciliationView from '../components/ReconciliationView.jsx'

function formatDollars(amount) {
  if (amount >= 1000) {
    const k = amount / 1000
    return `$${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return `$${amount}`
}

function formatFull(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(amount)
}

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Themed element helpers ────────────────────────────────────────────────────
// These use CSS custom properties set on the root div so every element
// automatically reflects the logo's extracted colors. The var() fallbacks
// ensure the app looks correct even with no logo uploaded.

const A = {
  /** Solid accent background */
  bg:     { backgroundColor: 'var(--accent, #2563eb)' },
  /** Accent background, darker */
  bgDark: { backgroundColor: 'var(--accent-dark, #1d4ed8)' },
  /** Faint accent tint */
  faded:  { backgroundColor: 'var(--accent-faded, rgba(37,99,235,0.18))' },
  /** Accent border color */
  border: { borderColor: 'var(--accent, #2563eb)' },
  /** Ring (active selection) */
  ring:   { boxShadow: '0 0 0 2px var(--accent-light, #60a5fa)' },
  /** Text on an accent background (auto white/dark) */
  text:   { color: 'var(--on-accent, #ffffff)' },
  /** Accent-coloured text */
  accent: { color: 'var(--accent, #60a5fa)' },
  /** Tab active indicator */
  tabBorder: { borderBottomColor: 'var(--accent, #3b82f6)' },
}

export default function EventScreen({ session, spotter, onLeave }) {
  const { levels, pledges, loading, error, actions } = useEvent(session.eventId)
  const { cssVars, onImageLoad } = useTheme()

  const [activeLevel, setActiveLevel]     = useState(null)
  const [paddleInput, setPaddleInput]     = useState('')
  const [addingLevel, setAddingLevel]     = useState(false)
  const [newLevelInput, setNewLevelInput] = useState('')
  const [flash, setFlash]                 = useState(null)
  const [showAll, setShowAll]             = useState(false)
  const [confirmClear, setConfirmClear]   = useState(false)
  const [confirmLeave, setConfirmLeave]   = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const flashTimer = useRef(null)

  function triggerFlash(paddle, type) {
    clearTimeout(flashTimer.current)
    setFlash({ paddle, type })
    flashTimer.current = setTimeout(() => setFlash(null), type === 'success' ? 800 : 1500)
  }

  function submitPaddle(value) {
    const raw = value ?? paddleInput
    const num = parseInt(raw, 10)
    if (!raw || isNaN(num) || num < 1 || num > 999) { setPaddleInput(''); return }
    const paddle = String(num).padStart(3, '0')
    const alreadyMine = pledges.some(
      p => p.level_amount === activeLevel && p.paddle === paddle && p.spotter_id === spotter.id
    )
    if (alreadyMine) { triggerFlash(paddle, 'duplicate'); setPaddleInput(''); return }
    actions.addPledge({ paddle, levelAmount: activeLevel, spotterId: spotter.id, spotterName: spotter.name })
    triggerFlash(paddle, 'success')
    setPaddleInput('')
  }

  function handleKeypadPress(key) {
    if (key === 'DEL') {
      setPaddleInput(p => p.slice(0, -1))
    } else if (key === 'CLR') {
      setPaddleInput('')
    } else if (key === 'ENT') {
      submitPaddle()
    } else if (paddleInput.length < 3) {
      const next = paddleInput + key
      setPaddleInput(next)
      if (next.length === 3) submitPaddle(next)
    }
  }

  function handleAddLevel() {
    const val = parseInt(newLevelInput.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(val) && val > 0) {
      actions.addLevel(val)
      setActiveLevel(val)
      setPaddleInput('')
    }
    setNewLevelInput('')
    setAddingLevel(false)
  }

  function handleClearPledges() {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    actions.clearPledges(); setActiveLevel(null); setPaddleInput(''); setConfirmClear(false)
  }

  function handleLeave() {
    if (!confirmLeave) { setConfirmLeave(true); setTimeout(() => setConfirmLeave(false), 3000); return }
    onLeave()
  }

  const activeLevelPledges  = activeLevel != null ? pledges.filter(p => p.level_amount === activeLevel) : []
  const myActivePledges     = activeLevelPledges.filter(p => p.spotter_id === spotter.id)
  const othersActivePledges = activeLevelPledges.filter(p => p.spotter_id !== spotter.id)

  const uniquePairs     = new Map(pledges.map(p => [`${p.paddle}:${p.level_amount}`, p.level_amount]))
  const uniqueCount     = uniquePairs.size
  const totalRaised     = [...uniquePairs.values()].reduce((s, v) => s + v, 0)

  const paddleDisplay = flash?.paddle
    ? flash.paddle
    : paddleInput.padEnd(3, '_').split('').join(' ')

  const displayPledges = showAll ? pledges : pledges.slice(0, 20)

  if (showReconcile) {
    return <ReconciliationView pledges={pledges} cssVars={cssVars} onClose={() => setShowReconcile(false)} />
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white flex flex-col select-none"
      style={cssVars}
    >
      {/* Hidden image for color extraction — crossOrigin required for canvas read */}
      {session.logoUrl && (
        <img
          src={session.logoUrl}
          alt=""
          crossOrigin="anonymous"
          onLoad={e => onImageLoad(e.target)}
          className="hidden"
        />
      )}

      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-4 flex-wrap">
        {/* Logo */}
        {session.logoUrl && (
          <img
            src={session.logoUrl}
            alt="Event logo"
            className="h-10 w-auto max-w-24 object-contain rounded shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white leading-tight truncate">{session.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-gray-500 text-xs">{formatDate(session.eventDate)}</span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-500 text-xs">Code: <span className="font-mono text-gray-400">{session.code}</span></span>
            <span className="text-gray-600 text-xs">·</span>
            <span className="text-gray-400 text-xs">{spotter.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">{formatFull(totalRaised)}</div>
            <div className="text-gray-500 text-xs uppercase tracking-wide">Raised</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={A.accent}>{uniqueCount}</div>
            <div className="text-gray-500 text-xs uppercase tracking-wide">Pledges</div>
          </div>
          <button
            onClick={() => setShowReconcile(true)}
            style={{ ...A.bgDark, ...A.border }}
            className="px-3 py-1.5 text-white text-sm font-semibold rounded border transition-colors hover:brightness-110"
          >
            Reconcile
          </button>
          <button
            onClick={handleClearPledges}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              confirmClear
                ? 'bg-red-600 border-red-500 text-white'
                : 'border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500'
            }`}
          >
            {confirmClear ? 'Tap again to clear' : 'Clear pledges'}
          </button>
          <button
            onClick={handleLeave}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              confirmLeave
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'border-gray-700 text-gray-600 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            {confirmLeave ? 'Tap again to leave' : 'Leave'}
          </button>
        </div>
      </header>

      {loading && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 text-center text-gray-500 text-sm">Loading event data…</div>
      )}
      {error && (
        <div className="bg-red-900/30 border-b border-red-800 px-4 py-2 text-center text-red-300 text-sm">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Donation levels ── */}
        <aside className="w-40 sm:w-48 bg-gray-900 border-r border-gray-700 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-700">
            <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Levels</div>
          </div>
          <div className="flex flex-col gap-1.5 p-2 flex-1">
            {levels.map(level => {
              const uniquePaddles = new Set(pledges.filter(p => p.level_amount === level).map(p => p.paddle))
              const isActive = activeLevel === level
              return (
                <button
                  key={level}
                  onClick={() => { setActiveLevel(level); setPaddleInput('') }}
                  style={isActive ? { ...A.bg, ...A.ring } : {}}
                  className={`w-full text-left px-3 py-3 rounded-lg font-bold transition-all active:scale-95 ${
                    isActive ? 'text-white shadow-lg' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-lg">{formatDollars(level)}</div>
                  {uniquePaddles.size > 0 && (
                    <div
                      className="text-xs font-normal mt-0.5"
                      style={isActive ? { color: 'var(--on-accent, white)', opacity: 0.8 } : { color: '#9ca3af' }}
                    >
                      {uniquePaddles.size} pledge{uniquePaddles.size !== 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-2 border-t border-gray-700">
            {addingLevel ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text" inputMode="numeric" placeholder="e.g. 750"
                  value={newLevelInput}
                  onChange={e => setNewLevelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddLevel(); if (e.key === 'Escape') setAddingLevel(false) }}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-400"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleAddLevel}
                    style={A.bg}
                    className="flex-1 text-white text-xs py-1.5 rounded font-semibold hover:brightness-110"
                  >Add</button>
                  <button onClick={() => setAddingLevel(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs py-1.5 rounded">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingLevel(true)}
                className="w-full bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 text-gray-400 hover:text-white text-sm py-2 rounded-lg transition-colors"
              >
                + Add Level
              </button>
            )}
          </div>
        </aside>

        {/* ── Center: Keypad ── */}
        <main className="flex-1 flex flex-col items-center justify-start p-4 gap-4 overflow-y-auto">
          {activeLevel === null ? (
            <div className="flex-1 flex items-center justify-center">
              {session.logoUrl ? (
                <div className="text-center">
                  <img
                    src={session.logoUrl}
                    alt="Event logo"
                    className="h-24 w-auto max-w-48 object-contain mx-auto mb-6 opacity-40"
                  />
                  <div className="text-xl font-semibold text-gray-400">Select a donation level</div>
                  <div className="text-sm mt-2 text-gray-600">Tap a level on the left to start recording pledges</div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <div className="text-5xl mb-3">←</div>
                  <div className="text-xl font-semibold text-gray-400">Select a donation level</div>
                  <div className="text-sm mt-2">Tap a level on the left to start recording pledges</div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Active level badge */}
              <div className="w-full max-w-xs">
                <div
                  style={A.bg}
                  className="rounded-2xl px-6 py-4 text-center shadow-xl"
                >
                  <div className="text-sm uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--on-accent, white)', opacity: 0.75 }}>
                    Active Level
                  </div>
                  <div className="text-4xl font-bold" style={A.text}>{formatFull(activeLevel)}</div>
                  <div className="text-sm mt-1" style={{ color: 'var(--on-accent, white)', opacity: 0.7 }}>
                    {new Set(activeLevelPledges.map(p => p.paddle)).size} unique paddle{new Set(activeLevelPledges.map(p => p.paddle)).size !== 1 ? 's' : ''} recorded
                  </div>
                </div>
              </div>

              {/* Paddle display */}
              <div className={`w-full max-w-xs rounded-2xl border-4 transition-all duration-100 ${
                flash?.type === 'success'   ? 'border-green-400 bg-green-900/30' :
                flash?.type === 'duplicate' ? 'border-red-500 bg-red-900/30'    :
                'border-gray-700 bg-gray-900'
              }`}>
                <div className="px-6 py-5 text-center">
                  <div className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-semibold">Paddle #</div>
                  <div className={`text-6xl font-mono font-bold tracking-widest ${
                    flash?.type === 'success'   ? 'text-green-400' :
                    flash?.type === 'duplicate' ? 'text-red-400'   :
                    paddleInput.length > 0      ? 'text-white'     : 'text-gray-700'
                  }`}>
                    {paddleDisplay}
                  </div>
                  {flash?.type === 'duplicate' && <div className="text-red-400 text-sm mt-2 font-semibold">Already recorded by you!</div>}
                  {flash?.type === 'success'   && <div className="text-green-400 text-sm mt-2 font-semibold">Pledge recorded!</div>}
                </div>
              </div>

              {/* Keypad */}
              <div className="w-full max-w-xs">
                <div className="grid grid-cols-3 gap-2">
                  {['1','2','3','4','5','6','7','8','9','CLR','0','DEL'].map(key => (
                    <button
                      key={key}
                      onClick={() => handleKeypadPress(key)}
                      className={`h-16 rounded-xl font-bold text-2xl transition-all active:scale-95 ${
                        key === 'CLR' || key === 'DEL'
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg'
                          : 'bg-gray-800 hover:bg-gray-700 text-white shadow-md'
                      }`}
                    >
                      {key === 'DEL' ? '⌫' : key}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => submitPaddle()}
                  disabled={paddleInput.length === 0}
                  className="w-full mt-2 h-16 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold text-xl rounded-xl transition-all active:scale-95 shadow-lg"
                >
                  RECORD PLEDGE
                </button>
              </div>

              {/* Pledges at this level */}
              {activeLevelPledges.length > 0 && (
                <div className="w-full max-w-xs space-y-3">
                  {myActivePledges.length > 0 && (
                    <div>
                      <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold mb-2">Your entries</div>
                      <div className="flex flex-wrap gap-2">
                        {myActivePledges.map(p => (
                          <span key={p.id} className="inline-flex items-center bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 font-mono font-bold text-white text-sm gap-1.5">
                            {p.paddle}
                            <button onClick={() => actions.removePledge(p.id)} className="text-gray-600 hover:text-red-400 transition-colors leading-none text-base">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {othersActivePledges.length > 0 && (
                    <div>
                      <div className="text-gray-600 text-xs uppercase tracking-wide font-semibold mb-2">Other spotters</div>
                      <div className="flex flex-wrap gap-2">
                        {othersActivePledges.map(p => (
                          <span key={p.id} className="inline-flex items-center bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 font-mono text-gray-400 text-sm gap-1.5" title={`Recorded by ${p.spotter_name}`}>
                            {p.paddle}
                            <span className="text-gray-600 text-xs">{p.spotter_name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* ── Right: Pledge log ── */}
        <aside className="hidden lg:flex w-64 xl:w-72 bg-gray-900 border-l border-gray-700 flex-col shrink-0">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold">
              All Pledges ({pledges.length})
            </div>
            {pledges.length > 0 && (
              <button onClick={() => actions.removePledge(pledges[0]?.id)} className="text-xs text-gray-500 hover:text-yellow-400 transition-colors">
                Undo last
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {pledges.length === 0 ? (
              <div className="text-gray-600 text-sm text-center mt-8">No pledges yet</div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {displayPledges.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm group">
                      <span className="font-mono font-bold text-white w-10 shrink-0">{p.paddle}</span>
                      <span className="font-semibold w-14 shrink-0" style={A.accent}>{formatDollars(p.level_amount)}</span>
                      <span className="text-gray-500 text-xs truncate flex-1">{p.spotter_name}</span>
                      <button onClick={() => actions.removePledge(p.id)} className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none shrink-0">×</button>
                    </div>
                  ))}
                </div>
                {pledges.length > 20 && !showAll && (
                  <button onClick={() => setShowAll(true)} className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 py-2">
                    Show all {pledges.length} pledges
                  </button>
                )}
              </>
            )}
          </div>

          {pledges.length > 0 && (
            <div className="border-t border-gray-700 p-3 space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wide font-semibold mb-2">Breakdown</div>
              {levels.map(level => {
                const unique = new Set(pledges.filter(p => p.level_amount === level).map(p => p.paddle))
                if (unique.size === 0) return null
                return (
                  <div key={level} className="flex justify-between text-xs text-gray-400">
                    <span>{formatDollars(level)} × {unique.size}</span>
                    <span className="text-green-400 font-semibold">{formatFull(level * unique.size)}</span>
                  </div>
                )
              })}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-700 mt-2">
                <span className="text-gray-300">Total</span>
                <span className="text-green-400">{formatFull(totalRaised)}</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
