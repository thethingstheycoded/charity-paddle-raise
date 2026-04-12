import { useState, useRef, useEffect } from 'react'
import { useEvent } from '../hooks/useEvent.js'
import { useTheme } from '../hooks/useTheme.js'
import { supabase } from '../lib/supabase.js'
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

const A = {
  bg:       { backgroundColor: 'var(--accent, #2563eb)' },
  bgDark:   { backgroundColor: 'var(--accent-dark, #1d4ed8)' },
  border:   { borderColor: 'var(--accent, #2563eb)' },
  ring:     { boxShadow: '0 0 0 2px var(--accent-light, #60a5fa)' },
  text:     { color: 'var(--on-accent, #ffffff)' },
  accent:   { color: 'var(--accent, #2563eb)' },
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
  const [confirmLeave, setConfirmLeave]   = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [showReconcile, setShowReconcile] = useState(false)
  const flashTimer     = useRef(null)
  const confirmRmTimer = useRef(null)
  const carouselRef    = useRef(null)
  const activeLvlRef   = useRef(null)

  useEffect(() => {
    if (!activeLvlRef.current || !carouselRef.current) return
    const container = carouselRef.current
    const el = activeLvlRef.current
    const offset = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2
    container.scrollTo({ left: offset, behavior: 'smooth' })
  }, [activeLevel, levels])

  function triggerFlash(paddle, type) {
    clearTimeout(flashTimer.current)
    setFlash({ paddle, type })
    flashTimer.current = setTimeout(
      () => setFlash(null),
      type === 'success' ? 800 : type === 'error' ? 3000 : 1500
    )
  }

  async function submitPaddle(value) {
    const raw = value ?? paddleInput
    const num = parseInt(raw, 10)
    if (!raw || isNaN(num) || num < 1 || num > 999) { setPaddleInput(''); return }
    const paddle = String(num).padStart(3, '0')
    const alreadyMine = pledges.some(
      p => p.level_amount === activeLevel && p.paddle === paddle && p.spotter_id === spotter.id
    )
    if (alreadyMine) { triggerFlash(paddle, 'duplicate'); setPaddleInput(''); return }
    setPaddleInput('')
    const { error } = await actions.addPledge({ paddle, levelAmount: activeLevel, spotterId: spotter.id, spotterName: spotter.name })
    if (error) {
      console.error('addPledge failed:', error)
      triggerFlash(paddle, 'error')
    } else {
      triggerFlash(paddle, 'success')
    }
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

  function handleRemovePledge(id) {
    if (confirmRemove !== id) {
      clearTimeout(confirmRmTimer.current)
      setConfirmRemove(id)
      confirmRmTimer.current = setTimeout(() => setConfirmRemove(null), 2000)
    } else {
      clearTimeout(confirmRmTimer.current)
      setConfirmRemove(null)
      actions.removePledge(id)
    }
  }

  async function handleDeleteEvent(password) {
    const result = await actions.deleteEvent(password, session.code)
    if (result.error) return { error: result.error }
    onLeave()
    return { success: true }
  }

  async function handleClearPledges(password) {
    const { data, error } = await supabase.rpc('join_event', { p_code: session.code, p_password: password })
    if (error || !data) return { error: 'Incorrect password' }
    await actions.clearPledges()
    setActiveLevel(null)
    setPaddleInput('')
    return { success: true }
  }

  function handleLeave() {
    if (!confirmLeave) { setConfirmLeave(true); setTimeout(() => setConfirmLeave(false), 3000); return }
    onLeave()
  }

  const activeLevelPledges  = activeLevel != null ? pledges.filter(p => p.level_amount === activeLevel) : []
  const myActivePledges     = activeLevelPledges.filter(p => p.spotter_id === spotter.id)
  const othersActivePledges = activeLevelPledges.filter(p => p.spotter_id !== spotter.id)

  const uniquePairs = new Map(pledges.map(p => [`${p.paddle}:${p.level_amount}`, p.level_amount]))
  const uniqueCount = uniquePairs.size
  const totalRaised = [...uniquePairs.values()].reduce((s, v) => s + v, 0)

  const paddleDisplay = flash?.paddle
    ? flash.paddle
    : paddleInput.padEnd(3, '_').split('').join(' ')

  const flashText =
    flash?.type === 'success'   ? 'Pledge recorded!' :
    flash?.type === 'duplicate' ? 'Already recorded by you!' :
    flash?.type === 'error'     ? 'Failed to save — check console' : ''
  const flashTextColor =
    flash?.type === 'success'   ? 'text-green-600' :
    flash?.type === 'duplicate' ? 'text-red-500' :
    flash?.type === 'error'     ? 'text-orange-500' : ''

  const displayPledges = showAll ? pledges : pledges.slice(0, 20)

  if (showReconcile) {
    return <ReconciliationView pledges={pledges} cssVars={cssVars} onClose={() => setShowReconcile(false)} onClearPledges={handleClearPledges} onDeleteEvent={handleDeleteEvent} />
  }

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900 flex flex-col select-none"
      style={cssVars}
    >
      {session.logoUrl && (
        <img src={session.logoUrl} alt="" crossOrigin="anonymous" onLoad={e => onImageLoad(e.target)} className="hidden" />
      )}

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 flex-wrap shadow-sm">
        {session.logoUrl && (
          <img src={session.logoUrl} alt="Event logo" className="h-10 w-auto max-w-24 object-contain rounded shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">{session.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-gray-400 text-xs">{formatDate(session.eventDate)}</span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-gray-400 text-xs">Code: <span className="font-mono text-gray-600">{session.code}</span></span>
            <span className="text-gray-300 text-xs">·</span>
            <span className="text-gray-500 text-xs">{spotter.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{formatFull(totalRaised)}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Raised</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={A.accent}>{uniqueCount}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Pledges</div>
          </div>
          <button
            onClick={() => setShowReconcile(true)}
            style={{ ...A.bg, ...A.border }}
            className="px-3 py-1.5 text-white text-sm font-semibold rounded border transition-colors hover:brightness-110"
          >Reconcile</button>
          <button
            onClick={handleLeave}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              confirmLeave
                ? 'bg-orange-100 border-orange-300 text-orange-700'
                : 'border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
            }`}
          >{confirmLeave ? 'Tap again to leave' : 'Leave'}</button>
        </div>
      </header>

      {loading && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-center text-gray-400 text-sm">Loading event data…</div>
      )}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-red-600 text-sm">{error}</div>
      )}

      {/* ── Level carousel ── */}
      <div className="bg-white border-b border-gray-200 shrink-0 flex items-stretch shadow-sm">
        <div
          ref={carouselRef}
          className="flex gap-2 px-4 py-2 overflow-x-auto flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {levels.map(level => {
            const uniquePaddles = new Set(pledges.filter(p => p.level_amount === level).map(p => p.paddle))
            const isActive = activeLevel === level
            return (
              <button
                key={level}
                ref={isActive ? activeLvlRef : null}
                onClick={() => { setActiveLevel(level); setPaddleInput('') }}
                style={isActive ? { ...A.bg, ...A.ring } : {}}
                className={`shrink-0 px-4 py-2 rounded-lg font-bold transition-all active:scale-95 text-center min-w-16 ${
                  isActive ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="text-base leading-tight">{formatDollars(level)}</div>
                <div
                  className="text-xs font-normal leading-tight"
                  style={
                    uniquePaddles.size > 0
                      ? isActive ? { color: 'var(--on-accent, white)', opacity: 0.85 } : { color: '#6b7280' }
                      : { opacity: 0 }
                  }
                >
                  {uniquePaddles.size || '·'}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center px-2 py-2 border-l border-gray-200 bg-white shrink-0">
          {addingLevel ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text" inputMode="numeric" placeholder="e.g. 750"
                value={newLevelInput}
                onChange={e => setNewLevelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLevel(); if (e.key === 'Escape') setAddingLevel(false) }}
                className="w-24 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400"
                autoFocus
              />
              <button onClick={handleAddLevel} style={A.bg} className="text-white text-xs px-3 py-2 rounded font-semibold hover:brightness-110 shrink-0">Add</button>
              <button onClick={() => setAddingLevel(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-3 py-2 rounded shrink-0">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingLevel(true)}
              className="bg-white hover:bg-gray-100 border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
            >+ Level</button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Center: Keypad ── */}
        <main className="flex-1 flex flex-col items-center justify-start p-4 gap-3 overflow-y-auto">
          {activeLevel === null ? (
            <div className="flex-1 flex items-center justify-center">
              {session.logoUrl ? (
                <div className="text-center">
                  <img src={session.logoUrl} alt="Event logo" className="h-24 w-auto max-w-48 object-contain mx-auto mb-6 opacity-30" />
                  <div className="text-xl font-semibold text-gray-400">Select a donation level</div>
                  <div className="text-sm mt-2 text-gray-300">Tap a level above to start recording pledges</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-5xl mb-3">↑</div>
                  <div className="text-xl font-semibold text-gray-400">Select a donation level</div>
                  <div className="text-sm mt-2 text-gray-400">Tap a level above to start recording pledges</div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Paddle display */}
              <div className={`w-full max-w-xs rounded-2xl border-2 transition-colors duration-100 ${
                flash?.type === 'success'   ? 'border-green-400 bg-green-50'   :
                flash?.type === 'duplicate' ? 'border-red-400 bg-red-50'       :
                flash?.type === 'error'     ? 'border-orange-400 bg-orange-50' :
                'border-gray-200 bg-white'
              } shadow-sm`}>
                <div className="px-6 pt-4 pb-3 text-center">
                  <div className="text-gray-400 text-xs uppercase tracking-wide mb-1 font-semibold">
                    {formatFull(activeLevel)} · Paddle #
                  </div>
                  <div className={`text-6xl font-mono font-bold tracking-widest ${
                    flash?.type === 'success'   ? 'text-green-500'  :
                    flash?.type === 'duplicate' ? 'text-red-500'    :
                    flash?.type === 'error'     ? 'text-orange-500' :
                    paddleInput.length > 0      ? 'text-gray-900'   : 'text-gray-200'
                  }`}>
                    {paddleDisplay}
                  </div>
                  <div className="h-5 mt-1 flex items-center justify-center">
                    <span className={`text-sm font-semibold transition-opacity duration-150 ${flashTextColor} ${flash ? 'opacity-100' : 'opacity-0'}`}>
                      {flashText || '\u00A0'}
                    </span>
                  </div>
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
                          ? 'bg-gray-200 hover:bg-gray-300 text-gray-600 text-lg'
                          : 'bg-white hover:bg-gray-50 text-gray-900 shadow-sm border border-gray-200'
                      }`}
                    >
                      {key === 'DEL' ? '⌫' : key}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => submitPaddle()}
                  disabled={paddleInput.length === 0}
                  className="w-full mt-2 h-16 bg-green-500 hover:bg-green-600 disabled:bg-gray-100 disabled:text-gray-300 text-white font-bold text-xl rounded-xl transition-all active:scale-95 shadow-sm"
                >
                  RECORD PLEDGE
                </button>
              </div>

              {/* Pledges at this level */}
              {activeLevelPledges.length > 0 && (
                <div className="w-full max-w-xs space-y-3 pb-4">
                  {myActivePledges.length > 0 && (
                    <div>
                      <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold mb-2">Your entries</div>
                      <div className="flex flex-wrap gap-2">
                        {myActivePledges.map(p => (
                          <span key={p.id} className={`inline-flex items-center border rounded-lg px-3 py-1.5 font-mono font-bold text-sm gap-1.5 transition-colors ${
                            confirmRemove === p.id ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-gray-200 text-gray-900'
                          }`}>
                            {p.paddle}
                            <button onClick={() => handleRemovePledge(p.id)} className={`leading-none text-base transition-colors ${confirmRemove === p.id ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {othersActivePledges.length > 0 && (
                    <div>
                      <div className="text-gray-300 text-xs uppercase tracking-wide font-semibold mb-2">Other spotters</div>
                      <div className="flex flex-wrap gap-2">
                        {othersActivePledges.map(p => (
                          <span key={p.id} className="inline-flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-gray-500 text-sm gap-1.5" title={`Recorded by ${p.spotter_name}`}>
                            {p.paddle}
                            <span className="text-gray-400 text-xs">{p.spotter_name}</span>
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

        {/* ── Right: Pledge log (desktop only) ── */}
        <aside className="hidden lg:flex w-64 xl:w-72 bg-white border-l border-gray-200 flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold">
              All Pledges ({pledges.length})
            </div>
            {pledges.length > 0 && (
              <button onClick={() => handleRemovePledge(pledges[0]?.id)} className={`text-xs transition-colors ${confirmRemove === pledges[0]?.id ? 'text-red-500' : 'text-gray-400 hover:text-yellow-500'}`}>
                {confirmRemove === pledges[0]?.id ? 'Tap again to remove' : 'Undo last'}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {pledges.length === 0 ? (
              <div className="text-gray-300 text-sm text-center mt-8">No pledges yet</div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {displayPledges.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm group border border-gray-100">
                      <span className="font-mono font-bold text-gray-900 w-10 shrink-0">{p.paddle}</span>
                      <span className="font-semibold w-14 shrink-0" style={A.accent}>{formatDollars(p.level_amount)}</span>
                      <span className="text-gray-400 text-xs truncate flex-1">{p.spotter_name}</span>
                      <button onClick={() => handleRemovePledge(p.id)} className={`transition-colors text-base leading-none shrink-0 ${confirmRemove === p.id ? 'text-red-400 opacity-100' : 'text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100'}`}>×</button>
                    </div>
                  ))}
                </div>
                {pledges.length > 20 && !showAll && (
                  <button onClick={() => setShowAll(true)} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-2">
                    Show all {pledges.length} pledges
                  </button>
                )}
              </>
            )}
          </div>
          {pledges.length > 0 && (
            <div className="border-t border-gray-200 p-3 space-y-1">
              <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold mb-2">Breakdown</div>
              {levels.map(level => {
                const unique = new Set(pledges.filter(p => p.level_amount === level).map(p => p.paddle))
                if (unique.size === 0) return null
                return (
                  <div key={level} className="flex justify-between text-xs text-gray-500">
                    <span>{formatDollars(level)} × {unique.size}</span>
                    <span className="text-green-600 font-semibold">{formatFull(level * unique.size)}</span>
                  </div>
                )
              })}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200 mt-2">
                <span className="text-gray-600">Total</span>
                <span className="text-green-600">{formatFull(totalRaised)}</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
