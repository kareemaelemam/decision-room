import { useRecordContext } from 'deepspace'

export function ConnectionNotice() {
  const { status } = useRecordContext()
  if (status === 'connected') return null
  return <div className="dr-form-note" role="status">
    {status === 'connecting' ? 'Connecting to your rooms…' : 'The live connection was interrupted. Reconnecting automatically; the displayed data may be out of date.'}
    {status === 'disconnected' && <button className="dr-button-secondary ml-3" onClick={() => window.location.reload()}>Reconnect now</button>}
  </div>
}
