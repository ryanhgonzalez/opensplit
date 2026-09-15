import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from '../components/Avatar';
import GlassCard from '../components/GlassCard';
import ExpenseFilterBar from '../components/ExpenseFilterBar';
import { Activity, CATEGORY_LABELS } from '../types';
import { useStore, selectActivities, selectCurrentUser } from '../store';
import { EMPTY_FILTER, isFilterActive, resolveDateRange, type ExpenseFilter } from '../lib/expenseFilter';
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
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
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

  const [search, setSearch] = useState<ExpenseFilter>(EMPTY_FILTER);

  const byType = allActivities.filter((a) => {
    if (filter === 'expenses') return a.type === 'expense_added' || a.type === 'expense_updated';
    if (filter === 'payments') return a.type === 'payment' || a.type === 'settled';
    return true;
  });

  // Search across every group: the sentence shown for the entry, the group
  // name, and for expenses their description, notes, category and amount.
  const filtered = useMemo(() => {
    if (!isFilterActive(search)) return byType;
    const { start, end } = resolveDateRange(search);
    const terms = search.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return byType.filter((a) => {
      const when = a.date.getTime();
      if (start && when < start.getTime()) return false;
      if (end && when > end.getTime()) return false;
      if (terms.length === 0) return true;
      const parts: string[] = [getActivityDescription(a, currentUser.id, getExpenseById, getUserById)];
      const group = a.groupId ? getGroupById(a.groupId) : undefined;
      if (group) parts.push(group.name);
      if (a.type === 'expense_added' || a.type === 'expense_updated') {
        const e = getExpenseById(a.expenseId);
        if (e) parts.push(e.description, e.notes ?? '', CATEGORY_LABELS[e.category], String(e.amount), e.amount.toFixed(2), getUserById(e.paidBy)?.name ?? '');
      } else if (a.type === 'payment' || a.type === 'settled') {
        parts.push(String(a.amount), a.amount.toFixed(2), getUserById(a.fromUserId)?.name ?? '', getUserById(a.toUserId)?.name ?? '');
      }
      const haystack = parts.join(' ').toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [byType, search, currentUser.id, expenses, users, groups]); // eslint-disable-line react-hooks/exhaustive-deps

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

          {/* Search across every group */}
          <motion.div className="px-5 mb-4" variants={itemVariants}>
            <ExpenseFilterBar
              value={search}
              onChange={setSearch}
              matchCount={filtered.length}
              totalCount={byType.length}
            />
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
                const isPositive = isActivityPositive(activity, currentUser.id, getExpenseById);
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
