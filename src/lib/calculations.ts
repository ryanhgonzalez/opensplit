/**
 * Pure calculation functions for expense splitting and settlement.
 * No React, Zustand, or UI dependencies — safe to test in isolation.
 */

import type { Expense, ExpenseSplit, SplitEntry, SplitType } from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

/** userId → net balance. Positive = owed to this user; negative = this user owes. */
export type BalanceMap = Record<string, number>;

/** A single payment required to zero out a debt. */
export interface SettlementTransaction {
  from: string; // userId paying
  to: string;   // userId receiving
  amount: number;
}

/** Minimal input for group-level calculations. */
export interface GroupSnapshot {
  expenses: Expense[];
  memberIds: string[];
}

// ─── Currency arithmetic ──────────────────────────────────────────────────────

/** Round to the nearest cent. Use this for every balance mutation to prevent float drift. */
export function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// Sub-cent amounts are treated as zero throughout all calculations.
const EPSILON = 0.005;

// ─── Split builders ───────────────────────────────────────────────────────────

/**
 * Divide `amount` evenly across participants.
 * Leftover cents (from floor division) are distributed one-cent-at-a-time starting
 * from the first participant, so the split always sums exactly to `amount`.
 */
export function splitEvenly(amount: number, participantIds: string[]): SplitEntry[] {
  const n = participantIds.length;
  if (n === 0) return [];
  const base = Math.floor((amount / n) * 100) / 100;
  const leftoverCents = Math.round((amount - base * n) * 100);
  return participantIds.map((userId, i) => ({
    userId,
    amount: i < leftoverCents ? round(base + 0.01) : base,
  }));
}

/**
 * Divide `amount` by percentage. `percentages` must sum to 100.
 * Leftover cents are given to the participant with the largest allocation.
 */
export function splitByPercentage(
  amount: number,
  percentages: Array<{ userId: string; pct: number }>,
): SplitEntry[] {
  const raw = percentages.map(({ userId, pct }) => ({
    userId,
    amount: Math.floor((amount * pct) / 100 * 100) / 100,
  }));
  const distributed = raw.reduce((s, e) => s + e.amount, 0);
  const remainder = Math.round((amount - distributed) * 100);
  if (remainder !== 0) {
    const maxIdx = raw.reduce((best, e, i) => (e.amount > raw[best].amount ? i : best), 0);
    raw[maxIdx].amount = round(raw[maxIdx].amount + remainder * 0.01);
  }
  return raw;
}

/**
 * Divide `amount` by relative share weights.
 * e.g. shares [1, 2, 1] on $40 → [$10, $20, $10].
 */
export function splitByShares(
  amount: number,
  shares: Array<{ userId: string; shares: number }>,
): SplitEntry[] {
  const total = shares.reduce((s, e) => s + e.shares, 0);
  if (total === 0) return shares.map(({ userId }) => ({ userId, amount: 0 }));
  const pcts = shares.map(({ userId, shares: s }) => ({ userId, pct: (s / total) * 100 }));
  return splitByPercentage(amount, pcts);
}

/**
 * Build a complete `ExpenseSplit` object ready to attach to an `Expense`.
 * Handles all four split types.
 */
export function buildSplit(
  amount: number,
  type: SplitType,
  participants: Array<{ userId: string; value?: number }>,
): ExpenseSplit {
  let entries: SplitEntry[];

  switch (type) {
    case 'equal':
      entries = splitEvenly(amount, participants.map((p) => p.userId));
      break;
    case 'exact':
      entries = participants.map(({ userId, value = 0 }) => ({ userId, amount: round(value) }));
      break;
    case 'percentage':
      entries = splitByPercentage(
        amount,
        participants.map(({ userId, value = 0 }) => ({ userId, pct: value })),
      );
      break;
    case 'shares':
      entries = splitByShares(
        amount,
        participants.map(({ userId, value = 1 }) => ({ userId, shares: value })),
      );
      break;
  }

  return { type, entries };
}

/** One receipt line item and the members sharing it. */
export interface ItemAssignment {
  price: number;
  assigned: string[]; // userIds sharing this item
}

/**
 * Itemized split: each item is divided equally among its assignees, then any
 * remaining tax/tip (`total − itemsSum`) is distributed proportionally to each
 * member's item subtotal. Returns exact per-member entries that sum to `total`.
 *
 * @example
 * // Latte $4.50 (A), Croissant $3.25 (B), Sandwich $8.75 (A+B); total $17.99
 * splitByItems(17.99, 16.50, items, ['A','B']) // → [{A, 9.68}, {B, 8.31}]
 */
