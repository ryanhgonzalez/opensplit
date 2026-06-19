import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser, type ThemeMode } from '../store';
import Avatar from './Avatar';
import ExportImportSheet from './ExportImportSheet';
import './AccountMenuSheet.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AccountMenuSheet({ open, onClose }: Props) {
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore((s) => s.users);
  const groups = useStore((s) => s.groups);
  const allExpenses = useStore((s) => s.expenses);

  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const [showDataSheet, setShowDataSheet] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const myGroups = groups.filter((g) =>
    g.members.some((m) => m.userId === currentUser.id),
  );

  const handleGeneratePdf = async (groupId: string) => {
    if (pdfLoadingId) return;
    setPdfLoadingId(groupId);
    try {
      const group = groups.find((g) => g.id === groupId)!;
      const expenses = allExpenses.filter((e) => e.groupId === groupId);
      const { generateGroupReport } = await import('../lib/groupReport');
      generateGroupReport(group, expenses, users);
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="ams-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          >
            <motion.div
              className="ams-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring' as const, damping: 32, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ams-handle" />

              {/* User header */}
              <div className="ams-header">
                <Avatar user={currentUser} size="lg" showRing />
                <div className="ams-header-info">
                  <p className="ams-user-name">{currentUser.name}</p>
                  <p className="text-secondary text-xs">Account</p>
                </div>
              </div>

              <div className="ams-divider" />

              {/* Theme toggle */}
              <div className="ams-theme-section">
                <p className="ams-theme-label">Appearance</p>
                <div className="ams-theme-toggle">
                  {(
                    [
                      { value: 'light' as ThemeMode, label: 'Light', icon: '☀️' },
                      { value: 'system' as ThemeMode, label: 'System', icon: '⚙️' },
                      { value: 'dark' as ThemeMode, label: 'Dark', icon: '🌙' },
                    ] as { value: ThemeMode; label: string; icon: string }[]
                  ).map(({ value, label, icon }) => (
                    <button
                      key={value}
                      className={`ams-theme-opt${theme === value ? ' active' : ''}`}
                      onClick={() => setTheme(value)}
                    >
                      <span>{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ams-divider" style={{ marginTop: 8 }} />

              {/* Menu items */}
              <div className="ams-menu">
                {/* Data & Backups */}
                <button className="ams-menu-item" onClick={() => setShowDataSheet(true)}>
                  <div className="ams-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="ams-menu-label">Data &amp; Backups</span>
                  <svg className="ams-menu-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Export Group Report */}
                <button
                  className="ams-menu-item"
                  onClick={() => setShowGroupPicker((v) => !v)}
                  disabled={myGroups.length === 0}
                >
                  <div className="ams-menu-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="ams-menu-label">
                    Export Group Report
                    {myGroups.length === 0 && (
                      <span className="ams-menu-hint"> · No groups yet</span>
                    )}
                  </span>
                  <motion.svg
                    className="ams-menu-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    animate={{ rotate: showGroupPicker ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                </button>

                {/* Group picker (expandable) */}
                <AnimatePresence>
                  {showGroupPicker && myGroups.length > 0 && (
                    <motion.div
                      className="ams-group-list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      {myGroups.map((g) => {
                        const isLoading = pdfLoadingId === g.id;
                        const hasExpenses = allExpenses.some((e) => e.groupId === g.id);
                        return (
                          <button
                            key={g.id}
                            className="ams-group-row"
                            onClick={() => handleGeneratePdf(g.id)}
                            disabled={isLoading || !hasExpenses || !!pdfLoadingId}
                            title={!hasExpenses ? 'No expenses to export' : undefined}
                          >
                            <span className="ams-group-emoji">{g.emoji}</span>
                            <span className="ams-group-name">{g.name}</span>
                            {isLoading ? (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ animation: 'ams-spin 1s linear infinite', flexShrink: 0 }}
                              >
                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
                              </svg>
                            ) : (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ flexShrink: 0, opacity: hasExpenses ? 0.45 : 0.2 }}
                              >
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button className="ams-close" onClick={onClose}>
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ExportImportSheet layers on top */}
      <AnimatePresence>
        {showDataSheet && (
          <ExportImportSheet open={showDataSheet} onClose={() => setShowDataSheet(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
