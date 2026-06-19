import { Expense } from '../types';

export function getShareForUser(expense: Expense, userId: string): number {
  const entry = expense.split.entries.find(e => e.userId === userId);
  return entry?.amount ?? 0;
}

export function getParticipantIds(expense: Expense): string[] {
  return expense.split.entries.map(e => e.userId);
}

export function getNetAmountForUser(expense: Expense, userId: string): number {
  const share = getShareForUser(expense, userId);
  if (expense.paidBy === userId) {
    return expense.amount - share;
  }
  return -share;
}
