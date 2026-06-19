import type { Expense, ExpenseCategory, Group, User } from '../types';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../types';
import { getShareForUser } from '../utils/expense';

// ── Config ────────────────────────────────────────────────────────────────────

export type Period = 1 | 3 | 6 | 0;
export type ViewMode = 'personal' | 'total';

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food:            '#f59e0b',
  groceries:       '#84cc16',
  transport:       '#60a5fa',
  travel:          '#34d399',
  accommodation:   '#22d3ee',
  shopping:        '#fb923c',
  entertainment:   '#f472b6',
  utilities:       '#a78bfa',
  rent:            '#818cf8',
  healthcare:      '#f87171',
  gifts:           '#c084fc',
  education:       '#4ade80',
  subscriptions:   '#38bdf8',
  'personal-care': '#fb7185',
  other:           '#94a3b8',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CategoryBreakdown {
  category: ExpenseCategory;
  label: string;
  icon: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface MonthlyPoint {
  month: string;
  key: string;
  total: number;
  yourShare: number;
}

export interface MemberContribution {
  userId: string;
  name: string;
  initials: string;
  avatarColor: string;
  paid: number;
  share: number;
}

export interface GroupContribution {
  groupId: string;
  name: string;
  emoji: string;
  color: string;
  totalSpent: number;
  members: MemberContribution[];
}

// ── Computations ──────────────────────────────────────────────────────────────

export function filterByPeriod(expenses: Expense[], period: Period): Expense[] {
  if (period === 0) return expenses;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - period);
  return expenses.filter(e => e.date >= cutoff);
}

export function getCategoryBreakdown(
  expenses: Expense[],
  userId: string,
  mode: ViewMode,
): CategoryBreakdown[] {
  const totals: Partial<Record<ExpenseCategory, number>> = {};

  for (const expense of expenses) {
    const amount = mode === 'personal' ? getShareForUser(expense, userId) : expense.amount;
    if (amount > 0) {
      totals[expense.category] = (totals[expense.category] ?? 0) + amount;
    }
  }

  const grandTotal = Object.values(totals).reduce((s, v) => s + (v ?? 0), 0);

  return (Object.entries(totals) as [ExpenseCategory, number][])
    .map(([category, amount]) => ({
      category,
      label: CATEGORY_LABELS[category],
      icon: CATEGORY_ICONS[category],
      amount,
      percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[category],
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function getMonthlyTrend(
  expenses: Expense[],
  userId: string,
  period: Period,
): MonthlyPoint[] {
  const monthCount = period === 0 ? 12 : period;
  const now = new Date();
  const points: Record<string, MonthlyPoint> = {};

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const month = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    points[key] = { month, key, total: 0, yourShare: 0 };
  }

  for (const expense of expenses) {
    const d = expense.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (points[key]) {
      points[key].total += expense.amount;
      points[key].yourShare += getShareForUser(expense, userId);
    }
  }

  return Object.values(points);
}

export function getGroupContributions(
  expenses: Expense[],
  groups: Group[],
  users: User[],
  currentUserId: string,
): GroupContribution[] {
  return groups
    .map(group => {
      const gExp = expenses.filter(e => e.groupId === group.id);
      const totalSpent = gExp.reduce((s, e) => s + e.amount, 0);
      if (totalSpent === 0) return null;

      const members: MemberContribution[] = group.members
        .map(m => {
          const user = users.find(u => u.id === m.userId);
          if (!user) return null;
          const paid = gExp
            .filter(e => e.paidBy === m.userId)
            .reduce((s, e) => s + e.amount, 0);
          const share = gExp.reduce((s, e) => s + getShareForUser(e, m.userId), 0);
          return {
            userId: m.userId,
            name: m.userId === currentUserId ? 'You' : user.name.split(' ')[0],
            initials: user.initials,
            avatarColor: user.avatarColor,
            paid,
            share,
          };
        })
        .filter((m): m is MemberContribution => m !== null);

      return {
        groupId: group.id,
        name: group.name,
        emoji: group.emoji,
        color: group.color,
        totalSpent,
        members,
      };
    })
    .filter((g): g is GroupContribution => g !== null);
}
