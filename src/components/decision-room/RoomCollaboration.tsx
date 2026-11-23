import { useMemo, useState, type FormEvent } from 'react'
import { useAuth, useQuery, useRecordContext } from 'deepspace'
import { Check, MessageSquare, Plus, Vote } from 'lucide-react'
import { roomAction } from '../../rooms/client'
import { voteResults, type OptionComment, type RoomOption, type RoomVote } from '../../rooms/collaboration'

export function RoomCollaboration({ roomId, open }: { roomId: string; open: boolean }) {
  const { userId } = useAuth()
  const { ready } = useRecordContext()
  const options = useQuery<RoomOption>('room_options', { where: { roomId }, orderBy: 'createdAt', orderDir: 'asc' })
  const comments = useQuery<OptionComment>('option_comments', { where: { roomId }, orderBy: 'createdAt', orderDir: 'asc' })
  const votes = useQuery<RoomVote>('room_votes', { where: { roomId } })
  const [pendingVote, setPendingVote] = useState<string | null>(null)
  const [voteError, setVoteError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const optionData = useMemo(() => options.records.map(record => record.data), [options.records])
  const results = voteResults(optionData, votes.records.map(record => record.data))
  const selected = votes.records.find(record => record.data.userId === userId)?.data.optionId
  const loading = [options, comments, votes].some(query => query.status === 'loading')
  const failure = [options, comments, votes].find(query => query.status === 'error')
  const enabled = open && ready

  async function vote(optionId: string) {
    if (!enabled || pendingVote) return
    setPendingVote(optionId); setVoteError(''); setAnnouncement('')
    try {
      await roomAction('castVote', { roomId, optionId })
      setAnnouncement('Vote saved. Results update from the live connection.')
    } catch (cause) {
      setVoteError(cause instanceof Error ? cause.message : 'Could not save your vote.')
    } finally { setPendingVote(null) }
  }

  return <section className="dr-detail-panel dr-collaboration" aria-label="Options, discussion and voting">
    <div className="dr-section-heading"><h2><Vote size={20} />Compare the options</h2><span className="dr-preview-dot">{ready ? 'Connected' : 'Reconnecting'}</span></div>
    <p className="dr-muted">Propose an option, discuss the tradeoffs, and choose one. You can change your vote at any time while the room is open.</p>
    {!open && <p className="dr-form-note">This room is archived. Contributions and voting are disabled.</p>}
    {loading ? <div className="dr-loading" role="status"><span />Loading options, discussion, and votes…</div> : failure ?
      <div className="dr-empty" role="alert"><h3>Could not load the room’s activity</h3><p>{failure.error || 'Please reconnect and try again.'}</p><button className="dr-button" onClick={() => window.location.reload()}>Reconnect</button></div> : <>
        <div className="dr-vote-summary" aria-live="polite"><strong>{results.total} {results.total === 1 ? 'vote' : 'votes'} cast</strong><span>{selected ? 'Your choice is marked below.' : 'You haven’t voted yet.'}</span></div>
        {voteError && <p className="dr-form-note" role="alert">{voteError}</p>}
        <p className="sr-only" role="status">{announcement}</p>
        {!options.records.length && <div className="dr-empty dr-option-empty"><Plus size={26} /><h3>Every decision starts with an option.</h3><p>Propose the first possibility below.</p></div>}
        <div className="dr-options">{options.records.map(({ recordId, data: option }, index) => {
          const result = results.options.find(item => item.optionId === option.optionId)!
          const chosen = selected === option.optionId
          const thread = comments.records.filter(record => record.data.optionId === option.optionId)
            .sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt) || a.recordId.localeCompare(b.recordId))
          return <article className={`dr-option ${chosen ? 'dr-option-selected' : ''}`} key={recordId}>
            <div className="dr-option-heading"><span className="dr-option-number">{String(index + 1).padStart(2, '0')}</span><h3>{option.title}</h3>{chosen && <span className="dr-selected-label"><Check size={14} />Your vote</span>}</div>
            {option.description && <p className="dr-context">{option.description}</p>}
            <p className="dr-muted dr-author">Proposed by {option.authorId === userId ? 'you' : option.authorId} · <time dateTime={option.createdAt}>{new Date(option.createdAt).toLocaleString()}</time></p>
            <div className="dr-result-label"><span>{result.count} {result.count === 1 ? 'vote' : 'votes'}</span><strong>{result.percentage.toFixed(0)}%</strong></div>
            <div className="dr-result-track" role="progressbar" aria-label={`${option.title} vote share`} aria-valuenow={Number(result.percentage.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${result.percentage}%` }} /></div>
            <button className={chosen ? 'dr-button-secondary' : 'dr-button'} aria-pressed={chosen} disabled={!enabled || !!pendingVote || chosen} onClick={() => void vote(option.optionId)}>
              {pendingVote === option.optionId ? 'Saving vote…' : chosen ? 'Your current vote' : selected ? 'Change vote to this' : 'Vote for this option'}
            </button>
            <div className="dr-discussion"><h4><MessageSquare size={15} />Tradeoffs & discussion <span>{thread.length}</span></h4>
              {thread.length ? <ol className="dr-comment-list">{thread.map(({ recordId, data: comment }) => <li key={recordId}><header><strong>{comment.authorId === userId ? 'You' : comment.authorId}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></header><p>{comment.message}</p></li>)}</ol> : <p className="dr-muted">No arguments yet. What should the team consider?</p>}
              <ContributionForm key={option.optionId} enabled={enabled} roomId={roomId} optionId={option.optionId} />
            </div>
          </article>
        })}</div>
        <div className="dr-propose"><h3>Bring another option to the table.</h3><ContributionForm enabled={enabled} roomId={roomId} /></div>
      </>}
  </section>
}

function ContributionForm({ roomId, optionId, enabled }: { roomId: string; optionId?: string; enabled: boolean }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const prefix = optionId || 'propose-option'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!enabled || pending || !(optionId ? body.trim() : title.trim())) return
    setPending(true); setError(''); setNotice('')
    try {
      await roomAction(optionId ? 'postComment' : 'proposeOption', optionId ? { roomId, optionId, message: body } : { roomId, title, description: body })
      setTitle(''); setBody(''); setNotice(optionId ? 'Comment saved.' : 'Option saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your contribution.')
    } finally { setPending(false) }
  }
  return <form className="dr-form" aria-label={optionId ? 'Add an argument' : 'Propose an option'} onSubmit={submit} aria-busy={pending}>
    {!optionId && <><label htmlFor={`${prefix}-title`}>Option title</label><input id={`${prefix}-title`} required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} disabled={!enabled || pending} placeholder="e.g. PostgreSQL" /></>}
    <label htmlFor={`${prefix}-body`}>{optionId ? 'Your argument or comment' : 'Context and tradeoffs (optional)'}</label>
    <textarea id={`${prefix}-body`} required={!!optionId} rows={2} maxLength={600} value={body} onChange={e => setBody(e.target.value)} disabled={!enabled || pending} placeholder={optionId ? 'What makes this a good choice? What are the risks?' : 'Why should the team consider this option?'} />
    <small className="dr-muted">{body.length}/600 characters</small>
    {error && <p className="dr-form-note" role="alert">{error}</p>}
    <span className="dr-muted" role="status">{notice}</span>
    <button className="dr-button-secondary" disabled={!enabled || pending || !(optionId ? body.trim() : title.trim())}>{pending ? 'Saving…' : optionId ? 'Post comment' : 'Propose option'}</button>
  </form>
}
