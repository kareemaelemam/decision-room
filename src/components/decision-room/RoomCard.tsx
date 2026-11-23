import { ArrowUpRight, Layers3, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DecisionRoom, RoomStatus } from '../../rooms/types'

export function StatusBadge({ status }: { status: RoomStatus }) {
  return <span className={`dr-status dr-status-${status === 'Open' ? 'discussing' : 'draft'}`}><span />{status}</span>
}

export function RoomCard({ room, userId }: { room: DecisionRoom; userId: string | null }) {
  return <Link className="dr-room-card" to={`/rooms/${room.roomId}`}>
    <div className="dr-card-top">
      <span className="dr-room-icon violet"><Layers3 size={21} /></span>
      <StatusBadge status={room.status} />
    </div>
    <span className="dr-category">{room.category}</span>
    <h3>{room.title}<ArrowUpRight size={17} /></h3>
    <p>{room.description || 'No context added yet.'}</p>
    <div className="dr-room-counts"><span><LockKeyhole size={14} />Members only</span></div>
    <div className="dr-card-footer">
      <span>{room.creatorId === userId ? 'Created by you' : 'Joined room'}</span>
      <time dateTime={room.createdAt}>{new Date(room.createdAt).toLocaleDateString()}</time>
    </div>
  </Link>
}
