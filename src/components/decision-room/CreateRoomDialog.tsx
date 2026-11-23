import { useState, type FormEvent } from 'react'
import { ArrowRight, Layers3 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/Dialog'
import { roomAction } from '../../rooms/client'
import { roomCategories } from '../../rooms/types'

export function CreateRoomDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (roomId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Product')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const { roomId } = await roomAction<{ roomId: string }>('createRoom', { title, description, category })
      setTitle(''); setDescription(''); setCategory('Product')
      onOpenChange(false)
      onCreated(roomId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your room.')
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
    <DialogContent className="dr-dialog" hideClose={saving}>
      <span className="dr-room-icon violet"><Layers3 size={23} /></span>
      <DialogTitle>Make room for a decision.</DialogTitle>
      <DialogDescription>Your room is private. Invite people when you’re ready.</DialogDescription>
      <form onSubmit={submit} className="dr-form" aria-busy={saving}>
        <label htmlFor="room-title">What are you deciding?</label>
        <input id="room-title" autoFocus required disabled={saving} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Which database should we use?" />
        <label htmlFor="room-description">A little context <span>(optional)</span></label>
        <textarea id="room-description" disabled={saving} maxLength={600} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="What should everyone know before weighing in?" />
        <label htmlFor="room-category">Category</label>
        <select id="room-category" disabled={saving} value={category} onChange={e => setCategory(e.target.value)}>{roomCategories.map(item => <option key={item}>{item}</option>)}</select>
        {error && <p role="alert" className="dr-form-note">{error}</p>}
        <div className="dr-form-actions">
          <button type="button" disabled={saving} className="dr-button-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="dr-button" disabled={!title.trim() || saving}>{saving ? 'Saving room…' : 'Create room'}<ArrowRight size={16} /></button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
