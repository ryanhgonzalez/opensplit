import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Attaches the install-prompt listener before anything renders (see pwa.ts).
import './lib/pwa'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
