import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './useStore';
import { selectFriendBalances } from './selectors';
import {
  buildGroupExport,
  parseAndValidate,
  prepareMerge,
  fileIncludesUser,
  resolveUserId,
  type AppExport,
  type ExportPayload,
} from '../lib/dataExport';
import { splitEvenly } from '../lib/calculations';
import type { User } from '../types';

// ─── Harness ──────────────────────────────────────────────────────────────────
//
// Two people, two devices, one shared group. Each "device" is a snapshot of the
// store; switching devices means restoring that snapshot. Files travel between
// them through a JSON round trip, exactly as a real export would.

const state = () => useStore.getState();

function snapshot(): ExportPayload {
  const s = state();
  return {
    currentUserId: s.currentUserId,
    users: s.users,
    groups: s.groups,
    expenses: s.expenses,
    settlements: s.settlements,
    activities: s.activities,
    friendBalances: {},
    tombstones: s.tombstones,
  };
}

function loadDevice(snap: ExportPayload) {
  state().restoreAllData(snap);
  state().setCurrentUser(snap.currentUserId);
}

/** Exports one group and reads it back the way the import sheet would. */
function exportGroupFile(groupId: string): AppExport {
  const data = buildGroupExport({ ...snapshot(), friendBalances: selectFriendBalances(state()) }, groupId);
  const result = parseAndValidate(JSON.stringify(data));
  expect(result.ok, result.errors.join('; ')).toBe(true);
  return result.data!;
}

function addEqualExpense(description: string, amount: number, paidBy: string, groupId: string, participants: string[]) {
  return state().addExpense({
    description,
    amount,
    currency: 'USD',
    paidBy,
    groupId,
    date: new Date(),
    category: 'food',
    split: { type: 'equal', entries: splitEvenly(amount, participants) },
  });
}

let clock: number;
beforeEach(() => {
  vi.useFakeTimers();
  clock = new Date('2026-09-15T10:00:00Z').getTime();
  vi.setSystemTime(clock);
  state().wipeAllData();
});
afterEach(() => vi.useRealTimers());

/** Advance time so a later edit has a strictly newer `updatedAt`. */
const tick = () => vi.setSystemTime((clock += 60_000));

// ─── Owner side ───────────────────────────────────────────────────────────────

function setupOwnerDevice() {
  state().completeOnboarding('Owen Owner');
  const owner = state().users[0];
  const alice = state().addUser({ name: 'Alice' });
  const group = state().createGroup({
    name: 'Cabin weekend',
    emoji: '🏔️',
    color: '#7c3aed',
    type: 'trip',
    members: [
      { userId: owner.id, role: 'owner', joinedAt: new Date() },
      { userId: alice.id, role: 'member', joinedAt: new Date() },
    ],
  });
  const dinner = addEqualExpense('Dinner', 60, owner.id, group.id, [owner.id, alice.id]);
  return { owner, alice, group, dinner };
}

// ─── resolveUserId ────────────────────────────────────────────────────────────

describe('resolveUserId', () => {
  const local: User[] = [
    { id: 'L1', name: 'A', initials: 'A', avatarColor: '#000', createdAt: new Date(), aliases: ['F9'] },
    { id: 'L2', name: 'B', initials: 'B', avatarColor: '#000', createdAt: new Date(), email: 'b@example.com' },
  ];
  const fileUser = (over: Partial<User>): User =>
    ({ id: 'X', name: 'X', initials: 'X', avatarColor: '#000', createdAt: new Date(), ...over });

  it('matches the same ID', () => {
    expect(resolveUserId(fileUser({ id: 'L2' }), local)).toBe('L2');
  });
  it('matches an ID the local person has recorded as an alias', () => {
    expect(resolveUserId(fileUser({ id: 'F9' }), local)).toBe('L1');
  });
  it('matches an alias the file person carries for a local ID', () => {
    expect(resolveUserId(fileUser({ id: 'F0', aliases: ['L1'] }), local)).toBe('L1');
  });
  it('matches by email, case-insensitively', () => {
    expect(resolveUserId(fileUser({ email: 'B@Example.com' }), local)).toBe('L2');
  });
  it('finds nobody for a stranger', () => {
    expect(resolveUserId(fileUser({}), local)).toBeUndefined();
  });
});

