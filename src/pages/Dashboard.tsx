import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Avatar from '../components/Avatar';
import AddExpenseSheet from '../components/AddExpenseSheet';
import AccountMenuSheet from '../components/AccountMenuSheet';
import { CATEGORY_ICONS } from '../types';
import { useStore, selectCurrentUser, selectOverallBalance, selectRecentExpenses } from '../store';
import { formatCurrency, formatDate, getShareForUser } from '../utils';
import './Dashboard.css';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

type BalanceTab = 'owe' | 'owed';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<BalanceTab>('owed');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const navigate = useNavigate();

  const currentUser = useStore(selectCurrentUser)!;
  const balance = useStore(selectOverallBalance);
  const recentExpenses = useStore(selectRecentExpenses(4));
  const groups = useStore((s) => s.groups);
  const users = useStore((s) => s.users);

  const getUserById = (id: string) => users.find((u) => u.id === id);
  const isPositive = balance.net >= 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page-content">
      <motion.div className="dashboard" variants={containerVariants} initial="hidden" animate="show">
        {/* Header */}
        <motion.div className="dashboard-header" variants={itemVariants}>
          <div className="dashboard-greeting">
            <div>
              <p className="greeting-sub text-secondary text-sm">{greeting},</p>
              <h1 className="greeting-name">{currentUser.name}</h1>
            </div>
            <div className="header-actions">
              <button
                className="icon-btn dash-avatar-btn"
                aria-label="Account"
                onClick={() => setShowAccountMenu(true)}
              >
                <Avatar user={currentUser} size="md" showRing />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Net balance hero card */}
        <motion.div className="px-5 mb-4 dash-balance-hero" variants={itemVariants}>
          <GlassCard variant="strong" className="balance-hero glass-highlight" padding="24px">
            <div className="balance-hero-inner">
              <div>
                <p className="balance-hero-label">{isPositive ? 'You are owed' : 'You owe'}</p>
                <motion.p
                  className={`balance-hero-amount ${isPositive ? 'text-green' : 'text-red'}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
                >
                  {formatCurrency(Math.abs(balance.net))}
                </motion.p>
                <p className="balance-hero-sub text-secondary text-sm">
                  across {groups.filter((g) => g.yourBalance !== 0).length} groups
                </p>
              </div>
              <div className="balance-breakdown">
                <div className="balance-breakdown-item">
                  <div className="breakdown-dot green" />
                  <div>
                    <p className="text-xs text-secondary">Owed to you</p>
                    <p className="text-green" style={{ fontWeight: 600, fontSize: 15 }}>
                      {formatCurrency(balance.totalOwed)}
                    </p>
                  </div>
                </div>
                <div className="balance-breakdown-item">
                  <div className="breakdown-dot red" />
                  <div>
                    <p className="text-xs text-secondary">You owe</p>
                    <p className="text-red" style={{ fontWeight: 600, fontSize: 15 }}>
                      {formatCurrency(balance.totalOwe)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Balance tabs */}
        <motion.div className="px-5 mb-4 dash-balance-tabs" variants={itemVariants}>
          <div className="balance-tabs glass-pill">
            <button
              className={`balance-tab ${activeTab === 'owed' ? 'active' : ''}`}
              onClick={() => setActiveTab('owed')}
            >
              Owed to you
            </button>
            <button
              className={`balance-tab ${activeTab === 'owe' ? 'active' : ''}`}
              onClick={() => setActiveTab('owe')}
            >
              You owe
            </button>
          </div>
        </motion.div>

        {/* Balance list */}
        <motion.div className="px-5 mb-6 dash-balance-list" variants={itemVariants}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="balance-list"
            >
              {(activeTab === 'owed' ? balance.owedByFriend : balance.oweToFriend).map((b) => {
                const friend = getUserById(b.userId);
                if (!friend) return null;
                return (
                  <GlassCard key={b.userId} padding="14px 16px" onClick={() => {}} style={{ marginBottom: 8 }}>
                    <div className="balance-list-item">
                      <Avatar user={friend} size="md" />
                      <div className="balance-list-info">
                        <span style={{ fontWeight: 500, fontSize: 15 }}>{friend.name}</span>
                        <span className="text-sm text-secondary">
                          {activeTab === 'owed' ? 'owes you' : 'you owe'}
                        </span>
                      </div>
                      <span
                        className={activeTab === 'owed' ? 'text-green' : 'text-red'}
                        style={{ fontWeight: 700, fontSize: 17 }}
                      >
                        {activeTab === 'owed' ? '+' : '-'}{formatCurrency(b.amount)}
                      </span>
                    </div>
                  </GlassCard>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Recent expenses */}
        <motion.div className="dash-recent" variants={itemVariants}>
          <div className="section-header">
            <h3>Recent Expenses</h3>
            <button onClick={() => navigate('/activity')}>See all</button>
          </div>
          <GlassCard padding="0" className="dash-recent-card" style={{ marginLeft: 20, marginRight: 20, marginBottom: 24, overflow: 'hidden' }}>
            {recentExpenses.map((expense, i) => {
              const paidByUser = getUserById(expense.paidBy);
              const isPaidByMe = expense.paidBy === currentUser.id;
              const myShare = getShareForUser(expense, currentUser.id);
              return (
                <motion.div
                  key={expense.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.06 }}
                >
                  <div className="recent-expense-item" onClick={() => {}}>
                    <div className="expense-icon-sm">{CATEGORY_ICONS[expense.category]}</div>
                    <div className="expense-info-sm">
                      <span className="expense-desc-sm">{expense.description}</span>
                      <span className="text-xs text-secondary">
                        {isPaidByMe ? 'You' : paidByUser?.name} · {formatDate(expense.date)}
                      </span>
                    </div>
                    <span className={isPaidByMe ? 'text-green' : 'text-red'} style={{ fontSize: 15, fontWeight: 600 }}>
                      {isPaidByMe ? '+' : '-'}{formatCurrency(myShare)}
                    </span>
                  </div>
                  {i < recentExpenses.length - 1 && <div className="divider" style={{ marginLeft: 56 }} />}
                </motion.div>
              );
            })}
          </GlassCard>
        </motion.div>

        {/* Quick groups */}
        <motion.div className="dash-groups" variants={itemVariants} style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h3>Groups</h3>
            <button onClick={() => navigate('/groups')}>See all</button>
          </div>
          <div className="groups-scroll px-5 dash-groups-scroll">
            {groups.map((group) => (
              <GlassCard
                key={group.id}
                padding="16px"
                onClick={() => navigate(`/groups/${group.id}`)}
                style={{ minWidth: 140, flexShrink: 0 }}
              >
                <div className="group-card-mini">
                  <div className="group-card-emoji" style={{ background: `${group.color}22`, borderColor: `${group.color}44` }}>
                    {group.emoji}
                  </div>
                  <span className="group-card-name">{group.name}</span>
                  <span
                    className={`group-card-balance ${group.yourBalance >= 0 ? 'text-green' : 'text-red'}`}
                    style={{ fontSize: 13, fontWeight: 600 }}
                  >
                    {group.yourBalance >= 0 ? '+' : ''}{formatCurrency(group.yourBalance)}
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* FAB */}
      <motion.button
        className="glass-fab fab-fixed"
        aria-label="Add expense"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        onClick={() => setShowAddExpense(true)}
        whileTap={{ scale: 0.92 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </motion.button>

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
    </div>
  );
}
