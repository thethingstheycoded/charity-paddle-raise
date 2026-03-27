import express from 'express'
import { WebSocketServer } from 'ws'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

// ── In-memory state ──────────────────────────────────────────────────────────

const DEFAULT_LEVELS = [50000, 25000, 10000, 5000, 2500, 1000, 500, 250, 100]

let state = {
  levels: [...DEFAULT_LEVELS],
  pledges: [],      // { id, paddle, level, spotterId, spotterName, timestamp }
  pledgeIdCounter: 0,
}

// ── WebSocket helpers ────────────────────────────────────────────────────────

const clients = new Set()

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(msg, exclude = null) {
  for (const ws of clients) {
    if (ws !== exclude) send(ws, msg)
  }
}

// ── Message handlers ─────────────────────────────────────────────────────────

function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'add_pledge': {
      const { paddle, level, spotterId, spotterName } = msg.payload
      const pledge = {
        id: ++state.pledgeIdCounter,
        paddle,
        level,
        spotterId,
        spotterName,
        timestamp: Date.now(),
      }
      state.pledges.unshift(pledge)
      broadcast({ type: 'pledge_added', payload: pledge })
      break
    }

    case 'remove_pledge': {
      const { id } = msg.payload
      state.pledges = state.pledges.filter(p => p.id !== id)
      broadcast({ type: 'pledge_removed', payload: { id } })
      break
    }

    case 'add_level': {
      const { level } = msg.payload
      if (!state.levels.includes(level)) {
        state.levels = [...state.levels, level].sort((a, b) => b - a)
        broadcast({ type: 'levels_updated', payload: { levels: state.levels } })
      }
      break
    }

    case 'reset': {
      state = {
        levels: [...DEFAULT_LEVELS],
        pledges: [],
        pledgeIdCounter: 0,
      }
      broadcast({ type: 'state', payload: state })
      break
    }
  }
}

// ── WebSocket connections ────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  clients.add(ws)
  send(ws, { type: 'state', payload: state })

  ws.on('message', (raw) => {
    try {
      handleMessage(ws, JSON.parse(raw))
    } catch {}
  })

  ws.on('close', () => clients.delete(ws))
})

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nPaddle Raise server running at http://localhost:${PORT}`)
  console.log(`Share your local IP so spotters can connect (e.g. http://192.168.x.x:${PORT})\n`)
})