// ─── Join ─────────────────────────────────────────────────────────────────────

describe('joining a shared group', () => {
  it('keeps the group and expense IDs so later files line up', () => {
    const { group, dinner } = setupOwnerDevice();
    const file = exportGroupFile(group.id);

    const prep = prepareMerge(file, [], 'someone-else', null);
    expect(prep.payload.groups[0].id).toBe(group.id);
    expect(prep.payload.expenses[0].id).toBe(dinner.id);
  });

  it('folds the chosen person into the importer and remembers the foreign ID', () => {
    const { owner, alice, group } = setupOwnerDevice();
    const file = exportGroupFile(group.id);

    // Alice already uses the app under her own ID.
    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];

    expect(fileIncludesUser(file, state().users, me.id)).toBe(false);

    const { payload, aliasAdditions } = prepareMerge(file, state().users, me.id, alice.id);
    const stats = state().mergeImportData(payload, aliasAdditions);

    expect(stats).toMatchObject({ groupsAdded: 1, expensesAdded: 1, usersAdded: 1, expensesUpdated: 0 });

    const joined = state().groups.find((g) => g.id === group.id)!;
    expect(joined.members.map((m) => m.userId).sort()).toEqual([me.id, owner.id].sort());
    expect(state().users.map((u) => u.id)).not.toContain(alice.id);
    expect(state().users.find((u) => u.id === me.id)!.aliases).toEqual([alice.id]);

    // Her share of the dinner now counts against her own account.
    expect(selectFriendBalances(state())[owner.id]).toBe(-30);
  });

  it('adds everyone as new people when the importer is in none of them', () => {
    const { owner, alice, group } = setupOwnerDevice();
    const file = exportGroupFile(group.id);

    state().wipeAllData();
    state().completeOnboarding('Bystander');
    const me = state().users[0];

    const { payload, aliasAdditions } = prepareMerge(file, state().users, me.id, null);
    state().mergeImportData(payload, aliasAdditions);

    expect(state().users.map((u) => u.id).sort()).toEqual([me.id, owner.id, alice.id].sort());
    expect(selectFriendBalances(state())).toEqual({});
  });
});

// ─── Round trip ───────────────────────────────────────────────────────────────

describe('contributions travelling back to the owner', () => {
  it('merges a member\'s new expense under the person the owner already knows', () => {
    const { owner, alice, group } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    // Alice's device: join with her own pre-existing profile, add an expense.
    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    tick();
    const gas = addEqualExpense('Gas', 40, me.id, group.id, [me.id, owner.id]);
    const returnFile = exportGroupFile(group.id);

    // Back on the owner's device.
    loadDevice(ownerDevice);
    expect(fileIncludesUser(returnFile, state().users, owner.id)).toBe(true);

    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);

    expect(stats).toMatchObject({ usersAdded: 0, groupsAdded: 0, expensesAdded: 1, expensesUpdated: 0 });
    expect(state().users).toHaveLength(2);

    const merged = state().expenses.find((e) => e.id === gas.id)!;
    expect(merged.paidBy).toBe(alice.id);
    expect(merged.split.entries.map((en) => en.userId).sort()).toEqual([owner.id, alice.id].sort());

    // Owner fronted 60 (Alice owes 30); Alice fronted 40 (owner owes 20) → Alice owes 10.
    expect(selectFriendBalances(state())[alice.id]).toBe(10);
    expect(state().users.find((u) => u.id === alice.id)!.aliases).toEqual([me.id]);
  });

  it('lets the newer edit of an expense win and leaves the older one alone', () => {
    const { owner, alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    // Alice joins and fixes the dinner amount.
    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    tick();
    state().updateExpense(dinner.id, { amount: 80, split: { type: 'equal', entries: splitEvenly(80, [owner.id, me.id]) } });
    const returnFile = exportGroupFile(group.id);

    // Owner merges the fix.
    loadDevice(ownerDevice);
    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.expensesUpdated).toBe(1);
    expect(stats.expensesAdded).toBe(0);
    expect(state().expenses.find((e) => e.id === dinner.id)!.amount).toBe(80);
    expect(selectFriendBalances(state())[alice.id]).toBe(40);

    // Merging the same file again changes nothing.
    const again = prepareMerge(returnFile, state().users, owner.id);
    expect(state().mergeImportData(again.payload, again.aliasAdditions)).toMatchObject({
      usersAdded: 0, groupsAdded: 0, expensesAdded: 0, expensesUpdated: 0, settlementsAdded: 0,
    });
  });

  it('does not overwrite a local edit that is newer than the file', () => {
    const { owner, alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    tick();
    state().updateExpense(dinner.id, { description: 'Dinner (Alice)' });
    const returnFile = exportGroupFile(group.id);

    loadDevice(ownerDevice);
    tick();
    state().updateExpense(dinner.id, { description: 'Dinner (owner, later)' });
    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.expensesUpdated).toBe(0);
    expect(state().expenses.find((e) => e.id === dinner.id)!.description).toBe('Dinner (owner, later)');
  });

  it('adds members the other side invited', () => {
    const { owner, alice, group } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    const bob = state().addUser({ name: 'Bob' });
    state().addGroupMember(group.id, bob.id);
    const returnFile = exportGroupFile(group.id);

    loadDevice(ownerDevice);
    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.usersAdded).toBe(1);
    const members = state().groups.find((g) => g.id === group.id)!.members.map((m) => m.userId).sort();
    expect(members).toEqual([owner.id, alice.id, bob.id].sort());
  });
});

