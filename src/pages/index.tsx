import { Link } from 'react-router-dom'
import { ArrowRight, PanelsTopLeft } from 'lucide-react'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

export default function Landing() {
  return <><Seo {...seo} path="/" /><main data-testid="static-landing" className="dr-landing">
    <div className="dr-brand"><span className="dr-logo"><PanelsTopLeft size={22} /></span>DecisionRoom</div>
    <span className="dr-eyebrow">A LITTLE STRUCTURE. A BETTER DECISION.</span>
    <h1>Great decisions<br />start with a room.</h1>
    <p>Bring the options, tradeoffs, and people together.<br />Give your next team decision a place to happen.</p>
    <Link className="dr-button" to="/home">Open your workspace <ArrowRight size={17} /></Link>
    <small>Private rooms · Shared membership · Built with DeepSpace</small>
  </main></>
}
