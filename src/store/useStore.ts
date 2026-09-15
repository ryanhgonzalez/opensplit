import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type {
  User,
  Group,
  Expense,
  Settlement,
  Activity,
  PaymentMethod,
  ExpenseAddedActivity,
  ExpenseUpdatedActivity,
  ExpenseDeletedActivity,
  PaymentActivity,
  SettledActivity,
  Tombstone,
} from '../types';
import type { ExportPayload, ImportStats, AliasAddition, MergeChange, MergeFieldChange } from '../lib/dataExport';
import { round, outstandingByGroup, allocatePayment } from '../lib/calculations';

// ─── Action input types ───────────────────────────────────────────────────────

export type AddExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateExpenseInput = Partial<Omit<Expense, 'id' | 'createdAt'>>;
export type CreateGroupInput = Omit<Group, 'id' | 'createdAt' | 'lastActivity'>;
export type UpdateGroupInput = Partial<Omit<Group, 'id' | 'createdAt'>>;
export type AddSettlementInput = Omit<Settlement, 'id' | 'createdAt'>;
export type AddUserInput = { name: string; email?: string };
export type UpdateUserInput = Partial<Pick<User, 'name' | 'email' | 'avatarColor' | 'initials'>>;

/** A payment that is not tied to one group — the app decides which groups it pays down. */
export type SettleWithUserInput = {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: Date;
  paymentMethod?: PaymentMethod;
  note?: string;
};

// ─── Store interface ──────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppStore {
  // ── State ──
  //
  // Only raw records live here. Every balance the UI shows — per-friend, per-group,
  // overall — is derived from these by `deriveTotals` behind memoized selectors.
  // Storing them alongside was the source of a string of drift bugs: each action
  // had to patch every total correctly and in both directions, and a single missed
  // term left the numbers permanently wrong with nothing to detect it.
  hasOnboarded: boolean;
  theme: ThemeMode;
  currentUserId: string;
  /**
   * True when the data on hand came from somebody else's export and the person
   * using the app has not yet said which of the imported people they are.
   * While set, the app shows the identity picker instead of the main shell —
   * otherwise the importer would silently be acting as the exporter.
   */
  needsIdentity: boolean;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activities: Activity[];
  /** Records deleted here, kept so the deletion can travel through shared files. */
  tombstones: Tombstone[];

  // ── Backup tracking ──
  /** When a full backup was last exported; null if never. */
  lastBackupAt: Date | null;
  /** Edits made since that backup. Drives the reminder on the dashboard. */
  changesSinceBackup: number;
  /** The reminder stays hidden until this passes. */
  backupSnoozedUntil: Date | null;
  /** groupId → when its file was last shared or saved from this device. */
  groupSharedAt: Record<string, Date>;

  // ── Theme ──
  setTheme: (theme: ThemeMode) => void;

  // ── Onboarding ──
  completeOnboarding: (name: string) => void;

  // ── User actions ──
  /** Switches whose perspective the whole app is rendered from. */
  setCurrentUser: (userId: string) => void;
  /** Adds a person and immediately becomes them — used when the importer isn't in the file. */
  claimIdentityAsNewUser: (name: string) => User;

  // ── Expense actions ──
  addExpense: (input: AddExpenseInput) => Expense;
  updateExpense: (id: string, updates: UpdateExpenseInput) => void;
  /** Removes an expense and returns what an undo needs, or undefined if it did not exist. */
  deleteExpense: (id: string) => ExpenseDeletion | undefined;
  /** Puts a just-deleted expense back exactly as it was. */
  restoreDeletedExpense: (deletion: ExpenseDeletion) => void;

  // ── Group actions ──
  createGroup: (input: CreateGroupInput) => Group;
  updateGroup: (id: string, updates: UpdateGroupInput) => void;
  deleteGroup: (id: string) => void;
  addGroupMember: (groupId: string, userId: string) => void;
  removeGroupMember: (groupId: string, userId: string) => void;

  // ── Settlement actions ──
  /** Records a payment against one specific group. */
  addSettlement: (input: AddSettlementInput) => Settlement;
  /**
   * Records a payment against the running total with someone, spreading it
   * across the groups the debt actually sits in.
   */
  settleWithUser: (input: SettleWithUserInput) => Settlement[];
  deleteSettlement: (id: string) => void;

  // ── User actions ──
  addUser: (input: AddUserInput) => User;
  updateUser: (id: string, updates: UpdateUserInput) => void;
  deleteUser: (id: string) => void;

  // ── Import actions ──
  restoreAllData: (payload: ExportPayload) => void;
  mergeImportData: (payload: ExportPayload, aliasAdditions?: AliasAddition[]) => ImportStats;

  // ── Backups & sharing ──
  /** A full backup was just exported: reset the reminder. */
  markBackedUp: () => void;
  /** Hide the backup reminder for a while. */
  snoozeBackupReminder: (days: number) => void;
  /** This group's file was just shared or saved from here. */
  markGroupShared: (groupId: string) => void;

  // ── Danger zone ──
  wipeAllData: () => void;
}

