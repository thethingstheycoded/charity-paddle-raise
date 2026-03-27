import { useState, useEffect } from 'react'
import LandingScreen from './screens/LandingScreen.jsx'
import EventScreen from './screens/EventScreen.jsx'

const SESSION_KEY = 'paddle-raise-session'
const SPOTTER_KEY  = 'paddle-raise-spotter'

export default function App() {
  const [session, setSession]   = useState(null) // { eventId, name, code, eventDate }
  const [spotter, setSpotter]   = useState(null) // { id, name }
  const [loaded, setLoaded]     = useState(false)

  useEffect(() => {
    try {
      const s  = localStorage.getItem(SESSION_KEY)
      const sp = localStorage.getItem(SPOTTER_KEY)
      if (s)  setSession(JSON.parse(s))
      if (sp) setSpotter(JSON.parse(sp))
    } catch {}
    setLoaded(true)
  }, [])

  if (!loaded) return null

  if (!session || !spotter) {
    return (
      <LandingScreen
        onJoined={(newSession, newSpotter) => {
          setSession(newSession)
          setSpotter(newSpotter)
          localStorage.setItem(SESSION_KEY, JSON.stringify(newSession))
          localStorage.setItem(SPOTTER_KEY, JSON.stringify(newSpotter))
        }}
      />
    )
  }

  return (
    <EventScreen
      session={session}
      spotter={spotter}
      onLeave={() => {
        setSession(null)
        setSpotter(null)
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SPOTTER_KEY)
      }}
    />
  )
}
