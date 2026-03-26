import { useState, useEffect, useRef } from 'react'

const DEFAULT_LEVELS = [50000, 25000, 10000, 5000, 2500, 1000, 500, 250, 100]

const STORAGE_KEY = 'paddle-raise-state'

function formatDollars(amount) {
  if (amount >= 1000) {
    const k = amount / 1000
    return `$${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return `$${amount}`
}

function formatFull(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount)
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export default function App() {
  const [levels, setLevels] = useState(DEFAULT_LEVELS)
  const [activeLevel, setActiveLevel] = useState(null)
  const [pledges, setPledges] = useState([]) // { id, level, paddle, timestamp }
  const [paddleInput, setPaddleInput] = useState('')
  const [addingLevel, setAddingLevel] = useState(false)
  const [newLevelInput, setNewLevelInput] = useState('')
  const [flash, setFlash] = useState(null) // { paddle, type: 'success'|'duplicate' }
  const [showAll, setShowAll] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const pledgeIdRef = useRef(0)
  const flashTimerRef = useRef(null)

  // Load persisted state on mount
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      setLevels(saved.levels ?? DEFAULT_LEVELS)
      setPledges(saved.pledges ?? [])
      pledgeIdRef.current = saved.pledgeIdCounter ?? 0
      if (saved.activeLevel != null) setActiveLevel(saved.activeLevel)
    }
  }, [])

  // Persist state on changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ levels, pledges, pledgeIdCounter: pledgeIdRef.current, activeLevel })
      )
    } catch {}
  }, [levels, pledges, activeLevel])

  const totalRaised = pledges.reduce((sum, p) => sum + p.level, 0)

  const activeLevelPledges = activeLevel != null
    ? pledges.filter(p => p.level === activeLevel)
    : []

  function triggerFlash(paddle, type) {
    clearTimeout(flashTimerRef.current)
    setFlash({ paddle, type })
    flashTimerRef.current = setTimeout(
      () => setFlash(null),
      type === 'success' ? 800 : 1500
    )
  }

  function submitPaddle(value) {
    const raw = value ?? paddleInput
    const num = parseInt(raw, 10)
    if (!raw || isNaN(num) || num < 1 || num > 999) {
      setPaddleInput('')
      return
    }
    const paddleStr = String(num).padStart(3, '0')
    const exists = pledges.some(p => p.level === activeLevel && p.paddle === paddleStr)
    if (exists) {
      triggerFlash(paddleStr, 'duplicate')
      setPaddleInput('')
      return
    }
    const id = ++pledgeIdRef.current
    setPledges(prev => [{ id, level: activeLevel, paddle: paddleStr, timestamp: Date.now() }, ...prev])
    triggerFlash(paddleStr, 'success')
    setPaddleInput('')
  }

  function handleKeypadPress(key) {
    if (key === 'DEL') {
      setPaddleInput(prev => prev.slice(0, -1))
    } else if (key === 'CLR') {
      setPaddleInput('')
    } else if (key === 'ENT') {
      submitPaddle()
    } else {
      if (paddleInput.length < 3) {
        const next = paddleInput + key
        setPaddleInput(next)
        if (next.length === 3) submitPaddle(next)
      }
    }
  }

  function undoLast() {
    setPledges(prev => prev.slice(1))
  }

  function removePledge(id) {
    setPledges(prev => prev.filter(p => p.id !== id))
  }

  function handleAddLevel() {
    const val = parseInt(newLevelInput.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(val) && val > 0 && !levels.includes(val)) {
      const updated = [...levels, val].sort((a, b) => b - a)
      setLevels(updated)
      setActiveLevel(val)
      setPaddleInput('')
    }
    setNewLevelInput('')
    setAddingLevel(false)
  }

  function handleClearAll() {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setPledges([])
    setLevels(DEFAULT_LEVELS)
    setActiveLevel(null)
    setPaddleInput('')
    setConfirmClear(false)
    localStorage.removeItem(STORAGE_KEY)
  }

  const displayPledges = showAll ? pledges : pledges.slice(0, 20)

  const paddleDisplay = flash?.type === 'success'
    ? flash.paddle
    : flash?.type === 'duplicate'
    ? flash.paddle
    : paddleInput.padEnd(3, '_').split('').join(' ')

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">Paddle Raise Tracker</h1>
          <p className="text-gray-400 text-sm leading-none mt-0.5">Record pledges quickly and accurately</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{formatFull(totalRaised)}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Total Raised</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{pledges.length}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Pledges</div>
          </div>
          <button
            onClick={handleClearAll}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              confirmClear
                ? 'bg-red-600 border-red-500 text-white'
                : 'border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500'
            }`}
          >
            {confirmClear ? 'Tap again to reset' : 'Reset'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: Donation Levels */}
        <aside className="w-40 sm:w-48 bg-gray-900 border-r border-gray-700 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-700">
            <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Levels</div>
          </div>
          <div className="flex flex-col gap-1.5 p-2 flex-1">
            {levels.map(level => {
              const count = pledges.filter(p => p.level === level).length
              const isActive = activeLevel === level
              return (
                <button
                  key={level}
                  onClick={() => { setActiveLevel(level); setPaddleInput('') }}
                  className={`w-full text-left px-3 py-3 rounded-lg font-bold text-base transition-all active:scale-95 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-lg">{formatDollars(level)}</div>
                  {count > 0 && (
                    <div className={`text-xs font-normal mt-0.5 ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                      {count} pledge{count !== 1 ? 's' : ''}
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
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 750"
                  value={newLevelInput}
                  onChange={e => setNewLevelInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddLevel()
                    if (e.key === 'Escape') setAddingLevel(false)
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleAddLevel}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded font-semibold"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingLevel(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs py-1.5 rounded"
                  >
                    Cancel
                  </button>
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

        {/* Center: Active level + keypad */}
        <main className="flex-1 flex flex-col items-center justify-start p-4 gap-4 overflow-y-auto">
          {activeLevel === null ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-5xl mb-3">←</div>
                <div className="text-xl font-semibold text-gray-400">Select a donation level</div>
                <div className="text-sm mt-2">Tap a level on the left to start recording pledges</div>
              </div>
            </div>
          ) : (
            <>
              {/* Active level badge */}
              <div className="w-full max-w-xs">
                <div className="bg-blue-600 rounded-2xl px-6 py-4 text-center shadow-xl">
                  <div className="text-blue-200 text-sm uppercase tracking-wide font-semibold mb-1">Active Level</div>
                  <div className="text-4xl font-bold text-white">{formatFull(activeLevel)}</div>
                  <div className="text-blue-200 text-sm mt-1">
                    {activeLevelPledges.length} pledge{activeLevelPledges.length !== 1 ? 's' : ''} recorded
                  </div>
                </div>
              </div>

              {/* Paddle display */}
              <div
                className={`w-full max-w-xs rounded-2xl border-4 transition-all duration-100 ${
                  flash?.type === 'success'
                    ? 'border-green-400 bg-green-900/30'
                    : flash?.type === 'duplicate'
                    ? 'border-red-500 bg-red-900/30'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <div className="px-6 py-5 text-center">
                  <div className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-semibold">Paddle #</div>
                  <div
                    className={`text-6xl font-mono font-bold tracking-widest ${
                      flash?.type === 'success'
                        ? 'text-green-400'
                        : flash?.type === 'duplicate'
                        ? 'text-red-400'
                        : paddleInput.length > 0
                        ? 'text-white'
                        : 'text-gray-700'
                    }`}
                  >
                    {paddleDisplay}
                  </div>
                  {flash?.type === 'duplicate' && (
                    <div className="text-red-400 text-sm mt-2 font-semibold">Already recorded at this level!</div>
                  )}
                  {flash?.type === 'success' && (
                    <div className="text-green-400 text-sm mt-2 font-semibold">Pledge recorded!</div>
                  )}
                </div>
              </div>

              {/* Keypad */}
              <div className="w-full max-w-xs">
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map(key => (
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

              {/* Paddles recorded at this level */}
              {activeLevelPledges.length > 0 && (
                <div className="w-full max-w-xs">
                  <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold mb-2">
                    Recorded at {formatFull(activeLevel)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeLevelPledges.map(p => (
                      <span
                        key={p.id}
                        className="group inline-flex items-center bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 font-mono font-bold text-white text-sm gap-1.5"
                      >
                        {p.paddle}
                        <button
                          onClick={() => removePledge(p.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors leading-none text-base"
                          title="Remove pledge"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Right sidebar: Full pledge log */}
        <aside className="hidden lg:flex w-64 xl:w-72 bg-gray-900 border-l border-gray-700 flex-col shrink-0">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <div className="text-gray-400 text-xs uppercase tracking-wide font-semibold">
              All Pledges ({pledges.length})
            </div>
            {pledges.length > 0 && (
              <button
                onClick={undoLast}
                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
              >
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
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm group"
                    >
                      <span className="font-mono font-bold text-white">{p.paddle}</span>
                      <span className="text-green-400 font-semibold">{formatDollars(p.level)}</span>
                      <button
                        onClick={() => removePledge(p.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {pledges.length > 20 && !showAll && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 py-2"
                  >
                    Show all {pledges.length} pledges
                  </button>
                )}
              </>
            )}
          </div>

          {/* Breakdown by level */}
          {pledges.length > 0 && (
            <div className="border-t border-gray-700 p-3 space-y-1">
              <div className="text-gray-500 text-xs uppercase tracking-wide font-semibold mb-2">Breakdown</div>
              {levels.map(level => {
                const count = pledges.filter(p => p.level === level).length
                if (count === 0) return null
                return (
                  <div key={level} className="flex justify-between text-xs text-gray-400">
                    <span>{formatDollars(level)} × {count}</span>
                    <span className="text-green-400 font-semibold">{formatFull(level * count)}</span>
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
