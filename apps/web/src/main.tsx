import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/russo-one/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import './styles/global.css';
import { App } from './App';
import { currentRoute } from './ui/links';

// Painel admin e páginas legais são carregados à parte, sem o motor do jogo.
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));
const LegalPage = lazy(() => import('./legal/LegalPage').then((m) => ({ default: m.LegalPage })));
const path = currentRoute();

function Root() {
  if (path === '/admin') return <AdminApp />;
  if (path === '/termos' || path === '/privacidade')
    return <LegalPage page={path === '/termos' ? 'termos' : 'privacidade'} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