// ─── Deletions ────────────────────────────────────────────────────────────────

describe('deletions travelling through files', () => {
  function joinAsAlice(inviteFile: AppExport, aliceFileId: string) {
    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, aliceFileId);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    return me;
  }

  it('removes an expense the other side deleted', () => {
    const { owner, alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    joinAsAlice(inviteFile, alice.id);
    const aliceDevice = snapshot();

    loadDevice(ownerDevice);
    tick();
    state().deleteExpense(dinner.id);
    expect(state().tombstones).toHaveLength(1);
    const returnFile = exportGroupFile(group.id);
    expect(returnFile.data.tombstones).toHaveLength(1);

    loadDevice(aliceDevice);
    expect(state().expenses.some((e) => e.id === dinner.id)).toBe(true);
    const back = prepareMerge(returnFile, state().users, aliceDevice.currentUserId);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.removed).toBe(1);
    expect(state().expenses.some((e) => e.id === dinner.id)).toBe(false);
    expect(selectFriendBalances(state())[owner.id] ?? 0).toBe(0);

    // The deletion stays known, so an older copy of the file cannot bring it back.
    const stale = prepareMerge(inviteFile, state().users, aliceDevice.currentUserId);
    const again = state().mergeImportData(stale.payload, stale.aliasAdditions);
    expect(again.expensesAdded).toBe(0);
    expect(state().expenses.some((e) => e.id === dinner.id)).toBe(false);
  });

  it('lets an edit made after the deletion win', () => {
    const { alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    // Owner deletes first.
    tick();
    state().deleteExpense(dinner.id);
    const ownerAfterDelete = snapshot();

    // Alice, unaware, fixes the amount later.
    joinAsAlice(inviteFile, alice.id);
    tick();
    state().updateExpense(dinner.id, { amount: 90 });
    const returnFile = exportGroupFile(group.id);

    loadDevice(ownerAfterDelete);
    const back = prepareMerge(returnFile, state().users, ownerDevice.currentUserId);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.expensesAdded).toBe(1);
    expect(state().expenses.find((e) => e.id === dinner.id)?.amount).toBe(90);
    expect(state().tombstones.some((t) => t.id === dinner.id)).toBe(false);
  });

  it('removes a whole group the other side deleted', () => {
    const { alice, group } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    joinAsAlice(inviteFile, alice.id);
    const aliceDevice = snapshot();

    loadDevice(ownerDevice);
    tick();
    state().deleteGroup(group.id);
    // The group is gone locally, so its tombstone travels in a full export instead.
    const full = parseAndValidate(JSON.stringify({
      schema: 'opensplit-export', version: 1, exportType: 'full', exportedAt: new Date().toISOString(),
      meta: { userCount: 0, groupCount: 0, expenseCount: 0, settlementCount: 0, activityCount: 0 },
      data: snapshot(),
    })).data!;

    loadDevice(aliceDevice);
    const back = prepareMerge(full, state().users, aliceDevice.currentUserId);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.removed).toBeGreaterThanOrEqual(2); // the group and its expense
    expect(state().groups).toHaveLength(0);
    expect(state().expenses).toHaveLength(0);
  });
});

