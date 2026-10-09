import type { Group } from '../types';

interface GroupTileProps {
  group: Pick<Group, 'emoji' | 'color'>;
  size?: number;
}

/** A group's chosen emoji on a pale tint of its colour: square, 6 px corners. */
export default function GroupTile({ group, size = 36 }: GroupTileProps) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 6,
        background: `color-mix(in srgb, ${group.color} 22%, var(--paper))`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
      }}
    >
      {group.emoji}
    </span>
  );
}
