export type TombstoneKind = 'expense' | 'settlement' | 'group';

/**
 * A record of something that was deleted.
 *
 * Shared groups travel between devices as files, and a file cannot say "this
 * expense is gone" by omission — an expense that is missing from a file looks
 * exactly like one that was never shared. Tombstones make deletion explicit:
 * they ride along in exports, and a merge removes anything they name.
 *
 * For an expense, a later edit outranks the tombstone (`updatedAt` newer than
 * `deletedAt`), so someone fixing an expense after a friend deleted it wins.
 */
export interface Tombstone {
  id: string;
  kind: TombstoneKind;
  /** The group the record belonged to, so group exports carry the right ones. */
  groupId?: string;
  deletedAt: Date;
}
