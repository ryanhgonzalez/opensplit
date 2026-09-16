import type { User, Group, Expense, Settlement, Activity, Tombstone } from '../types';

// ─── Schema constants ─────────────────────────────────────────────────────────

export const EXPORT_SCHEMA = 'opensplit-export' as const;
export const EXPORT_VERSION = 1 as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExportMeta {
  userCount: number;
  groupCount: number;
  expenseCount: number;
  settlementCount: number;
  activityCount: number;
  /** Present only on group exports. */
  groupId?: string;
  groupName?: string;
}

export interface ExportPayload {
  currentUserId: string;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activities: Activity[];
  friendBalances: Record<string, number>;
  /** Deletions, so a merge can remove what was removed elsewhere. Absent in older files. */
  tombstones?: Tombstone[];
}

export interface AppExport {
  schema: typeof EXPORT_SCHEMA;
  version: number;
  exportType: 'full' | 'group';
  exportedAt: string;
  meta: ExportMeta;
  data: ExportPayload;
}

export interface ParseResult {
  ok: boolean;
  data?: AppExport;
  errors: string[];
  warnings: string[];
}

/** One field of an expense that differed between the two sides of a merge. */
export interface MergeFieldChange {
  field: string;
  ours: string;
  theirs: string;
}

/** An expense both sides had edited, and how the merge resolved it. */
export interface MergeChange {
  expenseId: string;
  description: string;
  /** `took-theirs`: the file's copy was newer. `kept-yours`: the local edit was newer. */
  outcome: 'took-theirs' | 'kept-yours';
  fields: MergeFieldChange[];
}

export interface ImportStats {
  usersAdded: number;
  groupsAdded: number;
  expensesAdded: number;
  /** Existing expenses replaced by a newer edit from the file. */
  expensesUpdated: number;
  settlementsAdded: number;
  /** Local records removed because the file said they were deleted. */
  removed: number;
  /** Expenses that differed on both sides, with what changed. */
  changes: MergeChange[];
}

/**
 * - `join`: keep every record ID from the file so later exchanges of the same
 *   group merge instead of duplicating. This is how a shared group is joined and
 *   how contributions are pulled back in.
 * - `new-group`: a detached copy with fresh IDs; nothing existing is touched.
 * - `merge`: add records from a full backup that are not already present.
 * - `replace`: wipe and restore a full backup.
 */
export type ImportMode = 'join' | 'new-group' | 'merge' | 'replace';

// ─── Export builders ──────────────────────────────────────────────────────────

export function buildFullExport(state: ExportPayload): AppExport {
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportType: 'full',
    exportedAt: new Date().toISOString(),
    meta: {
      userCount: state.users.length,
      groupCount: state.groups.length,
      expenseCount: state.expenses.length,
      settlementCount: state.settlements.length,
      activityCount: state.activities.length,
    },
    data: state,
  };
}

export function buildGroupExport(state: ExportPayload, groupId: string): AppExport | null {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return null;

  // Collect every user ID referenced in this group's data.
  const memberIds = new Set(group.members.map((m) => m.userId));
  memberIds.add(state.currentUserId);

  const groupExpenses = state.expenses.filter((e) => e.groupId === groupId);
  const groupSettlements = state.settlements.filter((s) => s.groupId === groupId);
  const groupActivities = state.activities.filter((a) => a.groupId === groupId);

  for (const e of groupExpenses) {
    memberIds.add(e.paidBy);
    for (const en of e.split.entries) memberIds.add(en.userId);
  }
  for (const s of groupSettlements) {
    memberIds.add(s.fromUserId);
    memberIds.add(s.toUserId);
  }

  const users = state.users.filter((u) => memberIds.has(u.id));

  const friendBalances: Record<string, number> = {};
  for (const uid of memberIds) {
    if (uid !== state.currentUserId && state.friendBalances[uid] !== undefined) {
      friendBalances[uid] = state.friendBalances[uid];
    }
  }

  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportType: 'group',
    exportedAt: new Date().toISOString(),
    meta: {
      groupId,
      groupName: group.name,
      userCount: users.length,
      groupCount: 1,
      expenseCount: groupExpenses.length,
      settlementCount: groupSettlements.length,
      activityCount: groupActivities.length,
    },
    data: {
      currentUserId: state.currentUserId,
      users,
      groups: [group],
      expenses: groupExpenses,
      settlements: groupSettlements,
      activities: groupActivities,
      friendBalances,
      tombstones: (state.tombstones ?? []).filter(
        (t) => t.groupId === groupId || (t.kind === 'group' && t.id === groupId),
      ),
    },
  };
}

