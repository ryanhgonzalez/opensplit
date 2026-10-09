import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser, selectFriendBalances, selectOverallBalance } from '../store';
import Avatar from '../components/Avatar';
import PersonSheet from '../components/PersonSheet';
import { formatCurrency, formatSigned } from '../utils';
import './People.css';

export default function People() {
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore(s => s.users);
  const groups = useStore(s => s.groups);
  const friendBalances = useStore(selectFriendBalances);
  const overall = useStore(selectOverallBalance);
  const addUser = useStore(s => s.addUser);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const others = users.filter(u => u.id !== currentUser.id);

  // Sort: unsettled balances first, then alphabetical
  const sorted = [...others].sort((a, b) => {
    const balA = Math.abs(friendBalances[a.id] ?? 0);
    const balB = Math.abs(friendBalances[b.id] ?? 0);
    if (balA > 0.005 && balB <= 0.005) return -1;
    if (balA <= 0.005 && balB > 0.005) return 1;
    return a.name.localeCompare(b.name);
  });

  const sharedGroupNames = (userId: string) =>
    groups
      .filter(
        g => g.members.some(m => m.userId === userId) &&
             g.members.some(m => m.userId === currentUser.id),
      )
      .map(g => g.name);

  const handleAddPerson = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newName.trim()) return;
    addUser({ name: newName.trim() });
    setNewName('');
  };

  const myNet = overall.net;
  const meSettled = Math.abs(myNet) < 0.005;

  return (
    <div className="page-content">
      <div className="people-page">
        <header className="people-header">
          <h1 className="page-hero-title">People</h1>
          <p className="text-secondary">Friends &amp; contacts</p>
        </header>

        <form className="people-add rule-top" onSubmit={handleAddPerson}>
          <label className="people-add-field">
            <span className="sr-only">Name</span>
            <input
              className="field-input"
              placeholder="Their name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
            Add person
          </button>
        </form>

        {/* You */}
        <section>
          <h2 className="cap people-section-label">You</h2>
          <button className="people-row" onClick={() => setSelectedUserId(currentUser.id)}>
            <Avatar user={currentUser} size="md" />
            <span className="people-row-info">
              <span className="people-row-name">{currentUser.name}</span>
              <span className="text-xs text-secondary">{currentUser.email ?? 'Your profile'}</span>
            </span>
            <span className={`people-row-amount ${meSettled ? 'zero' : `num ${myNet > 0 ? 'pos' : 'neg'}`}`}>
              {meSettled ? 'Settled' : formatSigned(myNet)}
            </span>
          </button>
        </section>

        {/* Everyone else */}
        {sorted.length > 0 ? (
          <section>
            <h2 className="cap people-section-label">People · {sorted.length}</h2>
            {sorted.map(user => {
              const balance = friendBalances[user.id] ?? 0;
              const settled = Math.abs(balance) < 0.005;
              const shared = sharedGroupNames(user.id);
              return (
                <button key={user.id} className="people-row" onClick={() => setSelectedUserId(user.id)}>
                  <Avatar user={user} size="md" />
                  <span className="people-row-info">
                    <span className="people-row-name">{user.name}</span>
                    <span className="text-xs text-secondary people-row-groups">
                      {shared.length === 0 ? 'No shared groups' : shared.join(', ')}
                    </span>
                  </span>
                  <span className="people-row-balance">
                    {settled ? (
                      <span className="zero">Settled</span>
                    ) : (
                      <>
                        <span className={`num people-row-amount ${balance > 0 ? 'pos' : 'neg'}`}>
                          {formatCurrency(balance)}
                        </span>
                        <span className="text-xs text-secondary">{balance > 0 ? 'owes you' : 'you owe'}</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <div className="empty-box">
            <span className="empty-box-title">No people yet</span>
            <span className="text-secondary">Add friends and contacts so you can split expenses with them.</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedUserId && (
          <PersonSheet
            open={!!selectedUserId}
            onClose={() => setSelectedUserId(null)}
            userId={selectedUserId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
