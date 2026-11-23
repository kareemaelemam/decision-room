import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ArrowLeft, Copy, LockKeyhole, Users } from 'lucide-react'
import { StatusBadge } from './RoomCard'
import { ConnectionNotice } from './ConnectionNotice'
import { RoomCollaboration } from './RoomCollaboration'
import { roomAction } from '../../rooms/client'
import { roomCategories, type DecisionRoom } from '../../rooms/types'

type Member = { userId: string; joinedAt: string }

export function RoomDetail({ roomId }: { roomId: string }) {
  const { userId } = useAuth()
  const { records, status, error } = useQuery<DecisionRoom>('decision_rooms', { where: { roomId } })
  const room = records[0]?.data
  const hasRoom = !!room
  const [members, setMembers] = useState<Member[] | null>(null)
  const [memberError, setMemberError] = useState('')
  const [retryMembers, setRetryMembers] = useState(0)
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!hasRoom) return
    let current = true
    setMemberError('')
    roomAction<{ members: Member[] }>('getRoomMembers', { roomId }).then(result => {
      if (current) setMembers(result.members)
    }).catch(cause => {
      if (current) setMemberError(cause instanceof Error ? cause.message : 'Could not load members.')
    })
    return () => { current = false }
  }, [roomId, hasRoom, retryMembers])

  async function invitePeople() {
    setInviting(true); setInviteError(''); setCopied(false)
    try {
      const result = await roomAction<{ token: string; expiresAt: string }>('createRoomInvite', { roomId })
      // Fragment keeps the capability out of HTTP request URLs and referrers.
      setInvite({ url: `${window.location.origin}/join#${result.token}`, expiresAt: result.expiresAt })
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : 'Could not create invite.')
    } finally {
      setInviting(false)
    }
  }

  if (status === 'loading') return <div className="dr-loading" role="status"><span />Loading your room…</div>
  if (status === 'error') return <div className="dr-empty" role="alert"><h1>Could not load this room</h1><p>{error || 'Please check your connection.'}</p><button className="dr-button" onClick={() => window.location.reload()}>Reconnect</button></div>
  if (!room) return <div className="dr-empty"><LockKeyhole size={30} /><h1>Room unavailable</h1><p>This room does not exist, or you haven’t joined it. Ask its creator for an invitation.</p><Link className="dr-button" to="/home">Back to your rooms</Link></div>

  const owner = room.creatorId === userId
  return <div className="dr-detail dr-content" data-testid="room-detail">
    <ConnectionNotice />
    <Link to="/home" className="dr-back"><ArrowLeft size={16} />Your rooms</Link>
    <header className="dr-page-heading">
      <div><span className="dr-eyebrow">{room.category.toUpperCase()} · PRIVATE ROOM</span><h1>{room.title}</h1><p>Created {new Date(room.createdAt).toLocaleString()}</p></div>
      <StatusBadge status={room.status} />
    </header>
    <section className="dr-detail-panel">
      <div className="dr-section-heading"><h2>The question and context</h2>{owner && <button className="dr-button-secondary" onClick={() => setEditing(!editing)}>{editing ? 'Cancel editing' : 'Edit room'}</button>}</div>
      {editing ? <EditRoom key={roomId} room={room} onSaved={() => setEditing(false)} /> : <p className="dr-context">{room.description || 'No context added yet.'}</p>}
      <dl className="dr-room-meta"><dt>Creator</dt><dd>{owner ? 'You' : room.creatorId}</dd><dt>Room ID</dt><dd>{room.roomId}</dd><dt>Your access</dt><dd>{owner ? 'Creator — can edit, invite, and contribute' : 'Member — can propose, discuss, and vote'}</dd></dl>
    </section>
    <RoomCollaboration key={roomId} roomId={roomId} open={room.status === 'Open'} />
    <section className="dr-detail-panel" aria-label="Room membership">
      <div className="dr-section-heading"><h2><Users size={18} />People in this room</h2><button className="dr-button-secondary" onClick={() => setRetryMembers(value => value + 1)}>Refresh members</button></div>
      {memberError ? <p role="alert" className="dr-form-note">{memberError}</p> : !members ? <p role="status">Loading members…</p> : <ul className="dr-member-list">{members.map(member => <li key={member.userId}><span>{member.userId === userId ? 'You' : member.userId}<small>{member.userId === room.creatorId ? 'Creator' : 'Member'}</small></span><time dateTime={member.joinedAt}>Joined {new Date(member.joinedAt).toLocaleDateString()}</time></li>)}</ul>}
      <p className="dr-muted">Member IDs identify real accounts. Personal email addresses are not shared.</p>
    </section>
    {owner && <section className="dr-detail-panel">
      <h2>Bring the right people in.</h2>
      <p className="dr-muted">Create a reusable invite link valid for 7 days. Anyone with it can sign in and join. Share it only with people you trust.</p>
      <button className="dr-button" disabled={inviting} onClick={() => void invitePeople()}>{inviting ? 'Creating invitation…' : 'Create invite link'}</button>
      {inviteError && <p role="alert" className="dr-form-note">{inviteError}</p>}
      {invite && <div className="dr-form dr-invite-result">
        <label htmlFor="invite-url">Invitation link</label><input id="invite-url" readOnly value={invite.url} onFocus={e => e.target.select()} />
        <p className="dr-muted">Expires {new Date(invite.expiresAt).toLocaleString()}. Existing links remain valid until their expiry.</p>
        <button className="dr-button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(invite.url); setCopied(true) } catch { setInviteError('Clipboard unavailable. Select the invitation link and copy it manually.') } }}><Copy size={15} />{copied ? 'Copied' : 'Copy invitation'}</button>
      </div>}
    </section>}
    <p className="dr-form-note">Votes and discussion are shared with room members. AI summaries are not enabled.</p>
  </div>
}

function EditRoom({ room, onSaved }: { room: DecisionRoom; onSaved: () => void }) {
  const [title, setTitle] = useState(room.title)
  const [description, setDescription] = useState(room.description)
  const [category, setCategory] = useState(room.category)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || !title.trim()) return
    setSaving(true); setError('')
    try {
      await roomAction('updateRoom', { roomId: room.roomId, title, description, category })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save changes.')
    } finally { setSaving(false) }
  }
  return <form className="dr-form" onSubmit={submit} aria-busy={saving}>
    <label htmlFor="edit-title">Room title</label><input id="edit-title" required disabled={saving} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} />
    <label htmlFor="edit-description">Context</label><textarea id="edit-description" disabled={saving} rows={4} maxLength={600} value={description} onChange={e => setDescription(e.target.value)} />
    <label htmlFor="edit-category">Category</label><select id="edit-category" disabled={saving} value={category} onChange={e => setCategory(e.target.value as DecisionRoom['category'])}>{roomCategories.map(value => <option key={value}>{value}</option>)}</select>
    {error && <p role="alert" className="dr-form-note">{error}</p>}
    <button className="dr-button" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>
  </form>
}
