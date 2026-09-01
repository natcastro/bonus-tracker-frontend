import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/msalInstance'

msalInstance.initialize().then(() => {
  return msalInstance.handleRedirectPromise();
}).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
});