/** Everything needed to undo a `deleteExpense`. */
export interface ExpenseDeletion {
  expense: Expense;
  /** The add/update feed entries that were dropped with it. */
  removedActivities: Activity[];
  /** The "deleted" feed entry the deletion wrote. */
  deletionActivityId: string;
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

/** Sub-cent remainders are treated as fully paid. */
const EPSILON = 0.005;

/**
 * Whether `fromUserId` still owes `toUserId` anything once `settlements` are
 * applied — scoped to one group when `groupId` is given, otherwise across
 * everything. Decides whether a payment reads as "paid" or "settled up".
 */
function debtCleared(
  expenses: Expense[],
  settlements: Settlement[],
  fromUserId: string,
  toUserId: string,
  groupId?: string,
): boolean {
  const buckets = outstandingByGroup(expenses, settlements, fromUserId, toUserId);
  const inScope = groupId ? buckets.filter((b) => b.groupId === groupId) : buckets;
  return inScope.reduce((sum, b) => sum + b.outstanding, 0) <= EPSILON;
}

function touchGroups(groups: Group[], groupIds: Set<string>, when: Date): Group[] {
  return groups.map((g) => (groupIds.has(g.id) ? { ...g, lastActivity: when } : g));
}

/**
 * The fields on which two copies of one expense disagree, worded for the
 * import summary. Empty when they are the same expense in every way that counts.
 */
function diffExpenses(ours: Expense, theirs: Expense, nameOf: (id: string) => string): MergeFieldChange[] {
  const out: MergeFieldChange[] = [];
  const money = (n: number) => `$${n.toFixed(2)}`;
  const day = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const splitText = (e: Expense) =>
    [...e.split.entries]
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .map((en) => `${nameOf(en.userId)} ${money(en.amount)}`)
      .join(', ');

  if (ours.description !== theirs.description) out.push({ field: 'Description', ours: ours.description, theirs: theirs.description });
  if (Math.abs(ours.amount - theirs.amount) >= 0.005) out.push({ field: 'Amount', ours: money(ours.amount), theirs: money(theirs.amount) });
  if (ours.paidBy !== theirs.paidBy) out.push({ field: 'Paid by', ours: nameOf(ours.paidBy), theirs: nameOf(theirs.paidBy) });
  if (ours.date.getTime() !== theirs.date.getTime()) out.push({ field: 'Date', ours: day(ours.date), theirs: day(theirs.date) });
  if (ours.category !== theirs.category) out.push({ field: 'Category', ours: ours.category, theirs: theirs.category });
  if (ours.groupId !== theirs.groupId) out.push({ field: 'Group', ours: ours.groupId ?? '—', theirs: theirs.groupId ?? '—' });
  if ((ours.notes ?? '') !== (theirs.notes ?? '')) out.push({ field: 'Notes', ours: ours.notes ?? '—', theirs: theirs.notes ?? '—' });
  const oursSplit = splitText(ours);
  const theirsSplit = splitText(theirs);
  if (oursSplit !== theirsSplit) out.push({ field: 'Split', ours: oursSplit, theirs: theirsSplit });
  return out;
}

/**
 * Re-attributes payments that were recorded against no group at all.
 *
 * Settle Up used to write these, which moved the overall balance while leaving
 * every group balance untouched — so the group balances no longer summed to the
 * net and no amount of settling could bring them back in line. Replayed in date
 * order so each payment is allocated against what was actually outstanding when
 * it was made.
 */
function attributeLooseSettlements(expenses: Expense[], settlements: Settlement[]): Settlement[] {
  const attributed = settlements.filter((s) => s.groupId);
  const loose = settlements
    .filter((s) => !s.groupId)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const payment of loose) {
    const buckets = outstandingByGroup(expenses, attributed, payment.fromUserId, payment.toUserId);
    const allocations = allocatePayment(payment.amount, buckets);

    // Nothing to attribute it to (the debt was never group-based) — keep as-is.
    if (allocations.length === 0) {
      attributed.push(payment);
      continue;
    }

    // The first slice keeps the original ID so the activity feed entry that
    // references this payment still resolves.
    attributed.push(
      ...allocations.map((allocation, i) => ({
        ...payment,
        id: i === 0 ? payment.id : uid(),
        groupId: allocation.groupId,
        amount: allocation.amount,
      })),
    );
  }

