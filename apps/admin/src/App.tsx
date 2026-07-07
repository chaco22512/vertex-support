import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Conversation } from './pages/Conversation';
import { Knowledge } from './pages/Knowledge';
import { Review } from './pages/Review';
import { StaffPage } from './pages/StaffPage';
import { History } from './pages/History';

/** Gate on a valid session AND an active staff row (§7 roles). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, staff, staffError, loading, refresh, signOut } = useAuth();
  if (loading) return <div className="state">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  // Surface any post-login failure (network/CORS/not-staff) instead of stalling.
  if (staffError || !staff || !staff.isActive) {
    return (
      <div className="state error" role="alert">
        <div>{staffError ?? 'Your account is not an active staff member. Contact an administrator.'}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn btn-sm" onClick={refresh}>
            Try again
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** admin-only screens (§7.4–7.7). Staff get redirected to the Inbox. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { staff } = useAuth();
  if (staff?.role !== 'admin') return <Navigate to="/inbox" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="inbox/:id" element={<Conversation />} />
        <Route
          path="knowledge"
          element={
            <RequireAdmin>
              <Knowledge />
            </RequireAdmin>
          }
        />
        <Route
          path="review"
          element={
            <RequireAdmin>
              <Review />
            </RequireAdmin>
          }
        />
        <Route
          path="staff"
          element={
            <RequireAdmin>
              <StaffPage />
            </RequireAdmin>
          }
        />
        <Route
          path="history"
          element={
            <RequireAdmin>
              <History />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
