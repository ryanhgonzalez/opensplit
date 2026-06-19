import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';
import './Onboarding.css';

const features = [
  { icon: '💸', title: 'Track shared expenses', body: 'Log any expense and split it any way you like — equally, by amount, or by percentage.' },
  { icon: '👥', title: 'Settle up with friends', body: 'See exactly who owes what at a glance and record payments when debts are cleared.' },
  { icon: '📊', title: 'Understand your spending', body: 'Charts and breakdowns show where your money goes across all your groups.' },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

export default function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const [name, setName] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    completeOnboarding(trimmed);
  };

  return (
    <div className="ob-root">
      {/* Decorative orbs */}
      <div className="ob-orb ob-orb-1" />
      <div className="ob-orb ob-orb-2" />

      <motion.div
        className="ob-card"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Logo mark */}
        <motion.div className="ob-logo-wrap" variants={item}>
          <div className="ob-logo">💰</div>
        </motion.div>

        {/* Heading */}
        <motion.div className="ob-heading" variants={item}>
          <h1 className="ob-title">Welcome to Splitify</h1>
          <p className="ob-subtitle">Split expenses with anyone, settle up without the awkwardness.</p>
        </motion.div>

        {/* Feature highlights */}
        <motion.div className="ob-features" variants={item}>
          {features.map((f) => (
            <div className="ob-feature" key={f.title}>
              <span className="ob-feature-icon">{f.icon}</span>
              <div>
                <p className="ob-feature-title">{f.title}</p>
                <p className="ob-feature-body">{f.body}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Name input */}
        <motion.div className="ob-form" variants={item}>
          <label className="ob-label" htmlFor="ob-name">What should we call you?</label>
          <input
            id="ob-name"
            className="ob-input"
            type="text"
            placeholder="Your name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
            autoComplete="given-name"
            maxLength={40}
          />
          <motion.button
            className="ob-cta"
            onClick={handleSubmit}
            disabled={!name.trim()}
            whileTap={{ scale: 0.97 }}
          >
            Get Started
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