// ─── File download ────────────────────────────────────────────────────────────

export function exportFilename(data: AppExport): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = data.exportType === 'group'
    ? `group-${(data.meta.groupName ?? 'group').replace(/\s+/g, '_')}`
    : 'full';
  return `opensplit-${slug}-${ts}.json`;
}

/** The export as a File, ready for the Web Share API or a download link. */
export function exportToFile(data: AppExport): File {
  return new File([JSON.stringify(data, null, 2)], exportFilename(data), { type: 'application/json' });
}

/**
 * Hands the export to the device's share sheet (AirDrop, Messages, WhatsApp…)
 * when the browser supports sharing files, otherwise falls back to a download.
 * Returns which path was taken; `cancelled` when the person dismissed the sheet.
 */
export async function shareExport(data: AppExport): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = exportToFile(data);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: data.meta.groupName ?? 'OpenSplit' });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Some browsers advertise file sharing and then refuse; a download still works.
    }
  }
  downloadExport(data);
  return 'downloaded';
}

export function downloadExport(data: AppExport): void {
  const filename = exportFilename(data);

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Date revival ─────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reviveDates<T>(obj: T): T {
  if (typeof obj === 'string' && ISO_DATE_RE.test(obj)) return new Date(obj) as unknown as T;
  if (Array.isArray(obj)) return (obj as unknown[]).map(reviveDates) as unknown as T;
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = reviveDates(v);
    }
    return result as unknown as T;
  }
  return obj;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function parseAndValidate(json: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Invalid JSON — the file appears to be corrupted or was not a OpenSplit export.'], warnings };
  }

  if (!isObj(raw)) return { ok: false, errors: ['File does not contain a valid export object.'], warnings };

  if (raw.schema !== EXPORT_SCHEMA) {
    const got = raw.schema ? `"${String(raw.schema)}"` : 'missing';
    return {
      ok: false,
      errors: [`Unknown file format (schema: ${got}). This does not appear to be a OpenSplit export file.`],
      warnings,
    };
  }

  if (typeof raw.version !== 'number') {
    return { ok: false, errors: ['Export file is missing a version number.'], warnings };
  }

  if (raw.version > EXPORT_VERSION) {
    return {
      ok: false,
      errors: [`This file was created with a newer version of OpenSplit (v${raw.version}). Please update the app to import it.`],
      warnings,
    };
  }

  if (raw.version < EXPORT_VERSION) {
    warnings.push(`This file was created with an older version of OpenSplit (v${raw.version}). It will be migrated automatically.`);
  }

  if (!isObj(raw.data)) {
    return { ok: false, errors: ['Export file is missing its data payload.'], warnings };
  }

  const d = raw.data as Record<string, unknown>;

  for (const field of ['users', 'groups', 'expenses', 'settlements', 'activities'] as const) {
    if (!Array.isArray(d[field])) errors.push(`Missing or invalid "${field}" field.`);
  }
  if (typeof d.currentUserId !== 'string') errors.push('Missing "currentUserId" field.');
  if (errors.length) return { ok: false, errors, warnings };

  // Soft referential integrity checks — these produce warnings, not errors.
  const userIds = new Set((d.users as Record<string, unknown>[]).map((u) => u.id));
  const groupIds = new Set((d.groups as Record<string, unknown>[]).map((g) => g.id));
  let flagged = 0;

  for (const e of d.expenses as Record<string, unknown>[]) {
    if (flagged >= 4) { warnings.push('Additional integrity issues detected (not shown).'); break; }
    if (!userIds.has(e.paidBy)) { warnings.push(`Expense "${e.description ?? '?'}" has an unknown payer.`); flagged++; }
    if (e.groupId && !groupIds.has(e.groupId)) { warnings.push(`Expense "${e.description ?? '?'}" references an unknown group.`); flagged++; }
  }

  // Revive ISO date strings → Date objects.
  const revived = reviveDates(raw) as unknown as AppExport;
  return { ok: true, data: revived, warnings, errors: [] };
}

