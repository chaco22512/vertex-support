import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  IconBook,
  IconDashboard,
  IconHistory,
  IconInbox,
  IconReview,
  IconStaff,
} from './icons';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true, adminOnly: false },
  { to: '/inbox', label: 'Inbox', icon: IconInbox, end: false, adminOnly: false },
  { to: '/knowledge', label: 'Knowledge', icon: IconBook, end: false, adminOnly: true },
  { to: '/review', label: 'Review queue', icon: IconReview, end: false, adminOnly: true },
  { to: '/staff', label: 'Staff', icon: IconStaff, end: false, adminOnly: true },
  { to: '/history', label: 'Change history', icon: IconHistory, end: false, adminOnly: true },
];

export function Layout() {
  const { staff, signOut } = useAuth();
  const isAdmin = staff?.role === 'admin';

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar-brand">
          <img src="/logo-mark.png" width={28} height={28} alt="" />
          <span>SIM Point Support</span>
        </div>
        {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <n.icon size={18} />
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div>{staff?.name}</div>
          <div className="muted" style={{ textTransform: 'capitalize' }}>
            {staff?.role}
          </div>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
