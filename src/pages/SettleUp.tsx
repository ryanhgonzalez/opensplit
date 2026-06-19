import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../components/GlassCard';
import Avatar from '../components/Avatar';
import { useStore, selectCurrentUser, selectOverallBalance, AddSettlementInput } from '../store';
import { formatCurrency } from '../utils';
import './SettleUp.css';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

type PaymentMethod = 'venmo' | 'cashapp' | 'zelle' | 'cash';

const paymentMethods: { id: PaymentMethod; label: string; icon: string; color: string }[] = [
  { id: 'venmo', label: 'Venmo', icon: 'V', color: '#3d95ce' },
  { id: 'cashapp', label: 'Cash App', icon: '$', color: '#00c244' },
  { id: 'zelle', label: 'Zelle', icon: 'Z', color: '#6d1ed4' },
  { id: 'cash', label: 'Cash', icon: '💵', color: '#10b981' },
];

interface SettleModalProps {
  userId: string;
  amount: number;
  isReceiving: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
}

function SettleModal({ userId, amount, isReceiving, onClose, onConfirm }: SettleModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('venmo');
  const [confirmed, setConfirmed] = useState(false);
  const users = useStore((s) => s.users);
  const currentUser = useStore(selectCurrentUser)!;
  const user = users.find((u) => u.id === userId);
  if (!user) return null;

  const handleConfirm = () => {
    if (!isReceiving) onConfirm(method);
    setConfirmed(true);
    setTimeout(onClose, 1800);
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="settle-modal glass-strong"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-handle" />

        <AnimatePresence mode="wait">
          {confirmed ? (
            <motion.div
              key="success"
              className="settle-success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
            >
              <motion.div
                className="success-checkmark"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', damping: 15 }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17L4 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.div>
              <h3>{isReceiving ? `Reminder sent to ${user.name}` : 'Payment recorded!'}</h3>
              <p className="text-secondary text-sm">
                {isReceiving
                  ? `You'll be notified when ${user.name} pays`
                  : `${formatCurrency(amount)} marked as settled`}
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="modal-header">
                <div className="modal-avatars">
                  <Avatar user={currentUser} size="lg" showRing />
                  <div className="modal-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12H19M14 7L19 12L14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <Avatar user={user} size="lg" showRing />
                </div>
                <h2 className="modal-title">{isReceiving ? `Remind ${user.name}` : `Pay ${user.name}`}</h2>
                <p className="text-secondary text-sm">
                  {isReceiving
                    ? `${user.name} owes you ${formatCurrency(amount)}`
                    : `You owe ${user.name} ${formatCurrency(amount)}`}
                </p>
              </div>

              <div className="modal-amount">
                <span className="amount-currency">$</span>
                <span className="amount-value">{amount.toFixed(2)}</span>
              </div>

              {!isReceiving && (
                <div className="payment-methods">
                  <p className="text-sm text-secondary" style={{ marginBottom: 10 }}>Pay via</p>
                  <div className="payment-grid">
                    {paymentMethods.map((pm) => (
                      <button
                        key={pm.id}
                        className={`payment-method-btn ${method === pm.id ? 'active' : ''}`}
                        onClick={() => setMethod(pm.id)}
                        style={method === pm.id ? { borderColor: `${pm.color}60`, background: `${pm.color}18` } : {}}
                      >
                        <div className="payment-icon" style={{ background: `${pm.color}25`, border: `1px solid ${pm.color}40` }}>
                          <span style={{ fontSize: pm.icon.length > 1 ? 16 : 14, fontWeight: 800, color: pm.color }}>
                            {pm.icon}
                          </span>
                        </div>
                        <span className="payment-label">{pm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button className="modal-cancel glass-btn" onClick={onClose}>Cancel</button>
                <motion.button
                  className="modal-confirm"
                  style={{
                    background: isReceiving
                      ? 'linear-gradient(135deg, rgba(96,165,250,0.8), rgba(124,58,237,0.7))'
                      : 'linear-gradient(135deg, rgba(52,211,153,0.85), rgba(45,212,191,0.7))',
                  }}
                  onClick={handleConfirm}
                  whileTap={{ scale: 0.97 }}
                >
                  {isReceiving ? 'Send Reminder' : `Pay ${formatCurrency(amount)}`}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function SettleUp() {
  const [activeModal, setActiveModal] = useState<{
    userId: string;
    amount: number;
    isReceiving: boolean;
  } | null>(null);

  const currentUser = useStore(selectCurrentUser)!;
  const balance = useStore(selectOverallBalance);
  const users = useStore((s) => s.users);
  const addSettlement = useStore((s) => s.addSettlement);

  const getUserById = (id: string) => users.find((u) => u.id === id);

  const handleConfirm = (method: PaymentMethod) => {
    if (!activeModal || activeModal.isReceiving) return;

    const input: AddSettlementInput = {
      fromUserId: currentUser.id,
      toUserId: activeModal.userId,
      amount: activeModal.amount,
      currency: 'USD',
      date: new Date(),
      paymentMethod: method,
    };

    addSettlement(input);
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
                        <span className="text-green" style={{ fontWeight: 700, fontSize: 17, marginRight: 12 }}>
                          +{formatCurrency(b.amount)}
                        </span>
                        <motion.button
                          className="remind-btn"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setActiveModal({ userId: b.userId, amount: b.amount, isReceiving: true })}
                        >
                          Remind
                        </motion.button>
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
                        <span className="text-red" style={{ fontWeight: 700, fontSize: 17, marginRight: 12 }}>
                          -{formatCurrency(b.amount)}
                        </span>
                        <motion.button
                          className="pay-btn"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setActiveModal({ userId: b.userId, amount: b.amount, isReceiving: false })}
                        >
                          Pay
                        </motion.button>
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
            userId={activeModal.userId}
            amount={activeModal.amount}
            isReceiving={activeModal.isReceiving}
            onClose={() => setActiveModal(null)}
            onConfirm={handleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
