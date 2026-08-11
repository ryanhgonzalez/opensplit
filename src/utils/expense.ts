import { Expense } from '../types';
import { netForUserOnExpense } from '../lib/calculations';

export function getShareForUser(expense: Expense, userId: string): number {
  const entry = expense.split.entries.find(e => e.userId === userId);
  return entry?.amount ?? 0;
}

export function getParticipantIds(expense: Expense): string[] {
  return expense.split.entries.map(e => e.userId);
}

/**
 * Re-exported from the calculation layer so there is exactly one definition of
 * "what did this expense do to my balance" in the app. Two copies had already
 * drifted apart once.
 */
export function getNetAmountForUser(expense: Expense, userId: string): number {
  return netForUserOnExpense(expense, userId);
}
