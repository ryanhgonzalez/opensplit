import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../components/GlassCard';
import Avatar from '../components/Avatar';
import SettleModal, { SettleMode } from '../components/SettleModal';
import { useStore, selectCurrentUser, selectOverallBalance } from '../store';
import { formatCurrency } from '../utils';
import type { PaymentMethod } from '../types';
import './SettleUp.css';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

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
  const addSettlement = useStore((s) => s.addSettlement);

  const getUserById = (id: string) => users.find((u) => u.id === id);

  /**
   * Records the payment against the overall balance with that person.
   *
   * Deliberately carries no `groupId`: this page settles the running total across
   * everything, so it is not attributable to one group. A group's own balance only
   * moves when the payment is marked complete from inside that group.
   */
  const handleConfirm = (amount: number, method: PaymentMethod) => {
    if (!activeModal || activeModal.mode === 'remind') return;

    addSettlement({
      fromUserId: activeModal.fromUserId,
      toUserId: activeModal.toUserId,
      amount,
      currency: 'USD',
      date: new Date(),
      paymentMethod: method,
    });
  };

  return (
    <div className="page-content">
      <motion.div className="settle-page" variants={containerVariants} initial="hidden" animate="show">
        {/* Page hero header */}
        <motion.div className="page-hero-header" variants={itemVariants}>
          <div>
            <h1 className="page-hero-title">Settle Up</h1>
            <p className="page-hero-subtitle text-secondary text-sm">
              {balance.net >= 0 ? 'You are owed overall' : 'You owe overall'}
            </p>
          </div>
        </motion.div>

        {/* Net summary */}
        <motion.div className="px-5 mb-5" variants={itemVariants}>
            <GlassCard variant="strong" className="glass-highlight" padding="20px">
              <div className="settle-summary">
                <div>
                  <p className="text-secondary text-sm">Overall net balance</p>
                  <p
                    className={balance.net >= 0 ? 'text-green' : 'text-red'}
                    style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.5, marginTop: 4 }}
                  >
                    {balance.net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(balance.net))}
                  </p>
                </div>
                <div className="settle-summary-pills">
                  <div className="settle-pill">
                    <span className="text-xs text-secondary">Owed to you</span>
                    <span className="text-green" style={{ fontWeight: 700 }}>{formatCurrency(balance.totalOwed)}</span>
                  </div>
                  <div className="settle-pill">
                    <span className="text-xs text-secondary">You owe</span>
                    <span className="text-red" style={{ fontWeight: 700 }}>{formatCurrency(balance.totalOwe)}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* You are owed */}
          {balance.owedByFriend.length > 0 && (
            <motion.div variants={itemVariants} className="mb-5">
              <div className="section-header"><h3>Owed to You</h3></div>
              <div className="px-5 settle-list">
                {balance.owedByFriend.map((b) => {
                  const friend = getUserById(b.userId);
                  if (!friend) return null;
                  return (
                    <GlassCard key={b.userId} padding="16px" style={{ marginBottom: 10 }}>
                      <div className="settle-row">
                        <Avatar user={friend} size="md" />
                        <div className="settle-info">
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{friend.name}</span>
                          <span className="text-sm text-secondary">owes you</span>
                        </div>
                        <span className="text-green settle-amount">+{formatCurrency(b.amount)}</span>
                        <div className="settle-actions">
                          <motion.button
                            className="remind-btn"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setActiveModal({
                              fromUserId: b.userId, toUserId: currentUser.id, amount: b.amount, mode: 'remind',
                            })}
                          >
                            Remind
                          </motion.button>
                          <motion.button
                            className="pay-btn"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setActiveModal({
                              fromUserId: b.userId, toUserId: currentUser.id, amount: b.amount, mode: 'settle',
                            })}
                          >
                            Mark Paid
                          </motion.button>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* You owe */}
          {balance.oweToFriend.length > 0 && (
            <motion.div variants={itemVariants} className="mb-5">
              <div className="section-header"><h3>You Owe</h3></div>
              <div className="px-5 settle-list">
                {balance.oweToFriend.map((b) => {
                  const friend = getUserById(b.userId);
                  if (!friend) return null;
                  return (
                    <GlassCard key={b.userId} padding="16px" style={{ marginBottom: 10 }}>
                      <div className="settle-row">
                        <Avatar user={friend} size="md" />
                        <div className="settle-info">
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{friend.name}</span>
                          <span className="text-sm text-secondary">you owe</span>
                        </div>
                        <span className="text-red settle-amount">-{formatCurrency(b.amount)}</span>
                        <div className="settle-actions">
                          <motion.button
                            className="pay-btn"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setActiveModal({
                              fromUserId: currentUser.id, toUserId: b.userId, amount: b.amount, mode: 'settle',
                            })}
                          >
                            Pay
                          </motion.button>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </motion.div>
          )}

          {balance.owedByFriend.length === 0 && balance.oweToFriend.length === 0 && (
            <motion.div variants={itemVariants} className="empty-state" style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <p style={{ fontSize: 40 }}>🎉</p>
              <p className="text-secondary">All settled up!</p>
            </motion.div>
          )}
      </motion.div>

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
