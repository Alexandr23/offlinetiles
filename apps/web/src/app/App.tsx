import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from '@/modules/landing/LandingPage';
import { GlobalStyle } from '@/shared/styles/GlobalStyle';

// The editor (map engine, drawing tools) and the admin are far bigger than the landing page.
// Load them only when someone opens them, so visitors of "/" download just the landing.
const EditorPage = lazy(() => import('./EditorPage').then((m) => ({ default: m.EditorPage })));
const AdminPage = lazy(() => import('@/modules/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

export function App() {
  return (
    <BrowserRouter>
      <GlobalStyle />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
