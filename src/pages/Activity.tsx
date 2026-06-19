import { useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from '../components/Avatar';
import GlassCard from '../components/GlassCard';
import { Activity } from '../types';
import { useStore, selectActivities, selectCurrentUser } from '../store';
import {
  formatCurrency,
  formatDate,
  formatTime,
  getActivityDescription,
  isActivityPositive,
  getActivityAmount,
} from '../utils';
import './Activity.css';

type Filter = 'all' | 'expenses' | 'payments';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
};

function groupByDate(items: Activity[]) {
  const map = new Map<string, Activity[]>();
  for (const item of items) {
    const key = formatDate(item.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const currentUser = useStore(selectCurrentUser)!;
  const allActivities = useStore(selectActivities);
  const users = useStore((s) => s.users);
  const groups = useStore((s) => s.groups);
  const expenses = useStore((s) => s.expenses);

  const getExpenseById = (id: string) => expenses.find((e) => e.id === id);
  const getUserById = (id: string) => users.find((u) => u.id === id);
  const getGroupById = (id: string) => groups.find((g) => g.id === id);

  const filtered = allActivities.filter((a) => {
    if (filter === 'expenses') return a.type === 'expense_added' || a.type === 'expense_updated';
    if (filter === 'payments') return a.type === 'payment' || a.type === 'settled';
    return true;
  });

  const grouped = groupByDate(filtered);

  return (
    <div className="page-content">
      <motion.div
        className="activity-page"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Page hero header */}
        <motion.div className="page-hero-header" variants={itemVariants}>
          <div>
            <h1 className="page-hero-title">Activity</h1>
            <p className="page-hero-subtitle text-secondary text-sm">
              {allActivities.length === 0 ? 'No activity yet' : `${allActivities.length} event${allActivities.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </motion.div>

        {/* Filter chips */}
        <motion.div className="filter-row px-5 mb-5" variants={itemVariants}>
            {(['all', 'expenses', 'payments'] as Filter[]).map(f => (
              <motion.button
                key={f}
                className={`filter-chip ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
                whileTap={{ scale: 0.95 }}
              >
                {f === 'all' ? 'All' : f === 'expenses' ? 'Expenses' : 'Payments'}
              </motion.button>
            ))}
          </motion.div>

          {/* Activity feed */}
          {[...grouped.entries()].map(([date, items]) => (
            <div key={date} className="activity-group">
              <motion.div variants={itemVariants} className="activity-date-label px-5">
                <span>{date}</span>
                <div className="activity-date-line" />
              </motion.div>

              {items.map(activity => {
                const actor = getUserById(activity.actorId);
                const group = activity.groupId ? getGroupById(activity.groupId) : undefined;
                if (!actor) return null;

                const description = getActivityDescription(
                  activity,
                  currentUser.id,
                  getExpenseById,
                  getUserById
                );
                const isPositive = isActivityPositive(activity, currentUser.id);
                const amount = getActivityAmount(activity, currentUser.id, getExpenseById);
                const isPayment = activity.type === 'payment' || activity.type === 'settled';

                return (
                  <motion.div key={activity.id} variants={itemVariants} className="px-5">
                    <GlassCard padding="14px 16px" onClick={() => {}} style={{ marginBottom: 10 }}>
                      <div className="activity-item">
                        <div className="activity-avatar-wrap">
                          <Avatar user={actor} size="md" />
                          <div className={`activity-type-dot ${isPositive ? 'green' : 'red'}`}>
                            {isPositive ? (
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                <path d="M5 8V2M2 5L5 2L8 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                <path d="M5 2V8M2 5L5 8L8 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>

                        <div className="activity-content">
                          <span className="activity-description">{description}</span>
                          <div className="activity-meta">
                            {group && (
                              <>
                                <span
                                  className="activity-group-tag"
                                  style={{ background: `${group.color}22`, borderColor: `${group.color}44`, color: group.color }}
                                >
                                  {group.emoji} {group.name}
                                </span>
                                <span className="text-tertiary text-xs">·</span>
                              </>
                            )}
                            <span className="text-xs text-secondary">{formatTime(activity.date)}</span>
                          </div>
                        </div>

                        <div className="activity-amount">
                          {amount > 0 && (
                            <span className={isPositive ? 'text-green' : 'text-red'}>
                              {isPositive ? '+' : '-'}{formatCurrency(amount)}
                            </span>
                          )}
                          {isPayment ? (
                            <span className="activity-badge settled">Settled</span>
                          ) : (
                            <span className="activity-badge expense">Expense</span>
                          )}
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <motion.div variants={itemVariants} className="empty-state">
              <p style={{ fontSize: 40 }}>📭</p>
              <p className="text-secondary">No activity yet</p>
            </motion.div>
          )}
      </motion.div>
    </div>
  );
}