export function splitByItems(
  total: number,
  itemsSum: number,
  items: ItemAssignment[],
  memberIds: string[],
): SplitEntry[] {
  const per: Record<string, number> = {};
  for (const id of memberIds) per[id] = 0;

  for (const it of items) {
    const who = it.assigned.filter((id) => memberIds.includes(id));
    if (it.price <= 0 || who.length === 0) continue;
    const share = it.price / who.length;
    for (const id of who) per[id] += share;
  }

  const extra = total - itemsSum; // tax + tip (or discount, if negative)
  if (itemsSum > 0 && Math.abs(extra) > EPSILON) {
    for (const id of memberIds) per[id] += extra * (per[id] / itemsSum);
  }

  const entries = memberIds
    .map((id) => ({ userId: id, amount: round(per[id]) }))
    .filter((e) => e.amount > 0);

  // Correct any rounding drift so entries sum exactly to `total`.
  const sum = round(entries.reduce((s, e) => s + e.amount, 0));
  const diff = round(total - sum);
  if (Math.abs(diff) >= 0.01 && entries.length > 0) {
    const idx = entries.reduce((best, e, i) => (e.amount > entries[best].amount ? i : best), 0);
    entries[idx] = { ...entries[idx], amount: round(entries[idx].amount + diff) };
  }

  return entries;
}

// ─── Split validation ─────────────────────────────────────────────────────────

/** Returns true when the split entries sum to within one cent of the expense amount. */
export function validateSplit(expense: Expense): boolean {
  const total = expense.split.entries.reduce((s, e) => s + e.amount, 0);
  return Math.abs(total - expense.amount) < 0.01;
}

// ─── Per-expense net ──────────────────────────────────────────────────────────

/**
 * Net amount for `userId` from a single expense.
 * Positive → others owe this user. Negative → this user owes the payer.
 */
export function netForUserOnExpense(expense: Expense, userId: string): number {
  const share = expense.split.entries.find((e) => e.userId === userId)?.amount ?? 0;
  if (share === 0) return 0;
  if (expense.paidBy === userId) return round(expense.amount - share);
  return -share;
}

/** Net amount for `userId` summed across multiple expenses. */
export function netForUser(expenses: Expense[], userId: string): number {
  return round(expenses.reduce((sum, e) => sum + netForUserOnExpense(e, userId), 0));
}

// ─── Core: calculateBalances ──────────────────────────────────────────────────

/**
 * Returns each member's net balance within a group.
 *
 * Algorithm: for each expense, the payer is credited the amount they fronted for
 * others (total paid − their own share), and each non-paying participant is
 * debited their share.
 *
 * The sum of all balances is always 0.
 *
 * @example
 * // $90 dinner, Alice paid, split evenly with Bob & Charlie
 * calculateBalances({ expenses, memberIds: ['alice', 'bob', 'charlie'] })
 * // → { alice: 60, bob: -30, charlie: -30 }
 */
export function calculateBalances({ expenses, memberIds }: GroupSnapshot): BalanceMap {
  const balances: BalanceMap = {};
  for (const id of memberIds) balances[id] = 0;

  for (const expense of expenses) {
    const payerShare =
      expense.split.entries.find((e) => e.userId === expense.paidBy)?.amount ?? 0;

    // Credit payer for what they fronted on behalf of everyone else.
    balances[expense.paidBy] = round(
      (balances[expense.paidBy] ?? 0) + expense.amount - payerShare,
    );

    // Debit each non-paying participant their share.
    for (const entry of expense.split.entries) {
      if (entry.userId !== expense.paidBy) {
        balances[entry.userId] = round((balances[entry.userId] ?? 0) - entry.amount);
      }
    }
  }

  return balances;
}

// ─── Core: calculateSettlements ───────────────────────────────────────────────

/**
 * Returns the minimum set of transactions required to fully settle a group.
 *
 * Delegates to `settleBalances` — exposed separately so callers who already have
 * a `BalanceMap` can skip recomputing it.
 *
 * @example
 * calculateSettlements({ expenses, memberIds: ['alice', 'bob', 'charlie'] })
 * // → [{ from: 'bob', to: 'alice', amount: 30 }, { from: 'charlie', to: 'alice', amount: 30 }]
 */
export function calculateSettlements(snapshot: GroupSnapshot): SettlementTransaction[] {
  return settleBalances(calculateBalances(snapshot));
}

/**
 * Given a `BalanceMap`, returns the minimum number of transactions to zero everything out.
 *
 * Algorithm: greedy matching — repeatedly pair the largest creditor with the
 * largest debtor, transferring the lesser of the two amounts. This produces an
 * optimal (or near-optimal) transaction count in O(n log n).
 */
export function settleBalances(balances: BalanceMap): SettlementTransaction[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > EPSILON)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -EPSILON)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const transactions: SettlementTransaction[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = round(Math.min(creditor.amount, debtor.amount));

    if (amount > 0) {
      transactions.push({ from: debtor.userId, to: creditor.userId, amount });
    }

    creditor.amount = round(creditor.amount - amount);
    debtor.amount = round(debtor.amount - amount);

    if (creditor.amount <= EPSILON) ci++;
    if (debtor.amount <= EPSILON) di++;
  }

  return transactions;
}
