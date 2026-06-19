import { ReactNode, MouseEventHandler } from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  variant?: 'default' | 'strong' | 'green' | 'red' | 'blue';
  padding?: string;
  style?: React.CSSProperties;
}

const variantClass: Record<string, string> = {
  default: 'glass',
  strong: 'glass glass-strong',
  green: 'glass glass-green',
  red: 'glass glass-red',
  blue: 'glass glass-blue',
};

export default function GlassCard({
  children,
  className = '',
  onClick,
  variant = 'default',
  padding = '16px',
  style,
}: GlassCardProps) {
  return (
    <motion.div
      className={`${variantClass[variant]} ${className}`}
      style={{ padding, ...style }}
      onClick={onClick}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
    >
      {children}
    </motion.div>
  );
}
