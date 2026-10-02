import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/msalInstance'

msalInstance.initialize().then(() => {
  return msalInstance.handleRedirectPromise();
}).then((result) => {
  // Email deadline-reminder links point straight at a brief/task; MSAL's redirectUri is fixed to
  // "/", so without this, logging in from one of those links always lands on the Hub home instead.
  const state = result?.state;
  if (typeof state === "string" && state.startsWith("/") && !state.startsWith("//")) {
    window.history.replaceState(null, "", state);
  }
}).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
});
