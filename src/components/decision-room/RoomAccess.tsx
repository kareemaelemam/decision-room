import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth, useSession } from 'deepspace'
import { consumeRoomDestination, rememberRoomDestination } from '../../rooms/auth-return'

export function RoomAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const { error, refetch } = useSession()
  const [signIn, setSignIn] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded) return
    try {
      if (!isSignedIn) {
        rememberRoomDestination(sessionStorage, location.pathname + location.hash)
      } else {
        const destination = consumeRoomDestination(sessionStorage)
        if (destination && location.pathname === '/home') navigate(destination, { replace: true })
      }
    } catch {
      // Browsers may disable sessionStorage. The original invite link remains usable.
    }
  }, [isLoaded, isSignedIn, location.pathname, location.hash, navigate])

  if (error) return <div className="dr-empty" role="alert">
    <h1>We couldn’t verify your session</h1>
    <p>Check your connection, then try again.</p>
    <button className="dr-button" onClick={() => void refetch()}>Retry authentication</button>
  </div>
  if (!isLoaded) return <div className="dr-loading" role="status"><span />Checking your session…</div>
  if (!isSignedIn) return <div className="dr-landing dr-signed-out">
    <span className="dr-eyebrow">YOUR TEAM’S NEXT DECISION STARTS HERE</span>
    <h1>A private space<br />to think together.</h1>
    <p>Sign in to create a room, accept an invitation,<br />or return to your team’s decisions.</p>
    {location.pathname === '/join' && <p className="dr-muted">We’ll return you to this invitation after sign-in. If your browser blocks session storage, reopen the invitation link afterward.</p>}
    <button className="dr-button" onClick={() => setSignIn(true)}>Sign in to continue</button>
    {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
  </div>
  // Unmount private UI/state immediately when the authenticated identity changes.
  return <div key={userId}>{children}</div>
}
