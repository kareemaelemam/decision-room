import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { roomAction } from '../../rooms/client'

export function JoinRoom() {
  const [token] = useState(() => window.location.hash.slice(1))
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const validFormat = /^[a-f0-9]{64}$/.test(token)

  async function join() {
    if (joining || !validFormat) return
    setJoining(true); setError('')
    try {
      const result = await roomAction<{ roomId: string }>('joinRoom', { token })
      // Fresh socket/query state after membership changes. The invite token
      // never enters a request URL, localStorage, logs, or the resulting route.
      window.location.replace(`/rooms/${result.roomId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join the room.')
      setJoining(false)
    }
  }

  return <div className="dr-empty dr-join">
    <LockKeyhole size={32} /><h1>{validFormat ? 'You’ve been invited to a decision.' : 'This invitation is incomplete'}</h1>
    <p>{validFormat ? 'Accept this invitation to become a room member. You will then be able to see its details.' : 'Open the complete invitation link from the room creator, including the part after #.'}</p>
    {error && <p role="alert" className="dr-form-note">{error}</p>}
    {validFormat && <button className="dr-button" disabled={joining} onClick={() => void join()}>{joining ? 'Joining room…' : 'Accept invitation'}</button>}
    <Link className="dr-back" to="/home">Back to your rooms</Link>
  </div>
}
