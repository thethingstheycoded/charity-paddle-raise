import { useState, useEffect, useRef } from 'react'
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
  const originalLevels = useRef([])

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

      const initialAmounts = levelsRes.data.map(l => l.amount)
      originalLevels.current = initialAmounts
      setLevels(initialAmounts)
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
    addPledge: async ({ paddle, levelAmount, spotterId, spotterName }) => {
      const { data, error } = await supabase.from('pledges').insert({
        event_id:     eventId,
        paddle,
        level_amount: levelAmount,
        spotter_id:   spotterId,
        spotter_name: spotterName,
      }).select().single()
      if (!error && data) {
        // Optimistic update: add to local state immediately; real-time will deduplicate
        setPledges(prev => prev.some(p => p.id === data.id) ? prev : [data, ...prev])
      }
      return { error }
    },

    removePledge: async (id) => {
      setPledges(prev => prev.filter(p => p.id !== id))
      const { error } = await supabase.from('pledges').delete().eq('id', id)
      if (error) {
        console.error('removePledge failed:', error)
        // Re-fetch to restore the pledge if delete failed
        const { data } = await supabase.from('pledges').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
        if (data) setPledges(data)
      }
    },

    addLevel: (amount) => {
      setLevels(prev => prev.includes(amount) ? prev : [...prev, amount].sort((a, b) => b - a))
      supabase.from('levels').insert({ event_id: eventId, amount })  // real-time will deduplicate
    },

    clearPledges: async () => {
      // Delete all pledges
      await supabase.from('pledges').delete().eq('event_id', eventId)
      setPledges([])
      // Remove any levels that were added after the event started
      const added = levels.filter(l => !originalLevels.current.includes(l))
      if (added.length > 0) {
        await supabase.from('levels').delete().eq('event_id', eventId).in('amount', added)
      }
      setLevels([...originalLevels.current])
    },
  }

  return { levels, pledges, loading, error, actions }
}
