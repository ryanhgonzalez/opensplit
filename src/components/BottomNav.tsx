import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, NavIcon } from './navItems';
import './BottomNav.css';

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV_ITEMS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => `bottom-nav-tab ${isActive ? 'active' : ''}`}
        >
          <NavIcon path={tab.path} />
          <span className="bottom-nav-label">{tab.shortLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