  return attributed;
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
        needsIdentity: false,
        users: [],
        groups: [],
        expenses: [],
        settlements: [],
        activities: [],
        tombstones: [],
        lastBackupAt: null,
        changesSinceBackup: 0,
        backupSnoozedUntil: null,
        groupSharedAt: {},

        // ── Theme ────────────────────────────────────────────────────────────

        setTheme: (theme) => set({ theme }, false, 'setTheme'),

        // ── Onboarding ───────────────────────────────────────────────────────

        completeOnboarding: (name) => {
          const user = makeUser(name, 0);
          set(
            { hasOnboarded: true, needsIdentity: false, currentUserId: user.id, users: [user] },
            false,
            'completeOnboarding',
          );
        },

        // ── User ─────────────────────────────────────────────────────────────

        setCurrentUser: (userId) => {
          if (!get().users.some((u) => u.id === userId)) return;
          // Balances are derived from the current user, so switching identity
          // needs nothing but the ID — every total re-reads on the next render.
          set({ currentUserId: userId, needsIdentity: false }, false, 'setCurrentUser');
        },

        claimIdentityAsNewUser: (name) => {
          const { users } = get();
          const user = makeUser(name, users.length);
          set(
            { users: [...users, user], currentUserId: user.id, needsIdentity: false },
            false,
            'claimIdentityAsNewUser',
          );
          return user;
        },

        // ── Expenses ─────────────────────────────────────────────────────────

