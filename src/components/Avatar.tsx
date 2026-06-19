import { User } from '../types';

interface AvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showRing?: boolean;
}

const sizes = {
  sm: { container: 28, font: 10 },
  md: { container: 36, font: 13 },
  lg: { container: 46, font: 16 },
  xl: { container: 60, font: 20 },
};

export default function Avatar({ user, size = 'md', showRing = false }: AvatarProps) {
  const s = sizes[size];

  return (
    <div
      style={{
        width: s.container,
        height: s.container,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${user.avatarColor}cc, ${user.avatarColor}88)`,
        border: showRing
          ? `2px solid ${user.avatarColor}60`
          : '1.5px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: s.font,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.95)',
        letterSpacing: '0.5px',
        flexShrink: 0,
        boxShadow: showRing
          ? `0 0 0 3px ${user.avatarColor}30, 0 4px 12px rgba(0,0,0,0.3)`
          : '0 2px 8px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {user.initials}
    </div>
  );
}
