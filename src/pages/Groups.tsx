import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Avatar from '../components/Avatar';
import CreateGroupSheet from '../components/CreateGroupSheet';
import { useStore } from '../store';
import { formatCurrency, formatDate } from '../utils';
import './Groups.css';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

export default function Groups() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const groups = useStore((s) => s.groups);
  const users = useStore((s) => s.users);

  const getUserById = (id: string) => users.find((u) => u.id === id);

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-content">
      <motion.div
        className="groups-page"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Page hero header */}
        <motion.div className="page-hero-header" variants={itemVariants}>
          <div>
            <h1 className="page-hero-title">Groups</h1>
            <p className="page-hero-subtitle text-secondary text-sm">
              {groups.length === 0 ? 'No groups yet' : `${groups.length} group${groups.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button className="page-hero-btn" onClick={() => setShowCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            New Group
          </button>
        </motion.div>

        {/* Search */}
        <motion.div className="px-5 mb-4" variants={itemVariants}>
            <div className="search-bar glass-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
                <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search groups..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="search-clear">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </motion.div>

          {/* Summary pills */}
          <motion.div className="px-5 mb-5" variants={itemVariants}>
            <div className="groups-summary">
              <div className="summary-pill glass-pill">
                <span className="text-sm text-secondary">Groups</span>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{groups.length}</span>
              </div>
              <div className="summary-pill glass-pill">
                <span className="text-sm text-secondary">Net balance</span>
                <span className="text-green" style={{ fontWeight: 700, fontSize: 18 }}>
                  +{formatCurrency(
                    groups.reduce((sum, g) => sum + (g.yourBalance > 0 ? g.yourBalance : 0), 0) -
                    groups.reduce((sum, g) => sum + (g.yourBalance < 0 ? Math.abs(g.yourBalance) : 0), 0)
                  )}
                </span>
              </div>
            </div>
          </motion.div>

        {/* Group cards */}
        <div className="px-5 groups-card-list">
            {filtered.length === 0 ? (
              <motion.div variants={itemVariants} className="empty-state">
                <p style={{ fontSize: 40 }}>🔍</p>
                <p className="text-secondary">No groups found</p>
              </motion.div>
            ) : (
              filtered.map(group => {
                const memberUsers = group.members.map((m) => getUserById(m.userId)).filter(Boolean);
                const isOwed = group.yourBalance > 0;
                const isEven = group.yourBalance === 0;

                return (
                  <motion.div key={group.id} variants={itemVariants} className="group-card-item">
                    <GlassCard padding="0" onClick={() => navigate(`/groups/${group.id}`)}>
                      <div className="group-card">
                        {/* Color accent bar */}
                        <div className="group-accent-bar" style={{ background: group.color }} />

                        <div className="group-card-content">
                          {/* Top row */}
                          <div className="group-top-row">
                            <div className="group-emoji-wrap" style={{ background: `${group.color}22`, borderColor: `${group.color}44` }}>
                              <span className="group-emoji">{group.emoji}</span>
                            </div>
                            <div className="group-meta">
                              <h3 className="group-name">{group.name}</h3>
                              <span className="text-xs text-secondary">
                                {group.members.length} members · Last active {formatDate(group.lastActivity)}
                              </span>
                            </div>
                            <div className="group-balance-badge" style={{
                              background: isEven
                                ? 'rgba(255,255,255,0.08)'
                                : isOwed ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                              borderColor: isEven
                                ? 'rgba(255,255,255,0.15)'
                                : isOwed ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
                            }}>
                              <span className={isEven ? 'text-secondary' : isOwed ? 'text-green' : 'text-red'} style={{ fontWeight: 700, fontSize: 15 }}>
                                {isEven ? 'settled' : `${isOwed ? '+' : '-'}${formatCurrency(group.yourBalance)}`}
                              </span>
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="divider" style={{ margin: '12px 0' }} />

                          {/* Bottom row */}
                          <div className="group-bottom-row">
                            <div className="member-avatars">
                              {memberUsers.slice(0, 4).map((u, i) => u && (
                                <div
                                  key={u.id}
                                  style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i }}
                                >
                                  <Avatar user={u} size="sm" />
                                </div>
                              ))}
                              {group.members.length > 4 && (
                                <div className="member-overflow">+{group.members.length - 4}</div>
                              )}
                            </div>
                            <span className="text-xs text-secondary">
                              Total: {formatCurrency(group.totalSpent)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })
            )}
          </div>
      </motion.div>

      <AnimatePresence>
        {showCreate && (
          <CreateGroupSheet
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={(groupId) => {
              setShowCreate(false);
              navigate(`/groups/${groupId}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
