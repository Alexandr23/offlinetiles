import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from '@/modules/admin/AdminPage';
import { LandingPage } from '@/modules/landing/LandingPage';
import { GlobalStyle } from '@/shared/styles/GlobalStyle';
import { EditorPage } from './EditorPage';

export function App() {
  return (
    <BrowserRouter>
      <GlobalStyle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
