import type { AppStore } from './useStore';
import type { Activity, Expense, OverallBalance } from '../types';
import { deriveTotals, type DerivedTotals, type GroupTotals } from '../lib/calculations';

// ─── Entity lookups ───────────────────────────────────────────────────────────

export const selectCurrentUser = (s: AppStore) =>
  s.users.find((u) => u.id === s.currentUserId);

/** Usage: useStore(selectUserById('user-1')) */
export const selectUserById = (id: string) => (s: AppStore) =>
  s.users.find((u) => u.id === id);

export const selectGroupById = (id: string) => (s: AppStore) =>
  s.groups.find((g) => g.id === id);

export const selectExpenseById = (id: string) => (s: AppStore) =>
  s.expenses.find((e) => e.id === id);

export const selectSettlementById = (id: string) => (s: AppStore) =>
  s.settlements.find((sett) => sett.id === id);

// ─── Collection slices ────────────────────────────────────────────────────────

export const selectExpensesByGroup = (groupId: string) => (s: AppStore) =>
  s.expenses.filter((e) => e.groupId === groupId);

// Memoized: returns the same array reference when s.activities hasn't changed.
// This keeps useSyncExternalStore's snapshot stable between renders.
let _activitiesSlice: Activity[] | undefined;
let _sortedActivities: Activity[] | undefined;

export const selectActivities = (s: AppStore): Activity[] => {
  if (_activitiesSlice === s.activities && _sortedActivities) return _sortedActivities;
  _activitiesSlice = s.activities;
  _sortedActivities = [...s.activities].sort((a, b) => b.date.getTime() - a.date.getTime());
  return _sortedActivities;
};

export const selectActivitiesByGroup = (groupId: string) => (s: AppStore) =>
  s.activities.filter((a) => a.groupId === groupId);

// Memoized per limit: returns the same array reference when s.expenses hasn't changed.
const _recentExpensesCache = new Map<number, { ref: Expense[]; result: Expense[] }>();

export const selectRecentExpenses = (limit = 10) => (s: AppStore): Expense[] => {
  const cached = _recentExpensesCache.get(limit);
  if (cached?.ref === s.expenses) return cached.result;
  const result = [...s.expenses]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
  _recentExpensesCache.set(limit, { ref: s.expenses, result });
  return result;
};

// ─── Derived balances ─────────────────────────────────────────────────────────

// Balances are computed from the raw records rather than stored, so they cannot
// disagree with the expenses they came from. Memoized on the exact inputs
// `deriveTotals` reads: without a stable reference, every call would produce new
// objects → useSyncExternalStore sees a changed snapshot on every render →
// infinite re-render loop.
let _totalsKey: { expenses: Expense[]; settlements: AppStore['settlements']; currentUserId: string } | undefined;
let _totals: DerivedTotals | undefined;

export const selectDerivedTotals = (s: AppStore): DerivedTotals => {
  if (
    _totals &&
    _totalsKey &&
    _totalsKey.expenses === s.expenses &&
    _totalsKey.settlements === s.settlements &&
    _totalsKey.currentUserId === s.currentUserId
  ) {
    return _totals;
  }

  _totals = deriveTotals(s.expenses, s.settlements, s.currentUserId);
  _totalsKey = { expenses: s.expenses, settlements: s.settlements, currentUserId: s.currentUserId };
  return _totals;
};

/** userId → net balance. Positive = they owe you; negative = you owe them. */
export const selectFriendBalances = (s: AppStore): Record<string, number> =>
  selectDerivedTotals(s).friendBalances;

/** groupId → that group's totals. Groups with no expenses are absent. */
export const selectGroupTotals = (s: AppStore): Record<string, GroupTotals> =>
  selectDerivedTotals(s).groupTotals;

const NO_TOTALS: GroupTotals = { yourBalance: 0, totalSpent: 0 };

/** Usage: useStore(selectTotalsForGroup('group-1')) */
export const selectTotalsForGroup = (groupId: string) => (s: AppStore): GroupTotals =>
  selectDerivedTotals(s).groupTotals[groupId] ?? NO_TOTALS;

// Memoized on the derived totals it reads, so the arrays it builds stay stable.
let _overallSource: DerivedTotals | undefined;
let _overallBalance: OverallBalance | undefined;

export const selectOverallBalance = (s: AppStore): OverallBalance => {
  const totals = selectDerivedTotals(s);
  if (_overallSource === totals && _overallBalance) return _overallBalance;

  const owedByFriend = Object.entries(totals.friendBalances)
    .filter(([, amount]) => amount > 0.005)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const oweToFriend = Object.entries(totals.friendBalances)
    .filter(([, amount]) => amount < -0.005)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const totalOwed = owedByFriend.reduce((sum, b) => sum + b.amount, 0);
  const totalOwe = oweToFriend.reduce((sum, b) => sum + b.amount, 0);

  _overallSource = totals;
  _overallBalance = { net: totalOwed - totalOwe, totalOwed, totalOwe, owedByFriend, oweToFriend };
  return _overallBalance;
};

export const selectGroupBalance = (groupId: string) => (s: AppStore) =>
  selectTotalsForGroup(groupId)(s).yourBalance;

export const selectGroupTotalSpent = (groupId: string) => (s: AppStore) =>
  selectTotalsForGroup(groupId)(s).totalSpent;
