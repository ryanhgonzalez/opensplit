import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Avatar from '../components/Avatar';
import SettleModal, { SettleMode } from '../components/SettleModal';
import { useStore, selectCurrentUser, selectOverallBalance } from '../store';
import { formatCurrency, formatSigned } from '../utils';
import type { PaymentMethod } from '../types';
import './SettleUp.css';

interface ActiveModal {
  fromUserId: string;
  toUserId: string;
  amount: number;
  mode: SettleMode;
}

export default function SettleUp() {
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  const currentUser = useStore(selectCurrentUser)!;
  const balance = useStore(selectOverallBalance);
  const users = useStore((s) => s.users);
  const settleWithUser = useStore((s) => s.settleWithUser);

  const getUserById = (id: string) => users.find((u) => u.id === id);

  /**
   * Records the payment against the running total with that person.
   *
   * This page settles across everything rather than one group, so the payment is
   * spread over the groups the debt actually sits in, proportional to what is
   * outstanding in each. Recording it against no group at all — which is what
   * this used to do — moved the overall balance while leaving every group
   * balance untouched, so the two could never be reconciled again.
   */
  const handleConfirm = (amount: number, method: PaymentMethod) => {
    if (!activeModal || activeModal.mode === 'remind') return;

    settleWithUser({
      fromUserId: activeModal.fromUserId,
      toUserId: activeModal.toUserId,
      amount,
      currency: 'USD',
      date: new Date(),
      paymentMethod: method,
    });
  };

  const settled = balance.owedByFriend.length === 0 && balance.oweToFriend.length === 0;
  const netEven = Math.abs(balance.net) < 0.005;

  return (
    <div className="page-content">
      <div className="settle-page">
        <h1 className="page-hero-title">Settle Up</h1>

        <section className="statement settle-statement" aria-label="Overall balance">
          <div>
            <span className="cap">Overall net balance</span>
            <span className={`num settle-net ${netEven ? 'zero' : balance.net > 0 ? 'pos' : 'neg'}`}>
              {formatSigned(balance.net)}
            </span>
            {!netEven && (
              <span className="text-sm text-secondary">
                {balance.net > 0 ? 'You are owed overall' : 'You owe overall'}
              </span>
            )}
          </div>
          <div className="settle-part">
            <span className="cap">Owed to you</span>
            <span className="num pos settle-part-amount">{formatCurrency(balance.totalOwed)}</span>
          </div>
          <div className="settle-part">
            <span className="cap">You owe</span>
            <span className="num neg settle-part-amount">{formatCurrency(balance.totalOwe)}</span>
          </div>
        </section>

        {settled ? (
          <div className="empty-box">
            <span className="empty-box-title">All settled up!</span>
            <span className="text-secondary">Nobody owes anybody right now.</span>
          </div>
        ) : (
          <div className="settle-columns">
            {balance.owedByFriend.length > 0 && (
              <section className="settle-col">
                <h2 className="settle-h2">Owed to you</h2>
                <div className="ruled">
                  {balance.owedByFriend.map((b) => {
                    const friend = getUserById(b.userId);
                    if (!friend) return null;
                    return (
                      <div key={b.userId} className="settle-row">
                        <Avatar user={friend} size="md" />
                        <span className="settle-info">
                          <span className="settle-name">{friend.name}</span>
                          <span className="text-xs text-secondary">owes you</span>
                        </span>
                        <span className="num pos settle-amount">{formatCurrency(b.amount)}</span>
                        <span className="settle-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setActiveModal({
                              fromUserId: b.userId, toUserId: currentUser.id, amount: b.amount, mode: 'remind',
                            })}
                          >
                            Remind
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setActiveModal({
                              fromUserId: b.userId, toUserId: currentUser.id, amount: b.amount, mode: 'settle',
                            })}
                          >
                            Mark received
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {balance.oweToFriend.length > 0 && (
              <section className="settle-col">
                <h2 className="settle-h2">You owe</h2>
                <div className="ruled">
                  {balance.oweToFriend.map((b) => {
                    const friend = getUserById(b.userId);
                    if (!friend) return null;
                    return (
                      <div key={b.userId} className="settle-row">
                        <Avatar user={friend} size="md" />
                        <span className="settle-info">
                          <span className="settle-name">{friend.name}</span>
                          <span className="text-xs text-secondary">you owe</span>
                        </span>
                        <span className="num neg settle-amount">{formatCurrency(b.amount)}</span>
                        <span className="settle-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setActiveModal({
                              fromUserId: currentUser.id, toUserId: b.userId, amount: b.amount, mode: 'settle',
                            })}
                          >
                            Pay
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <p className="text-sm text-secondary settle-note">
              Payments marked here clear your overall balance with that person. To clear one group’s
              balance, mark it from inside that group.
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeModal && (
          <SettleModal
            fromUserId={activeModal.fromUserId}
            toUserId={activeModal.toUserId}
            amount={activeModal.amount}
            mode={activeModal.mode}
            onClose={() => setActiveModal(null)}
            onConfirm={handleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
