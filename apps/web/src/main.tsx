import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import './styles.css';

// The desktop app loads over file:// where the HTML5 history API can't navigate to app paths
// (Chromium blocks it, which crashed the screen to blank right after login). HashRouter uses
// URL fragments (#/…) that work under file://. The website keeps BrowserRouter (clean URLs).
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>
);
