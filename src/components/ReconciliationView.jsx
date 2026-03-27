import { useMemo, useState } from 'react'

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

/**
 * Groups raw pledges into deduplicated entries keyed by (paddle, level_amount).
 * Each group lists the distinct spotters who recorded that pledge.
 */
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

function buildSummaryText(groups) {
  const confirmed = groups.filter(g => g.entries.length > 1)
  const solo      = groups.filter(g => g.entries.length === 1)
  const total     = groups.reduce((s, g) => s + g.level, 0)

  const lines = [
    'PADDLE RAISE RECONCILIATION',
    '===========================',
    '',
    `Total Raised:                  ${formatFull(total)}`,
    `Total Pledges (deduplicated):  ${groups.length}`,
    `Confirmed by 2+ spotters:      ${confirmed.length}`,
    `Single-spotter (review):       ${solo.length}`,
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

  return lines.join('\n')
}

export default function ReconciliationView({ pledges, onClose }) {
  const [tab, setTab]       = useState('all')
  const [copied, setCopied] = useState(false)

  const groups    = useMemo(() => reconcile(pledges), [pledges])
  const confirmed = groups.filter(g => g.entries.length > 1)
  const solo      = groups.filter(g => g.entries.length === 1)
  const total     = groups.reduce((s, g) => s + g.level, 0)
  const displayed = tab === 'confirmed' ? confirmed : tab === 'solo' ? solo : groups

  const allSpotters = [...new Map(pledges.map(p => [p.spotter_id, p.spotter_name])).entries()]
    .map(([id, name]) => ({ id, name }))

  function copyToClipboard() {
    navigator.clipboard.writeText(buildSummaryText(groups)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">

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
            <div className="text-gray-400 text-xs uppercase tracking-wide">Deduped Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{groups.length}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">Unique Pledges</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{solo.length}</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">For Review</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded border border-gray-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Summary'}
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
          { key: 'all',       label: `All (${groups.length})`,        color: '' },
          { key: 'confirmed', label: `Confirmed (${confirmed.length})`, color: 'text-green-400' },
          { key: 'solo',      label: `Review (${solo.length})`,        color: 'text-yellow-400' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? `border-blue-500 ${t.color || 'text-white'}`
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-4 py-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
          Confirmed by 2+ spotters — counts once toward total
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
          Single spotter — verify before finalizing
        </span>
      </div>

      {/* Pledge list */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayed.length === 0 ? (
          <div className="text-center text-gray-600 mt-16 text-sm">No pledges in this category</div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-2">
            {displayed.map(group => {
              const isConfirmed = group.entries.length > 1
              return (
                <div
                  key={`${group.paddle}:${group.level}`}
                  className={`flex items-center gap-4 rounded-xl px-4 py-3 border ${
                    isConfirmed
                      ? 'bg-green-900/20 border-green-800/50'
                      : 'bg-yellow-900/20 border-yellow-800/50'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full shrink-0 ${isConfirmed ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="font-mono font-bold text-white text-xl w-16 shrink-0">{group.paddle}</span>
                  <span className="font-semibold text-green-400 text-lg w-24 shrink-0">{formatDollars(group.level)}</span>
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
                  <span className={`text-xs shrink-0 font-semibold ${isConfirmed ? 'text-green-500' : 'text-yellow-500'}`}>
                    {isConfirmed ? `✓ ${group.entries.length} spotters` : '1 spotter'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer total */}
      <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="text-gray-400 text-sm">
          {groups.length} unique pledge{groups.length !== 1 ? 's' : ''} across {allSpotters.length} spotter{allSpotters.length !== 1 ? 's' : ''}
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
