import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Activity from './pages/Activity';
import SettleUp from './pages/SettleUp';
import Insights from './pages/Insights';
import People from './pages/People';
import Onboarding from './pages/Onboarding';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settle" element={<SettleUp />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/people" element={<People />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const hasOnboarded = useStore((s) => s.hasOnboarded);
  const theme = useStore((s) => s.theme);

  // Apply theme to <html data-theme="..."> and keep it in sync
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      if (theme === 'system') {
        root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', theme);
      }
    };

    apply();

    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  if (!hasOnboarded) {
    return (
      <>
        <div className="app-bg" aria-hidden>
          <div className="orb-3" />
          <div className="orb-4" />
        </div>
        <Onboarding />
      </>
    );
  }

  return (
    <BrowserRouter>
      {/* Animated background */}
      <div className="app-bg" aria-hidden>
        <div className="orb-3" />
        <div className="orb-4" />
      </div>

      {/* App shell */}
      <div className="app-shell">
        <SideNav />
        <div className="app-main">
          <AnimatedRoutes />
          <BottomNav />
        </div>
      </div>
    </BrowserRouter>
  );
}