// ─── ID remapping — used for "Import as new group" ───────────────────────────

/**
 * @param selfIdInFile Which person *in the file* the importer is, folded into
 *   their own account. Defaults to the file's author — correct when you export
 *   and re-import your own data, but wrong when a friend shares theirs, so the
 *   import UI lets the importer pick. Pass `null` when they are in neither the
 *   file nor the group; everyone in the file then comes across as a new person.
 */
export function remapForNewGroup(
  exported: AppExport,
  existingUsers: User[],
  appCurrentUserId: string,
  selfIdInFile: string | null = exported.data.currentUserId,
): ExportPayload {
  const idMap = new Map<string, string>();

  // Whoever the importer identified as maps to the app's current user.
  if (selfIdInFile) idMap.set(selfIdInFile, appCurrentUserId);

  const byEmail = new Map(existingUsers.filter((u) => u.email).map((u) => [u.email!, u]));
  const byId = new Map(existingUsers.map((u) => [u.id, u]));
  const remapId = (id: string) => idMap.get(id) ?? id;

  // Remap users — match existing by email first, then by ID.
  const newUsers: User[] = [];
  for (const u of exported.data.users) {
    if (u.id === selfIdInFile) continue; // already handled
    const existing = (u.email && byEmail.get(u.email)) || byId.get(u.id);
    if (existing) {
      idMap.set(u.id, existing.id);
    } else {
      // Keep the original ID so re-importing the same group matches this
      // person by ID instead of creating a duplicate. We only reach here when
      // no existing user matched, so the ID can't collide.
      idMap.set(u.id, u.id);
      newUsers.push({ ...u });
    }
  }

  // Remap groups — always get fresh IDs.
  const remappedGroups: Group[] = exported.data.groups.map((g) => {
    const newId = crypto.randomUUID();
    idMap.set(g.id, newId);
    return {
      ...g,
      id: newId,
      members: g.members.map((m) => ({ ...m, userId: remapId(m.userId) })),
    };
  });

  // Remap expenses.
  const expIdMap = new Map<string, string>();
  const remappedExpenses: Expense[] = exported.data.expenses.map((e) => {
    const newId = crypto.randomUUID();
    expIdMap.set(e.id, newId);
    return {
      ...e,
      id: newId,
      paidBy: remapId(e.paidBy),
      groupId: e.groupId ? remapId(e.groupId) : undefined,
      split: { ...e.split, entries: e.split.entries.map((en) => ({ ...en, userId: remapId(en.userId) })) },
    };
  });

  // Remap settlements.
  const remappedSettlements: Settlement[] = exported.data.settlements.map((s) => ({
    ...s,
    id: crypto.randomUUID(),
    fromUserId: remapId(s.fromUserId),
    toUserId: remapId(s.toUserId),
    groupId: s.groupId ? remapId(s.groupId) : undefined,
  }));

  // Remap activities, preserving type-specific fields.
  const remappedActivities: Activity[] = exported.data.activities.map((a) => {
    const base: Record<string, unknown> = {
      ...a,
      id: crypto.randomUUID(),
      actorId: remapId(a.actorId),
      groupId: a.groupId ? remapId(a.groupId) : undefined,
    };
    if ('expenseId' in a && typeof a.expenseId === 'string') {
      base.expenseId = expIdMap.get(a.expenseId) ?? a.expenseId;
    }
    if ('fromUserId' in a) base.fromUserId = remapId(a.fromUserId as string);
    if ('toUserId' in a) base.toUserId = remapId(a.toUserId as string);
    return base as unknown as Activity;
  });

  // Remap friendBalance keys.
  const remappedBalances: Record<string, number> = {};
  // Not checked by `parseAndValidate`, so a valid file may legitimately omit it.
  for (const [oldId, bal] of Object.entries(exported.data.friendBalances ?? {})) {
    remappedBalances[remapId(oldId)] = bal;
  }

  return {
    currentUserId: appCurrentUserId,
    users: newUsers,
    groups: remappedGroups,
    expenses: remappedExpenses,
    settlements: remappedSettlements,
    activities: remappedActivities,
    friendBalances: remappedBalances,
    // A detached copy has fresh IDs, so no deletion from the file can refer to it.
    tombstones: [],
  };
}

// ─── Identity resolution — used for "Join group" and "Merge" ─────────────────

