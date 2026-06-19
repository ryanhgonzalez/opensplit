import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import Avatar from './Avatar';
import AddExpenseSheet from './AddExpenseSheet';
import AccountMenuSheet from './AccountMenuSheet';
import './SideNav.css';

const tabs = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 12L12 3L21 12V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V12Z"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={active ? 'currentColor' : 'none'}
          fillOpacity={active ? 0.15 : 0}
        />
      </svg>
    ),
  },
  {
    to: '/groups',
    label: 'Groups',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M3 21V19C3 16.7909 4.79086 15 7 15H11C13.2091 15 15 16.7909 15 19V21" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
        <path d="M16 3.13C17.7699 3.58 19 5.19 19 7C19 8.81 17.7699 10.42 16 10.87" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
        <path d="M21 21V19C20.9949 17.2 19.7999 15.63 18 15.13" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/people',
    label: 'People',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}
          fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20"
          stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/activity',
    label: 'Activity',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M22 12H18L15 21L9 3L6 12H2"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/settle',
    label: 'Settle Up',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.1 : 0} />
        <path d="M12 6V8M12 16V18M9 9.5C9 8.67 9.67 8 10.5 8H13C13.83 8 14.5 8.67 14.5 9.5C14.5 10.33 13.83 11 13 11H11C10.17 11 9.5 11.67 9.5 12.5C9.5 13.33 10.17 14 11 14H13.5C14.33 14 15 13.33 15 12.5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/insights',
    label: 'Insights',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="13" width="4" height="8" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}
          fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <rect x="10" y="8" width="4" height="13" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}
          fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <rect x="17" y="3" width="4" height="18" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}
          fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      </svg>
    ),
  },
];

export default function SideNav() {
  const currentUser = useStore(selectCurrentUser)!;
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  return (
    <>
      <aside className="side-nav">
        {/* Logo */}
        <div className="side-nav-logo">
          <div className="side-nav-logo-mark">💸</div>
          <span className="side-nav-logo-text">Splitify</span>
        </div>

        {/* Nav items */}
        <nav className="side-nav-items">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `side-nav-item ${isActive ? 'active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <div className="side-nav-item-icon">{tab.icon(isActive)}</div>
                  <span className="side-nav-item-label">{tab.label}</span>
                  {isActive && <div className="side-nav-active-bar" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="side-nav-spacer" />

        {/* Add Expense */}
        <button className="side-nav-add-btn" onClick={() => setShowAddExpense(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Add Expense
        </button>

        {/* User — opens account menu */}
        <button className="side-nav-user" onClick={() => setShowAccountMenu(true)}>
          <Avatar user={currentUser} size="sm" showRing />
          <div className="side-nav-user-info">
            <span className="side-nav-user-name">{currentUser.name}</span>
            {currentUser.email && (
              <span className="side-nav-user-email">{currentUser.email}</span>
            )}
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 'auto' }}>
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </aside>

      <AnimatePresence>
        {showAddExpense && (
          <AddExpenseSheet
            open={showAddExpense}
            onClose={() => setShowAddExpense(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountMenu && (
          <AccountMenuSheet
            open={showAccountMenu}
            onClose={() => setShowAccountMenu(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
