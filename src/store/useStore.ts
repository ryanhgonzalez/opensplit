import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type {
  User,
  Group,
  Expense,
  Settlement,
  Activity,
  ExpenseAddedActivity,
  ExpenseUpdatedActivity,
  ExpenseDeletedActivity,
  PaymentActivity,
  SettledActivity,
} from '../types';
import type { ExportPayload, ImportStats } from '../lib/dataExport';
import { getShareForUser } from '../utils/expense';

// ─── Action input types ───────────────────────────────────────────────────────

export type AddExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateExpenseInput = Partial<Omit<Expense, 'id' | 'createdAt'>>;
export type CreateGroupInput = Omit<Group, 'id' | 'createdAt' | 'yourBalance' | 'totalSpent' | 'lastActivity'>;
export type UpdateGroupInput = Partial<Omit<Group, 'id' | 'createdAt'>>;
export type AddSettlementInput = Omit<Settlement, 'id' | 'createdAt'>;
export type AddUserInput = { name: string; email?: string };
export type UpdateUserInput = Partial<Pick<User, 'name' | 'email' | 'avatarColor' | 'initials'>>;

// ─── Store interface ──────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppStore {
  // ── State ──
  hasOnboarded: boolean;
  theme: ThemeMode;
  currentUserId: string;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activities: Activity[];
  /**
   * Running per-friend balance from the current user's perspective.
   * Positive → that friend owes the current user.
   * Negative → current user owes that friend.
   * Kept in sync atomically with every expense / settlement action.
   */
  friendBalances: Record<string, number>;

  // ── Theme ──
  setTheme: (theme: ThemeMode) => void;

  // ── Onboarding ──
  completeOnboarding: (name: string) => void;

  // ── User actions ──
  setCurrentUser: (userId: string) => void;

  // ── Expense actions ──
  addExpense: (input: AddExpenseInput) => Expense;
  updateExpense: (id: string, updates: UpdateExpenseInput) => void;
  deleteExpense: (id: string) => void;

  // ── Group actions ──
  createGroup: (input: CreateGroupInput) => Group;
  updateGroup: (id: string, updates: UpdateGroupInput) => void;
  deleteGroup: (id: string) => void;
  addGroupMember: (groupId: string, userId: string) => void;
  removeGroupMember: (groupId: string, userId: string) => void;

  // ── Settlement actions ──
  addSettlement: (input: AddSettlementInput) => Settlement;

  // ── User actions ──
  addUser: (input: AddUserInput) => User;
  updateUser: (id: string, updates: UpdateUserInput) => void;
  deleteUser: (id: string) => void;

  // ── Import actions ──
  restoreAllData: (payload: ExportPayload) => void;
  mergeImportData: (payload: ExportPayload) => ImportStats;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

function makeUser(name: string, index: number): User {
  const palette = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4'];
  const trimmed = name.trim();
  const initials = trimmed.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  return {
    id: uid(),
    name: trimmed,
    initials,
    avatarColor: palette[index % palette.length],
    createdAt: new Date(),
  };
}

function expenseNetForUser(expense: Expense, userId: string): number {
  const share = getShareForUser(expense, userId);
  if (share === 0) return 0;
  return expense.paidBy === userId ? expense.amount - share : -share;
}

function applyExpenseToFriendBalances(
  balances: Record<string, number>,
  expense: Expense,
  currentUserId: string,
  direction: 1 | -1,
): Record<string, number> {
  const updated = { ...balances };
  const myShare = getShareForUser(expense, currentUserId);

  if (expense.paidBy === currentUserId) {
    for (const entry of expense.split.entries) {
      if (entry.userId === currentUserId) continue;
      updated[entry.userId] = (updated[entry.userId] ?? 0) + direction * entry.amount;
    }
  } else if (myShare > 0) {
    updated[expense.paidBy] = (updated[expense.paidBy] ?? 0) - direction * myShare;
  }

  return updated;
}