        addExpense: (input) => {
          const { currentUserId, groups, expenses, activities } = get();
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

          set(
            {
              expenses: [...expenses, expense],
              activities: [activity, ...activities],
              groups: input.groupId ? touchGroups(groups, new Set([input.groupId]), now) : groups,
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'addExpense',
          );

          return expense;
        },

        updateExpense: (id, updates) => {
          const { currentUserId, expenses, groups, activities } = get();
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

          // An expense can be moved between groups, so both ends need touching.
          const touched = new Set([old.groupId, updated.groupId].filter(Boolean) as string[]);

          set(
            {
              expenses: expenses.map((e) => (e.id === id ? updated : e)),
              activities: [activity, ...activities],
              groups: touchGroups(groups, touched, now),
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'updateExpense',
          );
        },

        deleteExpense: (id) => {
          const { currentUserId, expenses, groups, activities, tombstones } = get();
          const expense = expenses.find((e) => e.id === id);
          if (!expense) return undefined;

          const now = new Date();
          const activity: ExpenseDeletedActivity = {
            id: uid(),
            type: 'expense_deleted',
            actorId: currentUserId,
            expenseDescription: expense.description,
            expenseId: id,
            groupId: expense.groupId,
            date: now,
          };

          // The add/update entries point at an expense that no longer exists;
          // the deletion entry it leaves behind is the record of what happened.
          const removedActivities = activities.filter(
            (a) => (a.type === 'expense_added' || a.type === 'expense_updated') && a.expenseId === id,
          );
          const removedIds = new Set(removedActivities.map((a) => a.id));

          set(
            {
              expenses: expenses.filter((e) => e.id !== id),
              activities: [activity, ...activities.filter((a) => !removedIds.has(a.id))],
              groups: expense.groupId ? touchGroups(groups, new Set([expense.groupId]), now) : groups,
              tombstones: [
                ...tombstones.filter((t) => !(t.kind === 'expense' && t.id === id)),
                { id, kind: 'expense', groupId: expense.groupId, deletedAt: now },
              ],
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'deleteExpense',
          );

          return { expense, removedActivities, deletionActivityId: activity.id };
        },

        restoreDeletedExpense: ({ expense, removedActivities, deletionActivityId }) => {
          const { expenses, activities, tombstones } = get();
          if (expenses.some((e) => e.id === expense.id)) return;
          set(
            {
              expenses: [...expenses, expense],
              // Order does not matter here: the feed sorts by date on read.
              activities: [...removedActivities, ...activities.filter((a) => a.id !== deletionActivityId)],
              tombstones: tombstones.filter((t) => !(t.kind === 'expense' && t.id === expense.id)),
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'restoreDeletedExpense',
          );
        },

        // ── Groups ───────────────────────────────────────────────────────────

        createGroup: (input) => {
          const now = new Date();
          const group: Group = { ...input, id: uid(), lastActivity: now, createdAt: now };
          set({ groups: [...get().groups, group], changesSinceBackup: get().changesSinceBackup + 1 }, false, 'createGroup');
          return group;
        },

        updateGroup: (id, updates) =>
          set(
            { groups: get().groups.map((g) => (g.id === id ? { ...g, ...updates } : g)), changesSinceBackup: get().changesSinceBackup + 1 },
            false,
            'updateGroup',
          ),

        deleteGroup: (id) => {
          const { groups, expenses, settlements, activities, tombstones, groupSharedAt } = get();
          if (!groups.some((g) => g.id === id)) return;
          const rest = { ...groupSharedAt };
          delete rest[id];
          set(
            {
              groups: groups.filter((g) => g.id !== id),
              expenses: expenses.filter((e) => e.groupId !== id),
              settlements: settlements.filter((s) => s.groupId !== id),
              activities: activities.filter((a) => a.groupId !== id),
              // One tombstone for the group covers everything inside it.
              tombstones: [
                ...tombstones.filter((t) => t.groupId !== id && !(t.kind === 'group' && t.id === id)),
                { id, kind: 'group', groupId: id, deletedAt: new Date() },
              ],
              groupSharedAt: rest,
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'deleteGroup',
          );
        },

        addGroupMember: (groupId, userId) =>
          set(
            {
              groups: get().groups.map((g) => {
                if (g.id !== groupId || g.members.some((m) => m.userId === userId)) return g;
                return { ...g, members: [...g.members, { userId, role: 'member', joinedAt: new Date() }] };
              }),
              changesSinceBackup: get().changesSinceBackup + 1,
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
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'removeGroupMember',
          ),

        // ── Settlements ──────────────────────────────────────────────────────

        addSettlement: (input) => {
          const { settlements, groups, expenses, activities } = get();
          const now = new Date();
          const settlement: Settlement = { ...input, amount: round(input.amount), id: uid(), createdAt: now };
          const nextSettlements = [...settlements, settlement];

          const cleared = debtCleared(
            expenses,
            nextSettlements,
            settlement.fromUserId,
            settlement.toUserId,
            settlement.groupId,
          );

          const activity: PaymentActivity | SettledActivity = {
            id: uid(),
            type: cleared ? 'settled' : 'payment',
            actorId: settlement.fromUserId,
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            toUserId: settlement.toUserId,
            amount: settlement.amount,
            groupId: settlement.groupId,
            date: now,
          };

          set(
            {
              settlements: nextSettlements,
              activities: [activity, ...activities],
              groups: settlement.groupId
                ? touchGroups(groups, new Set([settlement.groupId]), now)
                : groups,
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'addSettlement',
          );

          return settlement;
        },

        /**
         * Splits one payment across the groups the debt sits in, proportional to
         * what is outstanding in each, and records a settlement per slice.
         *
         * Settle Up works on the running total with a person rather than on one
         * group, but a payment attributed to no group moves only the overall
         * balance — leaving the group balances stranded above it forever. Paying
         * each group down in proportion keeps the two consistent.
         */
        settleWithUser: (input) => {
          const { settlements, groups, expenses, activities } = get();
          const now = new Date();

          const buckets = outstandingByGroup(expenses, settlements, input.fromUserId, input.toUserId);
          const allocations = allocatePayment(input.amount, buckets);
          if (allocations.length === 0) return [];

          const created: Settlement[] = allocations.map((allocation) => ({
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            amount: allocation.amount,
            currency: input.currency,
            groupId: allocation.groupId,
            date: input.date,
            paymentMethod: input.paymentMethod,
            note: input.note,
            id: uid(),
            createdAt: now,
          }));

          const nextSettlements = [...settlements, ...created];
          const clearedOverall = debtCleared(
            expenses,
            nextSettlements,
            input.fromUserId,
            input.toUserId,
          );

          // One feed entry per slice, each tagged with its group so the feed
          // stays readable. Only the last carries "settled up", so a payment
          // that clears the balance says so exactly once.
          const newActivities: Array<PaymentActivity | SettledActivity> = created.map((settlement, i) => ({
            id: uid(),
            type: clearedOverall && i === created.length - 1 ? 'settled' : 'payment',
            actorId: settlement.fromUserId,
            settlementId: settlement.id,
            fromUserId: settlement.fromUserId,
            toUserId: settlement.toUserId,
            amount: settlement.amount,
            groupId: settlement.groupId,
            date: now,
          }));

          const touched = new Set(created.map((s) => s.groupId).filter(Boolean) as string[]);

          set(
            {
              settlements: nextSettlements,
              activities: [...newActivities.reverse(), ...activities],
              groups: touchGroups(groups, touched, now),
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'settleWithUser',
          );

          return created;
        },

        /** Undo a payment that was marked complete — balances rewind to before it. */
        deleteSettlement: (id) => {
          const { settlements, activities, tombstones } = get();
          const settlement = settlements.find((s) => s.id === id);
          if (!settlement) return;

          set(
            {
              settlements: settlements.filter((s) => s.id !== id),
              // Drop the payment / settled entry this settlement produced.
              activities: activities.filter(
                (a) => !((a.type === 'payment' || a.type === 'settled') && a.settlementId === id),
              ),
              tombstones: [
                ...tombstones.filter((t) => !(t.kind === 'settlement' && t.id === id)),
                { id, kind: 'settlement', groupId: settlement.groupId, deletedAt: new Date() },
              ],
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'deleteSettlement',
          );
        },

        // ── Users ────────────────────────────────────────────────────────────

        addUser: ({ name, email }) => {
          const user = { ...makeUser(name, get().users.length), email };
          set({ users: [...get().users, user], changesSinceBackup: get().changesSinceBackup + 1 }, false, 'addUser');
          return user;
        },

        updateUser: (id, updates) =>
          set(
            { users: get().users.map((u) => (u.id === id ? { ...u, ...updates } : u)), changesSinceBackup: get().changesSinceBackup + 1 },
            false,
            'updateUser',
          ),

        deleteUser: (id) => {
          const { currentUserId, users, groups, expenses, settlements, activities } = get();
          if (id === currentUserId) return;

          const purgedExpenseIds = new Set(
            expenses
              .filter((e) => e.paidBy === id || e.split.entries.some((en) => en.userId === id))
              .map((e) => e.id),
          );

          // Drop every activity that points at the removed person or at an expense
          // that went with them. The feed already skips rows whose actor is gone,
          // so leaving them behind only inflates the event count with entries that
          // never render — and payment rows name the other party, who may be gone.
          const remainingActivities = activities.filter((a) => {
            if (a.actorId === id) return false;
            if (a.type === 'payment' || a.type === 'settled') {
              return a.fromUserId !== id && a.toUserId !== id;
            }
            if (a.type === 'expense_added' || a.type === 'expense_updated') {
              return !purgedExpenseIds.has(a.expenseId);
            }
            return true;
          });

          const now = new Date();
          const purgedSettlements = settlements.filter((s) => s.fromUserId === id || s.toUserId === id);
          const newTombstones: Tombstone[] = [
            ...expenses
              .filter((e) => purgedExpenseIds.has(e.id))
              .map((e): Tombstone => ({ id: e.id, kind: 'expense', groupId: e.groupId, deletedAt: now })),
            ...purgedSettlements.map((s): Tombstone => ({ id: s.id, kind: 'settlement', groupId: s.groupId, deletedAt: now })),
          ];

          set(
            {
              users: users.filter((u) => u.id !== id),
              expenses: expenses.filter((e) => !purgedExpenseIds.has(e.id)),
              settlements: settlements.filter((s) => s.fromUserId !== id && s.toUserId !== id),
              groups: groups.map((g) => ({
                ...g,
                members: g.members.filter((m) => m.userId !== id),
              })),
              activities: remainingActivities,
              tombstones: [...get().tombstones, ...newTombstones],
              changesSinceBackup: get().changesSinceBackup + 1,
            },
            false,
            'deleteUser',
          );
        },

        // ── Import ───────────────────────────────────────────────────────────

        restoreAllData: (payload) => {
          const { currentUserId, users, groups, expenses, settlements, activities } = payload;
          set(
            {
              hasOnboarded: true,
              // The file carries its author's identity. If more than one person
              // is in it we can't know whether this is the author restoring a
              // backup or someone they shared it with, so ask before letting
              // the app render from the author's perspective.
              needsIdentity: users.length > 1,
              currentUserId,
              users,
              groups,
              expenses,
              settlements,
              activities,
              tombstones: payload.tombstones ?? [],
              // The data on hand now matches a file that exists, which is what a backup is.
              lastBackupAt: new Date(),
              changesSinceBackup: 0,
              backupSnoozedUntil: null,
              groupSharedAt: {},
            },
            false,
            'restoreAllData',
          );
        },

        /**
         * Folds a file into the local data. This is how contributions from a
         * shared group come back: the same group, edited on another device.
         *
         * - New records are added.
         * - An expense that exists on both sides keeps whichever copy was
         *   edited last (`updatedAt`), so a fix made by a friend replaces the
         *   stale original rather than being dropped.
         * - A group that exists on both sides keeps its local look but gains
         *   any members the file added.
         * - Settlements and activities are append-only records; duplicates by
         *   ID are skipped.
         *
         * Deletions cannot travel through a file — an expense removed on one
         * device is simply absent from the file, which is indistinguishable
         * from one that was never shared — so nothing here removes anything.
         */
        mergeImportData: (payload, aliasAdditions = []) => {
          const state = get();

          // ── Deletions ──
          //
          // Both sides' tombstones are unioned, then applied to both sides'
          // records. An expense edited after it was deleted elsewhere is kept:
          // the later action wins, the same rule as for two competing edits.
          const tombKey = (t: Tombstone) => `${t.kind}:${t.id}`;
          const tombs = new Map<string, Tombstone>();
          for (const t of state.tombstones) tombs.set(tombKey(t), t);
          for (const t of payload.tombstones ?? []) {
            const have = tombs.get(tombKey(t));
            if (!have || t.deletedAt.getTime() > have.deletedAt.getTime()) tombs.set(tombKey(t), t);
          }
          for (const e of [...state.expenses, ...payload.expenses]) {
            const t = tombs.get(`expense:${e.id}`);
            if (t && e.updatedAt.getTime() > t.deletedAt.getTime()) tombs.delete(`expense:${e.id}`);
          }
          const deadGroup      = (id?: string) => !!id && tombs.has(`group:${id}`);
          const deadExpense    = (e: Expense) => tombs.has(`expense:${e.id}`) || deadGroup(e.groupId);
          const deadSettlement = (s: Settlement) => tombs.has(`settlement:${s.id}`) || deadGroup(s.groupId);

          const keptGroups      = state.groups.filter((g) => !deadGroup(g.id));
          const keptExpenses    = state.expenses.filter((e) => !deadExpense(e));
          const keptSettlements = state.settlements.filter((s) => !deadSettlement(s));
          const removedExpIds   = new Set(state.expenses.filter(deadExpense).map((e) => e.id));
          const removedSetIds   = new Set(state.settlements.filter(deadSettlement).map((s) => s.id));
          const keptActivities  = state.activities.filter((a) => {
            if (deadGroup(a.groupId)) return false;
            if ((a.type === 'expense_added' || a.type === 'expense_updated') && removedExpIds.has(a.expenseId)) return false;
            if ((a.type === 'payment' || a.type === 'settled') && removedSetIds.has(a.settlementId)) return false;
            return true;
          });
          const removed =
            (state.groups.length - keptGroups.length) + removedExpIds.size + removedSetIds.size;

          const incomingGroupsList      = payload.groups.filter((g) => !deadGroup(g.id));
          const incomingExpenses        = payload.expenses.filter((e) => !deadExpense(e));
          const incomingSettlements     = payload.settlements.filter((s) => !deadSettlement(s));
          const incomingActivities      = payload.activities.filter((a) => !deadGroup(a.groupId));

          const existingUserIds  = new Set(state.users.map((u) => u.id));
          const existingGroupIds = new Set(keptGroups.map((g) => g.id));
          const existingSetIds   = new Set(keptSettlements.map((s) => s.id));
          const existingActIds   = new Set(keptActivities.map((a) => a.id));
          const localExpenses    = new Map(keptExpenses.map((e) => [e.id, e]));

          const newUsers = payload.users.filter((u) => !existingUserIds.has(u.id));
          const nameOf = (id: string) =>
            [...state.users, ...payload.users].find((u) => u.id === id)?.name ?? 'Unknown';

          // Remember the IDs other devices know local people by.
          const aliasesFor = new Map<string, Set<string>>();
          for (const { userId, alias } of aliasAdditions) {
            if (!aliasesFor.has(userId)) aliasesFor.set(userId, new Set());
            aliasesFor.get(userId)!.add(alias);
          }
          const users = state.users.map((u) => {
            const extra = aliasesFor.get(u.id);
            if (!extra) return u;
            const merged = new Set([...(u.aliases ?? []), ...extra]);
            merged.delete(u.id);
            return { ...u, aliases: [...merged] };
          });

          const incomingGroups = new Map(incomingGroupsList.map((g) => [g.id, g]));
          const groups = keptGroups.map((local) => {
            const incoming = incomingGroups.get(local.id);
            if (!incoming) return local;
            const have = new Set(local.members.map((m) => m.userId));
            const added = incoming.members.filter((m) => !have.has(m.userId));
            return added.length ? { ...local, members: [...local.members, ...added] } : local;
          });
          const newGroups = incomingGroupsList.filter((g) => !existingGroupIds.has(g.id));

          const newExpenses: Expense[] = [];
          const updatedExpenses = new Map<string, Expense>();
          const changes: MergeChange[] = [];
          for (const incoming of incomingExpenses) {
            const local = localExpenses.get(incoming.id);
            if (!local) {
              newExpenses.push(incoming);
              continue;
            }
            const fields = diffExpenses(local, incoming, nameOf);
            if (fields.length === 0) continue;
            const theirsNewer = incoming.updatedAt.getTime() > local.updatedAt.getTime();
            if (theirsNewer) updatedExpenses.set(incoming.id, incoming);
            changes.push({
              expenseId: incoming.id,
              description: theirsNewer ? incoming.description : local.description,
              outcome: theirsNewer ? 'took-theirs' : 'kept-yours',
              fields,
            });
          }
          const expenses = [
            ...keptExpenses.map((e) => updatedExpenses.get(e.id) ?? e),
            ...newExpenses,
          ];

          const newSettlements = incomingSettlements.filter((s) => !existingSetIds.has(s.id));
          const newActivities  = incomingActivities.filter((a) => !existingActIds.has(a.id));
          const changed =
            newUsers.length + newGroups.length + newExpenses.length + updatedExpenses.size +
            newSettlements.length + removed;

          set(
            {
              users:       [...users, ...newUsers],
              groups:      [...groups, ...newGroups],
              expenses,
              settlements: [...keptSettlements, ...newSettlements],
              activities:  [...keptActivities, ...newActivities],
              tombstones:  [...tombs.values()],
              changesSinceBackup: get().changesSinceBackup + changed,
            },
            false,
            'mergeImportData',
          );

          return {
            usersAdded:       newUsers.length,
            groupsAdded:      newGroups.length,
            expensesAdded:    newExpenses.length,
            expensesUpdated:  updatedExpenses.size,
            settlementsAdded: newSettlements.length,
            removed,
            changes,
          };
        },

        // ── Danger zone ────────────────────────────────────────────────────────

        // ── Backups & sharing ────────────────────────────────────────────────

        markBackedUp: () =>
          set({ lastBackupAt: new Date(), changesSinceBackup: 0, backupSnoozedUntil: null }, false, 'markBackedUp'),

        snoozeBackupReminder: (days) => {
          const until = new Date();
          until.setDate(until.getDate() + days);
          set({ backupSnoozedUntil: until }, false, 'snoozeBackupReminder');
        },

        markGroupShared: (groupId) =>
          set(
            { groupSharedAt: { ...get().groupSharedAt, [groupId]: new Date() } },
            false,
            'markGroupShared',
          ),

        // ── Danger zone ────────────────────────────────────────────────────────

        wipeAllData: () =>
          set(
            {
              hasOnboarded: false,
              theme: 'system' as ThemeMode,
              currentUserId: '',
              needsIdentity: false,
              users: [],
              groups: [],
              expenses: [],
              settlements: [],
              activities: [],
              tombstones: [],
              lastBackupAt: null,
              changesSinceBackup: 0,
              backupSnoozedUntil: null,
              groupSharedAt: {},
            },
            false,
            'wipeAllData',
          ),
      }),
      {
        name: 'opensplit-v2',
        storage: persistStorage,
        version: 3,
        /**
         * v0/v1 kept `friendBalances` on the state and `yourBalance` / `totalSpent`
         * on each group, maintained by hand as actions ran. They are derived now,
         * so the stored copies are dropped — stale numbers that outrank the real
         * ones are worse than no numbers.
         *
         * v1 also let Settle Up record payments against no group, which the group
         * balances could never account for; those get re-attributed here.
         */
        migrate: (persisted, fromVersion) => {
          const state = persisted as Partial<AppStore> & { friendBalances?: unknown };
          if (!state) return state as unknown as AppStore;

          if (fromVersion < 2) {
            delete state.friendBalances;

            type LegacyGroup = Group & { yourBalance?: number; totalSpent?: number };
            state.groups = ((state.groups ?? []) as LegacyGroup[]).map((group) => {
              const cleaned: LegacyGroup = { ...group };
              delete cleaned.yourBalance;
              delete cleaned.totalSpent;
              return cleaned as Group;
            });

            state.settlements = attributeLooseSettlements(
              state.expenses ?? [],
              state.settlements ?? [],
            );
          }

          // v3 added tombstones, backup tracking and per-group share stamps.
          if (fromVersion < 3) {
            state.tombstones ??= [];
            state.lastBackupAt ??= null;
            state.changesSinceBackup ??= 0;
            state.backupSnoozedUntil ??= null;
            state.groupSharedAt ??= {};
          }

          return state as AppStore;
        },
        partialize: (state) => ({
          hasOnboarded:       state.hasOnboarded,
          theme:              state.theme,
          currentUserId:      state.currentUserId,
          needsIdentity:      state.needsIdentity,
          users:              state.users,
          groups:             state.groups,
          expenses:           state.expenses,
          settlements:        state.settlements,
          activities:         state.activities,
          tombstones:         state.tombstones,
          lastBackupAt:       state.lastBackupAt,
          changesSinceBackup: state.changesSinceBackup,
          backupSnoozedUntil: state.backupSnoozedUntil,
          groupSharedAt:      state.groupSharedAt,
        }),
      },
    ),
    { name: 'splitwise-store' },
  ),
);
