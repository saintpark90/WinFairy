import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { initTheme } from './lib/theme'
import './index.css'
import App from './App.jsx'
import './theme-dark.css'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
      <Analytics />
    </BrowserRouter>
  </StrictMode>,
)
