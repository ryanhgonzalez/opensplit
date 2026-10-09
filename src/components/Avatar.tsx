import { User } from '../types';

interface AvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Adds a paper-coloured ring, for avatars that overlap in a stack. */
  showRing?: boolean;
}

const sizes = {
  sm: { container: 28, font: 11 },
  md: { container: 36, font: 13 },
  lg: { container: 44, font: 16 },
  xl: { container: 56, font: 20 },
};

/**
 * A person's initials on a pale tint of their colour.
 *
 * The stored colour is saturated; mixing it into the page background gives the
 * Ledger tint in either theme while keeping each person recognisable.
 */
export default function Avatar({ user, size = 'md', showRing = false }: AvatarProps) {
  const s = sizes[size];

  return (
    <div
      aria-hidden
      style={{
        width: s.container,
        height: s.container,
        borderRadius: '50%',
        background: `color-mix(in srgb, ${user.avatarColor} 22%, var(--paper))`,
        border: showRing ? '2px solid var(--paper)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: s.font,
        fontWeight: 600,
        color: 'var(--ink)',
        flexShrink: 0,
      }}
    >
      {user.initials}
    </div>
  );
}
