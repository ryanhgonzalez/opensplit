import { describe, it, expect } from 'vitest';
import {
  buildJoinLink,
  decodeJoinPayload,
  encodeJoinPayload,
  readJoinLink,
  MAX_JOIN_PAYLOAD_CHARS,
} from './joinLink';
import type { AppExport } from './dataExport';

function fakeExport(expenseCount: number): AppExport {
  const expenses = Array.from({ length: expenseCount }, (_, i) => ({
    id: `e${i}-${crypto.randomUUID()}`,
    description: `Expense number ${i} with a fairly ordinary description`,
    amount: 10 + i,
    currency: 'USD',
    paidBy: 'u1',
    groupId: 'g1',
    date: new Date(2026, 0, 1 + (i % 28)),
    category: 'food' as const,
    split: { type: 'equal' as const, entries: [{ userId: 'u1', amount: 5 + i / 2 }, { userId: 'u2', amount: 5 + i / 2 }] },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const activities = expenses.map((e) => ({
    id: crypto.randomUUID(),
    type: 'expense_added' as const,
    actorId: 'u1',
    expenseId: e.id,
    groupId: 'g1',
    date: e.date,
  }));
  return {
    schema: 'opensplit-export',
    version: 1,
    exportType: 'group',
    exportedAt: new Date().toISOString(),
    meta: { userCount: 2, groupCount: 1, expenseCount, settlementCount: 0, activityCount: activities.length, groupId: 'g1', groupName: 'Trip' },
    data: {
      currentUserId: 'u1',
      users: [
        { id: 'u1', name: 'Owen', initials: 'O', avatarColor: '#000', createdAt: new Date() },
        { id: 'u2', name: 'Alice', initials: 'A', avatarColor: '#000', createdAt: new Date() },
      ],
      groups: [{ id: 'g1', name: 'Trip', emoji: '✈️', color: '#7c3aed', type: 'trip', members: [], lastActivity: new Date(), createdAt: new Date() }],
      expenses,
      settlements: [],
      activities,
      friendBalances: {},
      tombstones: [],
    },
  };
}

describe('join payload codec', () => {
  it('round-trips text, including emoji', () => {
    const text = JSON.stringify({ name: 'Cabin ✈️ weekend', amount: 12.5, note: 'ünïcödé' });
    expect(decodeJoinPayload(encodeJoinPayload(text))).toBe(text);
  });

  it('produces a URL-safe string', () => {
    const encoded = encodeJoinPayload(JSON.stringify(fakeExport(5)));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('buildJoinLink', () => {
  it('fits a small group into a link on the given origin', () => {
    const link = buildJoinLink(fakeExport(6), 'https://opensplit.example');
    expect(link).not.toBeNull();
    expect(link!.url.startsWith('https://opensplit.example/#join=')).toBe(true);
    expect(link!.trimmed).toBe(false);
    expect(link!.url.length).toBeLessThanOrEqual(MAX_JOIN_PAYLOAD_CHARS + 'https://opensplit.example/#join='.length);
  });

  it('drops the activity feed before giving up', () => {
    // Enough that the feed tips it over, but the expenses alone still fit.
    let trimmed: ReturnType<typeof buildJoinLink> = null;
    for (let n = 10; n <= 60 && !trimmed?.trimmed; n += 5) trimmed = buildJoinLink(fakeExport(n), 'https://x.test');
    expect(trimmed?.trimmed).toBe(true);
  });

  it('returns null when even the trimmed export is too big', () => {
    expect(buildJoinLink(fakeExport(400), 'https://x.test')).toBeNull();
  });
});

describe('readJoinLink', () => {
  it('reads the payload back out of the fragment', () => {
    const data = fakeExport(3);
    const link = buildJoinLink(data, 'https://x.test')!;
    const hash = link.url.slice(link.url.indexOf('#'));
    const json = readJoinLink(hash);
    expect(json).not.toBeNull();
    expect(JSON.parse(json!).meta.groupName).toBe('Trip');
  });

  it('ignores fragments that are not join links or are corrupt', () => {
    expect(readJoinLink('')).toBeNull();
    expect(readJoinLink('#settings')).toBeNull();
    expect(readJoinLink('#join=not-really-deflate-data')).toBeNull();
  });
});
