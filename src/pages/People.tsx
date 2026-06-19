import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import Avatar from '../components/Avatar';
import PersonSheet from '../components/PersonSheet';
import GlassCard from '../components/GlassCard';
import { formatCurrency } from '../utils';
import './People.css';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
};

export default function People() {
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore(s => s.users);
  const groups = useStore(s => s.groups);
  const friendBalances = useStore(s => s.friendBalances);
  const addUser = useStore(s => s.addUser);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');

  const others = users.filter(u => u.id !== currentUser.id);

  // Sort: unsettled balances first, then alphabetical
  const sorted = [...others].sort((a, b) => {
    const balA = Math.abs(friendBalances[a.id] ?? 0);
    const balB = Math.abs(friendBalances[b.id] ?? 0);
    if (balA > 0.005 && balB <= 0.005) return -1;
    if (balA <= 0.005 && balB > 0.005) return 1;
    return a.name.localeCompare(b.name);
  });

  const sharedGroupCount = (userId: string) =>
    groups.filter(
      g => g.members.some(m => m.userId === userId) &&
           g.members.some(m => m.userId === currentUser.id),
    ).length;

  const handleAddPerson = () => {
    if (!newName.trim()) return;
    addUser({ name: newName.trim() });
    setNewName('');
    setShowAddForm(false);
  };

  return (
    <div className="page-content">
      <motion.div
        className="people-page"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div className="people-header" variants={itemVariants}>
          <div>
            <h1 className="people-title">People</h1>
            <p className="people-subtitle text-secondary text-sm">
              {others.length === 0
                ? 'No people added yet'
                : `${others.length} ${others.length === 1 ? 'person' : 'people'}`}
            </p>
          </div>
          <button
            className="people-add-btn"
            onClick={() => setShowAddForm(v => !v)}
            aria-label="Add person"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Add Person
          </button>
        </motion.div>

        {/* Inline add form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              className="px-5"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <GlassCard padding="14px 16px" style={{ marginBottom: 12, overflow: 'hidden' }}>
                <div className="people-add-row">
                  <input
                    className="field-input"
                    style={{ flex: 1 }}
                    placeholder="Their name…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddPerson()}
                    autoFocus
                  />
                  <button
                    className="people-add-confirm"
                    onClick={handleAddPerson}
                    disabled={!newName.trim()}
                  >
                    Add
                  </button>
                  <button
                    className="people-add-cancel"
                    onClick={() => { setShowAddForm(false); setNewName(''); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* You (current user) */}
        <motion.div variants={itemVariants} className="px-5">
          <p className="people-section-label">You</p>
          <GlassCard padding="0" style={{ marginBottom: 12 }}>
            <button
              className="people-row"
              onClick={() => setSelectedUserId(currentUser.id)}
            >
              <Avatar user={currentUser} size="md" showRing />
              <div className="people-row-info">
                <span className="people-row-name">{currentUser.name}</span>
                <span className="people-row-meta text-secondary text-xs">
                  {currentUser.email ?? 'Your profile'}
                </span>
              </div>
              <svg className="people-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </GlassCard>
        </motion.div>

        {/* Other people */}
        {sorted.length > 0 && (
          <motion.div variants={itemVariants} className="px-5">
            <p className="people-section-label">Friends &amp; contacts</p>
            <div className="people-list">
              {sorted.map(user => {
                const balance = friendBalances[user.id] ?? 0;
                const settled = Math.abs(balance) < 0.005;
                const gc = sharedGroupCount(user.id);
                return (
                  <GlassCard key={user.id} padding="0" style={{ marginBottom: 8 }}>
                    <button
                      className="people-row"
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <Avatar user={user} size="md" />
                      <div className="people-row-info">
                        <span className="people-row-name">{user.name}</span>
                        <span className="people-row-meta text-secondary text-xs">
                          {gc === 0 ? 'No shared groups' : `${gc} shared group${gc !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="people-row-balance">
                        {settled ? (
                          <span className="people-balance-settled">Settled</span>
                        ) : (
                          <>
                            <span className={balance > 0 ? 'text-green' : 'text-red'} style={{ fontSize: 13, fontWeight: 700 }}>
                              {balance > 0 ? '+' : '-'}{formatCurrency(balance)}
                            </span>
                            <span className="text-tertiary" style={{ fontSize: 10, marginTop: 1 }}>
                              {balance > 0 ? 'owes you' : 'you owe'}
                            </span>
                          </>
                        )}
                      </div>
                      <svg className="people-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </GlassCard>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {sorted.length === 0 && !showAddForm && (
          <motion.div variants={itemVariants} className="px-5">
            <GlassCard padding="48px 24px">
              <div className="people-empty">
                <span style={{ fontSize: 40 }}>👥</span>
                <p className="people-empty-title">No people yet</p>
                <p className="text-secondary text-sm" style={{ textAlign: 'center' }}>
                  Add friends and contacts so you can split expenses with them.
                </p>
                <button className="people-empty-cta" onClick={() => setShowAddForm(true)}>
                  Add your first person
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </motion.div>

      {/* Person sheet */}
      <AnimatePresence>
        {selectedUserId && (
          <PersonSheet
            open={!!selectedUserId}
            onClose={() => setSelectedUserId(null)}
            userId={selectedUserId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
