import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/Dialog'
import { invitationToken } from '../../rooms/invitation-input'

export function JoinRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const token = invitationToken(input)
    if (!token) {
      setError('Paste the complete invitation URL ending in /join#… or the 64-character invitation token. A room ID alone cannot grant access.')
      return
    }
    onOpenChange(false)
    setInput(''); setError('')
    // The existing authenticated acceptance page owns the only join action.
    navigate(`/join#${token}`)
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="dr-dialog">
    <span className="dr-room-icon violet"><DoorOpen size={23} /></span>
    <DialogTitle>Join a decision room</DialogTitle>
    <DialogDescription>Paste an invitation from the room creator. You’ll review and accept it on the next screen.</DialogDescription>
    <form className="dr-form" onSubmit={submit}>
      <label htmlFor="join-invitation">Invitation URL or token</label>
      <textarea id="join-invitation" autoFocus rows={3} maxLength={2048} spellCheck={false} autoCapitalize="none" autoComplete="off" value={input} onChange={event => { setInput(event.target.value); setError('') }} aria-invalid={!!error} aria-describedby={error ? 'join-error' : 'join-help'} placeholder="https://decision-room.app.space/join#…" />
      <p id="join-help" className="dr-muted">Only an unexpired invitation can grant membership. Your account must be signed in.</p>
      {error && <p id="join-error" role="alert" className="dr-form-note">{error}</p>}
      <div className="dr-form-actions"><button type="button" className="dr-button-secondary" onClick={() => onOpenChange(false)}>Cancel</button><button className="dr-button" disabled={!input.trim()}>Continue to invitation</button></div>
    </form>
  </DialogContent></Dialog>
}
