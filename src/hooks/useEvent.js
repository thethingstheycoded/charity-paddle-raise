import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Loads event data and subscribes to real-time changes for levels + pledges.
 * All state mutations flow through the real-time channel so every spotter
 * sees the same view without any optimistic-update complexity.
 */
export function useEvent(eventId) {
  const [levels, setLevels] = useState([])
  const [pledges, setPledges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return

    async function load() {
      setLoading(true)
      setError(null)

      const [levelsRes, pledgesRes] = await Promise.all([
        supabase
          .from('levels')
          .select('amount')
          .eq('event_id', eventId)
          .order('amount', { ascending: false }),
        supabase
          .from('pledges')
          .select('*')
          .eq('event_id', eventId)
          .order('created_at', { ascending: false }),
      ])

      if (levelsRes.error) { setError(levelsRes.error.message); return }
      if (pledgesRes.error) { setError(pledgesRes.error.message); return }

      setLevels(levelsRes.data.map(l => l.amount))
      setPledges(pledgesRes.data)
      setLoading(false)
    }

    load()
  }, [eventId])

  // ── Real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return

    const channel = supabase
      .channel(`event-${eventId}`)
      // Pledge: INSERT
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pledges', filter: `event_id=eq.${eventId}` },
        ({ new: row }) => {
          setPledges(prev =>
            prev.some(p => p.id === row.id) ? prev : [row, ...prev]
          )
        }
      )
      // Pledge: DELETE  (payload.old only contains PK with default replica identity)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pledges', filter: `event_id=eq.${eventId}` },
        ({ old }) => {
          setPledges(prev => prev.filter(p => p.id !== old.id))
        }
      )
      // Level: INSERT
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'levels', filter: `event_id=eq.${eventId}` },
        ({ new: row }) => {
          setLevels(prev =>
            prev.includes(row.amount) ? prev : [...prev, row.amount].sort((a, b) => b - a)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  // ── Actions ───────────────────────────────────────────────────────────────────
  const actions = {
    addPledge: ({ paddle, levelAmount, spotterId, spotterName }) =>
      supabase.from('pledges').insert({
        event_id:     eventId,
        paddle,
        level_amount: levelAmount,
        spotter_id:   spotterId,
        spotter_name: spotterName,
      }),

    removePledge: (id) =>
      supabase.from('pledges').delete().eq('id', id),

    addLevel: (amount) =>
      supabase.from('levels').insert({ event_id: eventId, amount })
        .then(() => {}),   // ignore unique-constraint errors silently

    clearPledges: () =>
      supabase.from('pledges').delete().eq('event_id', eventId)
        .then(() => setPledges([])),
  }

  return { levels, pledges, loading, error, actions }
}
