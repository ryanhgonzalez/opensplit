import type { AppStore } from './useStore';
import type { Activity, Expense, OverallBalance } from '../types';

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

// ─── Computed balance ─────────────────────────────────────────────────────────

// Memoized: returns the same OverallBalance object when friendBalances hasn't changed.
// Without this, the selector creates new arrays on every call → useSyncExternalStore
// sees a changed snapshot on every render → infinite re-render loop.
let _friendBalancesSlice: Record<string, number> | undefined;
let _overallBalance: OverallBalance | undefined;

export const selectOverallBalance = (s: AppStore): OverallBalance => {
  if (_friendBalancesSlice === s.friendBalances && _overallBalance) return _overallBalance;

  const owedByFriend = Object.entries(s.friendBalances)
    .filter(([, amount]) => amount > 0.005)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const oweToFriend = Object.entries(s.friendBalances)
    .filter(([, amount]) => amount < -0.005)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const totalOwed = owedByFriend.reduce((sum, b) => sum + b.amount, 0);
  const totalOwe = oweToFriend.reduce((sum, b) => sum + b.amount, 0);

  _friendBalancesSlice = s.friendBalances;
  _overallBalance = { net: totalOwed - totalOwe, totalOwed, totalOwe, owedByFriend, oweToFriend };
  return _overallBalance;
};

export const selectGroupBalance = (groupId: string) => (s: AppStore) =>
  s.groups.find((g) => g.id === groupId)?.yourBalance ?? 0;

export const selectGroupTotalSpent = (groupId: string) => (s: AppStore) =>
  s.groups.find((g) => g.id === groupId)?.totalSpent ?? 0;