function recalcAll(
  expenses: Expense[],
  settlements: Settlement[],
  groups: Group[],
  currentUserId: string,
): { friendBalances: Record<string, number>; groups: Group[] } {
  let friendBalances: Record<string, number> = {};

  for (const e of expenses) {
    friendBalances = applyExpenseToFriendBalances(friendBalances, e, currentUserId, 1);
  }

  for (const s of settlements) {
    if (s.fromUserId === currentUserId) {
      friendBalances[s.toUserId] = (friendBalances[s.toUserId] ?? 0) + s.amount;
    } else if (s.toUserId === currentUserId) {
      friendBalances[s.fromUserId] = (friendBalances[s.fromUserId] ?? 0) - s.amount;
    }
  }

  const updatedGroups = groups.map((g) => {
    const gExp = expenses.filter((e) => e.groupId === g.id);
    const gSet = settlements.filter((s) => s.groupId === g.id);

    let yourBalance = gExp.reduce((acc, e) => acc + expenseNetForUser(e, currentUserId), 0);
    for (const s of gSet) {
      if (s.fromUserId === currentUserId) yourBalance += s.amount;
      else if (s.toUserId === currentUserId) yourBalance -= s.amount;
    }

    return { ...g, yourBalance, totalSpent: gExp.reduce((acc, e) => acc + e.amount, 0) };
  });

  return { friendBalances, groups: updatedGroups };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const persistStorage = createJSONStorage(() => localStorage, {
  reviver: (_key: string, value: unknown) =>
    typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value,
});

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ── Initial state ────────────────────────────────────────────────────

        hasOnboarded: false,
        theme: 'system' as ThemeMode,
        currentUserId: '',
        users: [],
        groups: [],
        expenses: [],
        settlements: [],
        activities: [],
        friendBalances: {},

        // ── Theme ────────────────────────────────────────────────────────────

        setTheme: (theme) => set({ theme }, false, 'setTheme'),

        // ── Onboarding ───────────────────────────────────────────────────────

        completeOnboarding: (name) => {
          const user = makeUser(name, 0);
          set({ hasOnboarded: true, currentUserId: user.id, users: [user] }, false, 'completeOnboarding');
        },

        // ── User ─────────────────────────────────────────────────────────────

        setCurrentUser: (userId) =>
          set({ currentUserId: userId }, false, 'setCurrentUser'),

        // ── Expenses ─────────────────────────────────────────────────────────

        addExpense: (input) => {
          const { currentUserId, groups, expenses, activities, friendBalances } = get();
          const id = uid();
          const now = new Date();
          const expense: Expense = { ...input, id, createdAt: now, updatedAt: now };

          const activity: ExpenseAddedActivity = {
            id: uid(),
            type: 'expense_added',
            actorId: currentUserId,
            expenseId: id,
            groupId: input.groupId,
            date: now,
          };

          const netChange = expenseNetForUser(expense, currentUserId);
          const updatedGroups = groups.map((g) =>
            g.id !== input.groupId
              ? g
              : { ...g, yourBalance: g.yourBalance + netChange, totalSpent: g.totalSpent + input.amount, lastActivity: now },
          );

          set(
            {
              expenses: [...expenses, expense],
              activities: [activity, ...activities],
              groups: updatedGroups,
              friendBalances: applyExpenseToFriendBalances(friendBalances, expense, currentUserId, 1),
            },
            false,
            'addExpense',
          );

          return expense;
        },

        updateExpense: (id, updates) => {
          const { currentUserId, expenses, groups, activities, friendBalances } = get();
          const old = expenses.find((e) => e.id === id);
          if (!old) return;

          const now = new Date();
          const updated: Expense = { ...old, ...updates, id, updatedAt: now };

          const activity: ExpenseUpdatedActivity = {
            id: uid(),
            type: 'expense_updated',
            actorId: currentUserId,
            expenseId: id,
            groupId: updated.groupId,
            date: now,
          };

          const groupId = old.groupId ?? updated.groupId;
          const updatedGroups = groups.map((g) => {
            if (g.id !== groupId) return g;
            const oldNet = expenseNetForUser(old, currentUserId);
            const newNet = expenseNetForUser(updated, currentUserId);
            return {
              ...g,
              yourBalance: g.yourBalance - oldNet + newNet,
              totalSpent: g.totalSpent - old.amount + updated.amount,
              lastActivity: now,
            };
          });

          const patchedBalances = applyExpenseToFriendBalances(
            applyExpenseToFriendBalances(friendBalances, old, currentUserId, -1),
            updated,
            currentUserId,
            1,
          );

          set(
            {
              expenses: expenses.map((e) => (e.id === id ? updated : e)),
              activities: [activity, ...activities],
              groups: updatedGroups,
              friendBalances: patchedBalances,
            },
            false,
            'updateExpense',
          );
        },

        deleteExpense: (id) => {
          const { currentUserId, expenses, groups, activities, friendBalances } = get();
          const expense = expenses.find((e) => e.id === id);
          if (!expense) return;

          const now = new Date();
          const activity: ExpenseDeletedActivity = {
            id: uid(),
            type: 'expense_deleted',
            actorId: currentUserId,
            expenseDescription: expense.description,
            groupId: expense.groupId,
            date: now,
          };

          const netChange = expenseNetForUser(expense, currentUserId);
          const updatedGroups = groups.map((g) =>
            g.id !== expense.groupId
              ? g
              : { ...g, yourBalance: g.yourBalance - netChange, totalSpent: g.totalSpent - expense.amount, lastActivity: now },
          );

          set(
            {
              expenses: expenses.filter((e) => e.id !== id),
              activities: [activity, ...activities],
              groups: updatedGroups,
              friendBalances: applyExpenseToFriendBalances(friendBalances, expense, currentUserId, -1),
            },
            false,
            'deleteExpense',
          );
        },

        // ── Groups ───────────────────────────────────────────────────────────

        createGroup: (input) => {
          const now = new Date();
          const group: Group = { ...input, id: uid(), yourBalance: 0, totalSpent: 0, lastActivity: now, createdAt: now };
          set({ groups: [...get().groups, group] }, false, 'createGroup');
          return group;
        },

        updateGroup: (id, updates) =>
          set(
            { groups: get().groups.map((g) => (g.id === id ? { ...g, ...updates } : g)) },
            false,
            'updateGroup',
          ),

        deleteGroup: (id) =>
          set(
            {
              groups: get().groups.filter((g) => g.id !== id),
              expenses: get().expenses.filter((e) => e.groupId !== id),
            },
            false,
            'deleteGroup',
          ),

        addGroupMember: (groupId, userId) =>
          set(
            {
              groups: get().groups.map((g) => {
                if (g.id !== groupId || g.members.some((m) => m.userId === userId)) return g;
                return { ...g, members: [...g.members, { userId, role: 'member', joinedAt: new Date() }] };
              }),
            },
            false,
            'addGroupMember',
          ),

        removeGroupMember: (groupId, userId) =>
          set(
            {
              groups: get().groups.map((g) =>
                g.id === groupId ? { ...g, members: g.members.filter((m) => m.userId !== userId) } : g,
              ),
            },
            false,
            'removeGroupMember',
          ),

        // ── Settlements ──────────────────────────────────────────────────────

        addSettlement: (input) => {
          const { currentUserId, settlements, groups, activities, friendBalances } = get();
          const id = uid();
          const now = new Date();
          const settlement: Settlement = { ...input, id, createdAt: now };

          const currentBalance = friendBalances[input.fromUserId === currentUserId ? input.toUserId : input.fromUserId] ?? 0;
          const remainingAfter = Math.abs(currentBalance) - input.amount;
          const activityType: 'payment' | 'settled' = remainingAfter <= 0.005 ? 'settled' : 'payment';

          const activity: PaymentActivity | SettledActivity = {
            id: uid(),
            type: activityType,
            actorId: input.fromUserId,
            settlementId: id,
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            amount: input.amount,
            groupId: input.groupId,
            date: now,
          };

          const balanceDelta =
            input.toUserId === currentUserId
              ? -input.amount
              : input.fromUserId === currentUserId
                ? input.amount
                : 0;

          const updatedGroups = groups.map((g) =>
            g.id !== input.groupId
              ? g
              : { ...g, yourBalance: g.yourBalance + balanceDelta, lastActivity: now },
          );

          const updatedBalances = { ...friendBalances };
          if (input.fromUserId === currentUserId) {
            updatedBalances[input.toUserId] = (updatedBalances[input.toUserId] ?? 0) + input.amount;
          } else if (input.toUserId === currentUserId) {
            updatedBalances[input.fromUserId] = (updatedBalances[input.fromUserId] ?? 0) - input.amount;
          }

          set(
            {
              settlements: [...settlements, settlement],
              activities: [activity, ...activities],
              groups: updatedGroups,
              friendBalances: updatedBalances,
            },
            false,
            'addSettlement',
          );

          return settlement;
        },

        // ── Users ────────────────────────────────────────────────────────────

        addUser: ({ name, email }) => {
          const user = { ...makeUser(name, get().users.length), email };
          set({ users: [...get().users, user] }, false, 'addUser');
          return user;
        },

        updateUser: (id, updates) =>
          set(
            { users: get().users.map((u) => (u.id === id ? { ...u, ...updates } : u)) },
            false,
            'updateUser',
          ),

        deleteUser: (id) => {
          const { currentUserId, users, groups, expenses, settlements, activities } = get();
          if (id === currentUserId) return;

          const purgeIds = new Set(
            expenses
              .filter((e) => e.paidBy === id || e.split.entries.some((en) => en.userId === id))
              .map((e) => e.id),
          );
          const remaining = expenses.filter((e) => !purgeIds.has(e.id));

          const updatedGroups = groups.map((g) => {
            const gExp = remaining.filter((e) => e.groupId === g.id);
            return {
              ...g,
              members: g.members.filter((m) => m.userId !== id),
              yourBalance: gExp.reduce((s, e) => s + expenseNetForUser(e, currentUserId), 0),
              totalSpent: gExp.reduce((s, e) => s + e.amount, 0),
            };
          });

          let newBalances: Record<string, number> = {};
          for (const e of remaining) {
            newBalances = applyExpenseToFriendBalances(newBalances, e, currentUserId, 1);
          }

          set(
            {
              users: users.filter((u) => u.id !== id),
              expenses: remaining,
              groups: updatedGroups,
              settlements: settlements.filter((s) => s.fromUserId !== id && s.toUserId !== id),
              activities: activities.filter((a) => a.actorId !== id),
              friendBalances: newBalances,
            },
            false,
            'deleteUser',
          );
        },

        // ── Import ───────────────────────────────────────────────────────────

        restoreAllData: (payload) => {
          const { currentUserId, users, groups, expenses, settlements, activities } = payload;
          const { friendBalances, groups: updatedGroups } = recalcAll(expenses, settlements, groups, currentUserId);
          set(
            { hasOnboarded: true, currentUserId, users, groups: updatedGroups, expenses, settlements, activities, friendBalances },
            false,
            'restoreAllData',
          );
        },

        mergeImportData: (payload) => {
          const state = get();
          const existingUserIds    = new Set(state.users.map((u) => u.id));
          const existingGroupIds   = new Set(state.groups.map((g) => g.id));
          const existingExpIds     = new Set(state.expenses.map((e) => e.id));
          const existingSetIds     = new Set(state.settlements.map((s) => s.id));
          const existingActIds     = new Set(state.activities.map((a) => a.id));

          const newUsers       = payload.users.filter((u) => !existingUserIds.has(u.id));
          const newGroups      = payload.groups.filter((g) => !existingGroupIds.has(g.id));
          const newExpenses    = payload.expenses.filter((e) => !existingExpIds.has(e.id));
          const newSettlements = payload.settlements.filter((s) => !existingSetIds.has(s.id));
          const newActivities  = payload.activities.filter((a) => !existingActIds.has(a.id));

          const allExpenses    = [...state.expenses, ...newExpenses];
          const allSettlements = [...state.settlements, ...newSettlements];
          const allGroups      = [...state.groups, ...newGroups];

          const { friendBalances, groups: updatedGroups } = recalcAll(
            allExpenses, allSettlements, allGroups, state.currentUserId,
          );

          set(
            {
              users:       [...state.users, ...newUsers],
              groups:      updatedGroups,
              expenses:    allExpenses,
              settlements: allSettlements,
              activities:  [...state.activities, ...newActivities],
              friendBalances,
            },
            false,
            'mergeImportData',
          );

          return {
            usersAdded:       newUsers.length,
            groupsAdded:      newGroups.length,
            expensesAdded:    newExpenses.length,
            settlementsAdded: newSettlements.length,
          };
        },
      }),
      {
        name: 'splitify-v2',
        storage: persistStorage,
        partialize: (state) => ({
          hasOnboarded:   state.hasOnboarded,
          theme:          state.theme,
          currentUserId:  state.currentUserId,
          users:          state.users,
          groups:         state.groups,
          expenses:       state.expenses,
          settlements:    state.settlements,
          activities:     state.activities,
          friendBalances: state.friendBalances,
        }),
      },
    ),
    { name: 'splitwise-store' },
  ),
);
