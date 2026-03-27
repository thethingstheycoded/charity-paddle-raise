import { useEffect, useRef, useState, useCallback } from 'react'

function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/**
 * Manages the WebSocket connection and shared state.
 * Returns { state, connected, actions }.
 */
export function useSync() {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 2500)
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      setState(prev => applyMessage(prev, msg))
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  function dispatch(msg) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }

  const actions = {
    addPledge: (payload) => dispatch({ type: 'add_pledge', payload }),
    removePledge: (id) => dispatch({ type: 'remove_pledge', payload: { id } }),
    addLevel: (level) => dispatch({ type: 'add_level', payload: { level } }),
    reset: () => dispatch({ type: 'reset' }),
  }

  return { state, connected, actions }
}

// ── Pure state reducer for incoming server messages ──────────────────────────

function applyMessage(prev, msg) {
  switch (msg.type) {
    case 'state':
      return msg.payload

    case 'pledge_added':
      if (!prev) return prev
      // Avoid duplicates if server echoes back to sender
      if (prev.pledges.some(p => p.id === msg.payload.id)) return prev
      return { ...prev, pledges: [msg.payload, ...prev.pledges] }

    case 'pledge_removed':
      if (!prev) return prev
      return { ...prev, pledges: prev.pledges.filter(p => p.id !== msg.payload.id) }

    case 'levels_updated':
      if (!prev) return prev
      return { ...prev, levels: msg.payload.levels }

    default:
      return prev
  }
}