// ─── Undo ─────────────────────────────────────────────────────────────────────

describe('deleting an expense with undo', () => {
  it('puts the expense, its feed entries and the balance back', () => {
    const { alice, group, dinner } = setupOwnerDevice();
    const before = selectFriendBalances(state())[alice.id];
    const feedBefore = state().activities.length;

    const deletion = state().deleteExpense(dinner.id)!;
    expect(deletion.expense.id).toBe(dinner.id);
    expect(state().expenses).toHaveLength(0);
    expect(state().tombstones.map((t) => t.id)).toEqual([dinner.id]);
    expect(state().activities.some((a) => a.type === 'expense_deleted' && a.expenseId === dinner.id)).toBe(true);

    state().restoreDeletedExpense(deletion);
    expect(state().expenses.map((e) => e.id)).toEqual([dinner.id]);
    expect(state().tombstones).toHaveLength(0);
    expect(state().activities).toHaveLength(feedBefore);
    expect(state().activities.some((a) => a.type === 'expense_deleted')).toBe(false);
    expect(selectFriendBalances(state())[alice.id]).toBe(before);
    expect(state().groups.find((g) => g.id === group.id)).toBeTruthy();
  });

  it('returns nothing for an unknown expense', () => {
    setupOwnerDevice();
    expect(state().deleteExpense('nope')).toBeUndefined();
  });
});

// ─── Conflict summary ─────────────────────────────────────────────────────────

describe('merge change summary', () => {
  it('lists the fields that differed and which side won', () => {
    const { owner, alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    tick();
    state().updateExpense(dinner.id, { description: 'Dinner at Luigi', amount: 80, split: { type: 'equal', entries: splitEvenly(80, [owner.id, me.id]) } });
    const returnFile = exportGroupFile(group.id);

    loadDevice(ownerDevice);
    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.changes).toHaveLength(1);
    const change = stats.changes[0];
    expect(change.outcome).toBe('took-theirs');
    expect(change.description).toBe('Dinner at Luigi');
    expect(change.fields.map((f) => f.field)).toEqual(['Description', 'Amount', 'Split']);
    expect(change.fields[1]).toEqual({ field: 'Amount', ours: '$60.00', theirs: '$80.00' });
  });

  it('reports a kept local edit as kept-yours', () => {
    const { owner, alice, group, dinner } = setupOwnerDevice();
    const inviteFile = exportGroupFile(group.id);
    const ownerDevice = snapshot();

    state().wipeAllData();
    state().completeOnboarding('Alice');
    const me = state().users[0];
    const prep = prepareMerge(inviteFile, state().users, me.id, alice.id);
    state().mergeImportData(prep.payload, prep.aliasAdditions);
    tick();
    state().updateExpense(dinner.id, { category: 'groceries' });
    const returnFile = exportGroupFile(group.id);

    loadDevice(ownerDevice);
    tick();
    state().updateExpense(dinner.id, { category: 'travel' });
    const back = prepareMerge(returnFile, state().users, owner.id);
    const stats = state().mergeImportData(back.payload, back.aliasAdditions);
    expect(stats.changes).toEqual([
      { expenseId: dinner.id, description: 'Dinner', outcome: 'kept-yours', fields: [{ field: 'Category', ours: 'travel', theirs: 'groceries' }] },
    ]);
  });
});

// ─── Backup tracking ──────────────────────────────────────────────────────────

describe('backup tracking', () => {
  it('counts edits and resets on a backup', () => {
    const { owner, alice, group } = setupOwnerDevice();
    const after = state().changesSinceBackup;
    expect(after).toBeGreaterThan(0);
    addEqualExpense('Coffee', 8, owner.id, group.id, [owner.id, alice.id]);
    expect(state().changesSinceBackup).toBe(after + 1);
    state().markBackedUp();
    expect(state().changesSinceBackup).toBe(0);
    expect(state().lastBackupAt).not.toBeNull();
  });

  it('records when a group was shared', () => {
    const { group } = setupOwnerDevice();
    expect(state().groupSharedAt[group.id]).toBeUndefined();
    state().markGroupShared(group.id);
    expect(state().groupSharedAt[group.id]).toBeInstanceOf(Date);
  });
});
