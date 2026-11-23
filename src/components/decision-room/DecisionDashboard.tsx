import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ArrowRight, DoorOpen, LayoutGrid, LockKeyhole, Plus, Search, Users, X } from 'lucide-react'
import { CreateRoomDialog } from './CreateRoomDialog'
import { JoinRoomDialog } from './JoinRoomDialog'
import { RoomCard } from './RoomCard'
import { ConnectionNotice } from './ConnectionNotice'
import type { DecisionRoom } from '../../rooms/types'

type View = 'All rooms' | 'Created by me' | 'Joined rooms'

export function DecisionDashboard() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  // The Durable Object applies the schema's team policy before sending rows.
  // There is no public all-rooms endpoint or client-only privacy filter.
  const { records, status, error } = useQuery<DecisionRoom>('decision_rooms', { orderBy: 'createdAt', orderDir: 'desc' })
  const [view, setView] = useState<View>('All rooms')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const rooms = records.map(record => record.data)
  const own = rooms.filter(room => room.creatorId === userId)
  const joined = rooms.filter(room => room.creatorId !== userId)
  const filtered = rooms.filter(room =>
    (view === 'All rooms' || (view === 'Created by me' ? room.creatorId === userId : room.creatorId !== userId)) &&
    `${room.title} ${room.description} ${room.category}`.toLowerCase().includes(query.toLowerCase()),
  )
  const visible = sort === 'title' ? [...filtered].sort((a, b) => a.title.localeCompare(b.title)) : filtered
  const views = [
    { name: 'All rooms', icon: LayoutGrid, count: rooms.length },
    { name: 'Created by me', icon: DoorOpen, count: own.length },
    { name: 'Joined rooms', icon: Users, count: joined.length },
  ] as const

  return <div className="dr-workspace">
    <aside className="dr-sidebar">
      <div className="dr-workspace-picker"><span className="dr-workspace-avatar">D</span><span>DecisionRoom<small>Your private workspace</small></span></div>
      <span className="dr-sidebar-label">WORKSPACE</span>
      <nav aria-label="Workspace navigation">{views.map(({ name, icon: Icon, count }) =>
        <button key={name} className={view === name ? 'active' : ''} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>
          <Icon size={17} />{name}<span>{count}</span>
        </button>,
      )}</nav>
      <div className="dr-sidebar-bottom">
        <div className="dr-sidebar-tip"><LockKeyhole size={20} /><strong>Good decisions need<br />the right people.</strong><p>Only you and the people who accept your invitation can see a room.</p><button onClick={() => setCreating(true)}>Start a decision <ArrowRight size={14} /></button></div>
        <span className="dr-powered">Built with DeepSpace</span>
      </div>
    </aside>
    <div className="dr-main">
      <header className="dr-breadcrumb"><span>Workspace <span>/</span><strong>{view}</strong></span><span className="dr-preview-dot">Members only</span></header>
      <div className="dr-content">
        <ConnectionNotice />
        <div className="dr-page-heading">
          <div><span className="dr-eyebrow">THINK TOGETHER. MOVE FORWARD.</span><h1>A little clarity goes a long way.</h1><p>Your team’s questions and next steps. All in one room.</p></div>
          <div className="dr-dashboard-actions"><button className="dr-button" onClick={() => setCreating(true)}><Plus size={17} />Create Room</button><button className="dr-button-secondary" onClick={() => setJoining(true)}><DoorOpen size={17} />Join Room</button></div>
        </div>
        <section className="dr-stats" aria-label="Your room statistics">
          {views.map(({ name, icon: Icon, count }) => <div key={name}><span className="dr-stat-icon violet"><Icon size={20} /></span><span>{name}<strong>{status === 'loading' ? '—' : count}</strong></span></div>)}
        </section>
        <section className="dr-room-section" aria-label="Decision rooms">
          <div className="dr-section-heading"><h2>{view}<span>{visible.length}</span></h2><span className="dr-sample-label">Visible only to room members</span></div>
          <div className="dr-toolbar">
            <div className="dr-tabs" aria-label="Room filters">{views.map(({ name }) => <button key={name} className={view === name ? 'active' : ''} aria-pressed={view === name} onClick={() => setView(name)}>{name === 'All rooms' ? 'All' : name === 'Created by me' ? 'Created' : 'Joined'}</button>)}</div>
            <div className="dr-search-sort">
              <label className="dr-search"><Search size={16} /><input aria-label="Search rooms" placeholder="Search rooms…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
              <select aria-label="Sort rooms" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Most recent</option><option value="title">Title A–Z</option></select>
            </div>
          </div>
          {status === 'loading' ? <div className="dr-loading" role="status"><span />Loading your rooms…</div> : status === 'error' ?
            <div className="dr-empty" role="alert"><h3>Could not load rooms</h3><p>{error || 'The connection was interrupted.'}</p><button className="dr-button" onClick={() => window.location.reload()}>Reconnect</button></div> :
            visible.length ? <div className="dr-room-grid">{visible.map(room => <RoomCard key={room.roomId} room={room} userId={userId} />)}</div> :
              <div className="dr-empty"><DoorOpen size={28} /><h3>{query ? 'No rooms match your search' : view === 'Joined rooms' ? 'Your next invitation starts here' : 'A fresh space for your next question'}</h3><p>{query ? 'Try a different title or category.' : view === 'Joined rooms' ? 'Open an invite link from a room creator to join their room.' : 'Create a private room, then invite your team.'}</p><button className="dr-button" onClick={() => query ? setQuery('') : setCreating(true)}>{query ? 'Clear search' : 'Create a room'}</button></div>}
        </section>
        <footer className="dr-footer"><span>A shared question is a good place to start.</span><span>DecisionRoom</span></footer>
      </div>
    </div>
    <JoinRoomDialog open={joining} onOpenChange={setJoining} />
    <CreateRoomDialog open={creating} onOpenChange={setCreating} onCreated={roomId => {
      // A newly mounted detail query reads the confirmed membership.
      navigate(`/rooms/${roomId}`)
    }} />
  </div>
}