/**
 * Finds the local person a user from a file refers to: the same ID, an ID
 * either side has recorded as an alias, or the same email address.
 */
export function resolveUserId(fileUser: User, existingUsers: User[]): string | undefined {
  const fileIds = new Set([fileUser.id, ...(fileUser.aliases ?? [])]);
  const match = existingUsers.find((u) => {
    if (fileIds.has(u.id)) return true;
    if (u.aliases?.some((a) => fileIds.has(a))) return true;
    return !!fileUser.email && !!u.email && fileUser.email.toLowerCase() === u.email.toLowerCase();
  });
  return match?.id;
}

/** Whether the importer already appears in the file under any known identity. */
export function fileIncludesUser(exported: AppExport, existingUsers: User[], appCurrentUserId: string): boolean {
  return exported.data.users.some((u) => resolveUserId(u, existingUsers) === appCurrentUserId);
}

export interface AliasAddition {
  userId: string;
  alias: string;
}

export interface MergePrep {
  payload: ExportPayload;
  /** Foreign IDs to remember on local people so the next exchange matches them again. */
  aliasAdditions: AliasAddition[];
}

/**
 * Prepares a file for merging while keeping every record ID intact.
 *
 * Group, expense, settlement and activity IDs are preserved so that when the
 * same group travels back and forth between devices the records line up and
 * merge rather than multiply. Only user IDs are rewritten, and only so that
 * each person in the file maps onto the one local profile that is them:
 *
 * @param selfIdInFile Which person in the file the importer is. `undefined`
 *   leaves it to `resolveUserId` (the importer is already known in the file);
 *   `null` means they are in none of them.
 */
export function prepareMerge(
  exported: AppExport,
  existingUsers: User[],
  appCurrentUserId: string,
  selfIdInFile?: string | null,
): MergePrep {
  const idMap = new Map<string, string>();
  const aliasAdditions: AliasAddition[] = [];
  const newUsers: User[] = [];

  const remember = (userId: string, alias: string) => {
    if (userId !== alias) aliasAdditions.push({ userId, alias });
  };

  if (selfIdInFile) idMap.set(selfIdInFile, appCurrentUserId);

  for (const u of exported.data.users) {
    if (u.id === selfIdInFile) {
      remember(appCurrentUserId, u.id);
      for (const a of u.aliases ?? []) remember(appCurrentUserId, a);
      continue;
    }
    const resolved = resolveUserId(u, existingUsers);
    if (resolved) {
      idMap.set(u.id, resolved);
      remember(resolved, u.id);
      for (const a of u.aliases ?? []) remember(resolved, a);
    } else {
      idMap.set(u.id, u.id);
      newUsers.push({ ...u, aliases: u.aliases ? [...u.aliases] : undefined });
    }
  }

  const remapId = (id: string) => idMap.get(id) ?? id;

  const groups: Group[] = exported.data.groups.map((g) => ({
    ...g,
    members: g.members.map((m) => ({ ...m, userId: remapId(m.userId) })),
  }));

  const expenses: Expense[] = exported.data.expenses.map((e) => ({
    ...e,
    paidBy: remapId(e.paidBy),
    split: { ...e.split, entries: e.split.entries.map((en) => ({ ...en, userId: remapId(en.userId) })) },
  }));

  const settlements: Settlement[] = exported.data.settlements.map((s) => ({
    ...s,
    fromUserId: remapId(s.fromUserId),
    toUserId: remapId(s.toUserId),
  }));

  const activities: Activity[] = exported.data.activities.map((a) => {
    const base: Record<string, unknown> = { ...a, actorId: remapId(a.actorId) };
    if ('fromUserId' in a) base.fromUserId = remapId(a.fromUserId as string);
    if ('toUserId' in a) base.toUserId = remapId(a.toUserId as string);
    return base as unknown as Activity;
  });

  // Dedupe alias additions and drop any that name a person's own ID.
  const seen = new Set<string>();
  const uniqueAliases = aliasAdditions.filter(({ userId, alias }) => {
    const key = `${userId}\u0000${alias}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    payload: {
      currentUserId: appCurrentUserId,
      users: newUsers,
      groups,
      expenses,
      settlements,
      activities,
      friendBalances: {},
      tombstones: exported.data.tombstones ?? [],
    },
    aliasAdditions: uniqueAliases,
  };
}
