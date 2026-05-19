import { Link } from 'react-router-dom'

function AppTail({ className = '' }) {
  return (
    <footer className={['app-tail', className].filter(Boolean).join(' ')}>
      <Link to="/privacy" className="app-tail-link">
        개인정보 처리방침
      </Link>
    </footer>
  )
}

export default AppTail
