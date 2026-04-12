import { useMemo, useState, useRef } from 'react'

function formatFull(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(amount)
}

function formatDollars(amount) {
  if (amount >= 1000) {
    const k = amount / 1000
    return `$${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return `$${amount}`
}

function reconcile(pledges) {
  const groups = {}
  for (const p of pledges) {
    const key = `${p.paddle}:${p.level_amount}`
    if (!groups[key]) groups[key] = { paddle: p.paddle, level: p.level_amount, entries: [] }
    if (!groups[key].entries.some(e => e.spotter_id === p.spotter_id)) {
      groups[key].entries.push(p)
    }
  }
  return Object.values(groups).sort((a, b) => b.level - a.level || a.paddle.localeCompare(b.paddle))
}

function buildSummaryText(groups, statuses) {
  const rejected  = groups.filter(g => statuses[`${g.paddle}:${g.level}`] === 'rejected')
  const active    = groups.filter(g => statuses[`${g.paddle}:${g.level}`] !== 'rejected')
  const confirmed = active.filter(g => g.entries.length > 1 || statuses[`${g.paddle}:${g.level}`] === 'confirmed')
  const solo      = active.filter(g => g.entries.length === 1 && statuses[`${g.paddle}:${g.level}`] !== 'confirmed')
  const total     = active.reduce((s, g) => s + g.level, 0)

  const lines = [
    'PADDLE RAISE RECONCILIATION',
    '===========================',
    '',
    `Total Raised:                  ${formatFull(total)}`,
    `Total Pledges (deduplicated):  ${active.length}`,
    `Confirmed:                     ${confirmed.length}`,
    `Single-spotter (review):       ${solo.length}`,
    `Rejected:                      ${rejected.length}`,
    '',
  ]

  if (confirmed.length) {
    lines.push('CONFIRMED PLEDGES', '-----------------')
    for (const g of confirmed) {
      lines.push(`  ${g.paddle}  ${formatFull(g.level).padEnd(12)}  [${g.entries.map(e => e.spotter_name).join(', ')}]`)
    }
    lines.push('')
  }

  if (solo.length) {
    lines.push('REVIEW NEEDED (single spotter)', '------------------------------')
    for (const g of solo) {
      lines.push(`  ${g.paddle}  ${formatFull(g.level).padEnd(12)}  [${g.entries[0].spotter_name}]`)
    }
    lines.push('')
  }

  if (rejected.length) {
    lines.push('REJECTED', '--------')
    for (const g of rejected) {
      lines.push(`  ${g.paddle}  ${formatFull(g.level).padEnd(12)}  [${g.entries.map(e => e.spotter_name).join(', ')}]`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ── Swipeable row ─────────────────────────────────────────────────────────────

const THRESHOLD = 72

function SwipeableRow({ onSwipeLeft, onSwipeRight, children }) {
  const [dx, setDx]       = useState(0)
  const [swiping, setSwiping] = useState(false)
  const start     = useRef({ x: 0, y: 0 })
  const direction = useRef(null) // 'h' | 'v' | null

  function onTouchStart(e) {
    start.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    direction.current = null
    setSwiping(true)
  }

  function onTouchMove(e) {
    const deltaX = e.touches[0].clientX - start.current.x
    const deltaY = e.touches[0].clientY - start.current.y
    if (!direction.current) {
      if (Math.abs(deltaX) > Math.abs(deltaY) + 4) direction.current = 'h'
      else if (Math.abs(deltaY) > Math.abs(deltaX) + 4) direction.current = 'v'
      else return
    }
    if (direction.current === 'h') {
      e.preventDefault()
      setDx(deltaX)
    }
  }

  function onTouchEnd() {
    setSwiping(false)
    if (dx < -THRESHOLD) onSwipeLeft?.()
    else if (dx > THRESHOLD) onSwipeRight?.()
    setDx(0)
  }

  const progress    = Math.min(Math.abs(dx) / THRESHOLD, 1)
  const showConfirm = dx < -8
  const showReject  = dx > 8

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Confirm bg — revealed on swipe left */}
      <div
        className="absolute inset-0 flex items-center px-5"
        style={{ backgroundColor: `rgba(22,163,74,${showConfirm ? progress : 0})`, opacity: showConfirm ? 1 : 0 }}
      >
        <span className="text-white font-bold text-sm select-none">✓ Confirm</span>
      </div>

      {/* Reject bg — revealed on swipe right */}
      <div
        className="absolute inset-0 flex items-center justify-end px-5"
        style={{ backgroundColor: `rgba(220,38,38,${showReject ? progress : 0})`, opacity: showReject ? 1 : 0 }}
      >
        <span className="text-white font-bold text-sm select-none">✕ Reject</span>
      </div>

      {/* Row content */}
      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReconciliationView({ pledges, cssVars = {}, onClose, onClearPledges }) {
  const [tab, setTab]           = useState('all')
  const [copied, setCopied]     = useState(false)
  const [statuses, setStatuses] = useState({}) // { 'paddle:level': 'confirmed' | 'rejected' }
  const [showClear, setShowClear]     = useState(false)
  const [clearPassword, setClearPassword] = useState('')
  const [clearError, setClearError]   = useState('')
  const [clearing, setClearing]       = useState(false)

  const groups = useMemo(() => reconcile(pledges), [pledges])

  function setStatus(key, status) {
    setStatuses(prev => ({ ...prev, [key]: prev[key] === status ? null : status }))
  }

  const activeGroups   = groups.filter(g => statuses[`${g.paddle}:${g.level}`] !== 'rejected')
  const rejectedGroups = groups.filter(g => statuses[`${g.paddle}:${g.level}`] === 'rejected')
  const confirmedGroups = activeGroups.filter(g =>
    g.entries.length > 1 || statuses[`${g.paddle}:${g.level}`] === 'confirmed'
  )
  const soloGroups = activeGroups.filter(g =>
    g.entries.length === 1 && statuses[`${g.paddle}:${g.level}`] !== 'confirmed'
  )
  const total = activeGroups.reduce((s, g) => s + g.level, 0)

  const allSpotters = [...new Map(pledges.map(p => [p.spotter_id, p.spotter_name])).entries()]
    .map(([id, name]) => ({ id, name }))

  const displayed =
    tab === 'confirmed' ? confirmedGroups :
    tab === 'solo'      ? soloGroups      :
    tab === 'rejected'  ? rejectedGroups  :
    groups // 'all' shows everything including rejected

  async function handleClear() {
    if (!clearPassword) { setClearError('Enter the event password'); return }
    setClearing(true)
    setClearError('')
    const result = await onClearPledges(clearPassword)
    setClearing(false)
    if (result?.error) {
      setClearError(result.error)
    } else {
      setShowClear(false)
      setClearPassword('')
      onClose()
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(buildSummaryText(groups, statuses)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col relative" style={cssVars}>

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Reconciliation</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            {allSpotters.length} spotter{allSpotters.length !== 1 ? 's' : ''}:&nbsp;
            {allSpotters.map(s => s.name).join(', ')}
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{formatFull(total)}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Total (excl. rejected)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{activeGroups.length}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Active Pledges</div>
          </div>
          {rejectedGroups.length > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{rejectedGroups.length}</div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Rejected</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded border border-gray-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
          <button
            onClick={() => { setShowClear(true); setClearPassword(''); setClearError('') }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-red-900/60 text-red-400 hover:text-red-300 text-xs rounded border border-red-900/50 hover:border-red-700 transition-colors"
          >
            Clear pledges
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-600 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-700 flex">
        {[
          { key: 'all',       label: `All (${groups.length})`,                color: '' },
          { key: 'confirmed', label: `Confirmed (${confirmedGroups.length})`, color: 'text-green-400' },
          { key: 'solo',      label: `Review (${soloGroups.length})`,         color: 'text-yellow-400' },
          { key: 'rejected',  label: `Rejected (${rejectedGroups.length})`,   color: 'text-red-400' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? `${t.color || 'text-white'}`
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
            style={tab === t.key ? { borderBottomColor: 'var(--accent, #3b82f6)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-4 py-2 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          2+ spotters — confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
          1 spotter — verify
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          Swipe left to confirm · Swipe right to reject
        </span>
      </div>

      {/* Pledge list */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayed.length === 0 ? (
          <div className="text-center text-gray-600 mt-16 text-sm">No pledges in this category</div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-2">
            {displayed.map(group => {
              const key        = `${group.paddle}:${group.level}`
              const status     = statuses[key]
              const isRejected = status === 'rejected'
              const isManualConfirmed = status === 'confirmed'
              const isAutoConfirmed   = group.entries.length > 1
              const isConfirmed = isAutoConfirmed || isManualConfirmed

              return (
                <SwipeableRow
                  key={key}
                  onSwipeLeft={() => setStatus(key, 'confirmed')}
                  onSwipeRight={() => setStatus(key, 'rejected')}
                >
                  <div className={`flex items-center gap-4 px-4 py-3 border ${
                    isRejected
                      ? 'bg-red-950/40 border-red-800/50 opacity-60'
                      : isConfirmed
                        ? 'bg-green-900/20 border-green-800/50'
                        : 'bg-yellow-900/20 border-yellow-800/50'
                  }`}>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${
                      isRejected ? 'bg-red-500' : isConfirmed ? 'bg-green-500' : 'bg-yellow-500'
                    }`} />
                    <span className={`font-mono font-bold text-xl w-16 shrink-0 ${isRejected ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {group.paddle}
                    </span>
                    <span className={`font-semibold text-lg w-24 shrink-0 ${isRejected ? 'text-gray-600' : 'text-green-400'}`}>
                      {formatDollars(group.level)}
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {group.entries.map(e => (
                        <span
                          key={e.spotter_id}
                          className="bg-gray-700 border border-gray-600 rounded-full px-2.5 py-0.5 text-xs text-gray-200"
                        >
                          {e.spotter_name}
                        </span>
                      ))}
                    </div>
                    <span className={`text-xs shrink-0 font-semibold ${
                      isRejected ? 'text-red-500' : isConfirmed ? 'text-green-500' : 'text-yellow-500'
                    }`}>
                      {isRejected
                        ? '✕ rejected'
                        : isManualConfirmed && !isAutoConfirmed
                          ? '✓ confirmed'
                          : isAutoConfirmed
                            ? `✓ ${group.entries.length} spotters`
                            : '1 spotter'}
                    </span>
                  </div>
                </SwipeableRow>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Password confirmation modal ── */}
      {showClear && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-6">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">Clear all pledges?</h3>
            <p className="text-gray-400 text-sm mb-5">This cannot be undone. Enter the event password to confirm.</p>
            <input
              type="password"
              placeholder="Event password"
              value={clearPassword}
              onChange={e => { setClearPassword(e.target.value); setClearError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleClear(); if (e.key === 'Escape') setShowClear(false) }}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 mb-2"
              autoFocus
            />
            {clearError && <p className="text-red-400 text-sm mb-3">{clearError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {clearing ? 'Verifying…' : 'Clear all pledges'}
              </button>
              <button
                onClick={() => setShowClear(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="text-gray-400 text-sm">
          {activeGroups.length} active pledge{activeGroups.length !== 1 ? 's' : ''}
          {rejectedGroups.length > 0 && (
            <span className="text-red-500/70 ml-2">· {rejectedGroups.length} rejected</span>
          )}
          {pledges.length !== groups.length && (
            <span className="text-gray-500 ml-2">
              ({pledges.length - groups.length} duplicate{pledges.length - groups.length !== 1 ? 's' : ''} removed)
            </span>
          )}
        </div>
        <div className="text-green-400 font-bold text-xl">{formatFull(total)}</div>
      </div>
    </div>
  )
}
