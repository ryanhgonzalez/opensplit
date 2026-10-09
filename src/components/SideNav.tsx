import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import Avatar from './Avatar';
import AddExpenseSheet from './AddExpenseSheet';
import AccountMenuSheet from './AccountMenuSheet';
import { NAV_ITEMS, NavIcon } from './navItems';
import './SideNav.css';

export default function SideNav() {
  const currentUser = useStore(selectCurrentUser)!;
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  return (
    <>
      <aside className="side-nav">
        <span className="side-nav-wordmark">OpenSplit</span>

        <nav className="side-nav-items" aria-label="Main">
          {NAV_ITEMS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `side-nav-item ${isActive ? 'active' : ''}`}
            >
              <NavIcon path={tab.path} size={18} />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-nav-spacer" />

        <button className="btn btn-primary side-nav-add-btn" onClick={() => setShowAddExpense(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add expense
        </button>

        {/* Opens the account menu: theme, switch person, backups, reports */}
        <button className="side-nav-user" onClick={() => setShowAccountMenu(true)}>
          <Avatar user={currentUser} size="sm" />
          <span className="side-nav-user-info">
            <span className="side-nav-user-name">{currentUser.name}</span>
            <span className="side-nav-user-sub">Account &amp; backups</span>
          </span>
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
