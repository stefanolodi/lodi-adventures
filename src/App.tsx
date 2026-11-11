import { Navigate, Route, Routes } from 'react-router-dom';
import { useSmoothScroll } from './useSmoothScroll';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { useSyncGateBackdrop } from './hooks/useSyncGateBackdrop';
import { GateLock } from './components/GateLock';
import { AlbumPage } from './pages/AlbumPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  useSmoothScroll();
  const { theme, toggleTheme } = useTheme();
  const { isOwner } = useAuth();
  useSyncGateBackdrop(isOwner);

  return (
    <GateLock>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={<HomePage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route
          path="/album/:albumId"
          element={<AlbumPage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </GateLock>
  );
}
