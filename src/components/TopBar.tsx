import { ReactNode } from 'react';
import './TopBar.css';

interface TopBarProps {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  transparent?: boolean;
}

export default function TopBar({ title, left, right, transparent = false }: TopBarProps) {
  return (
    <div className={`top-bar ${transparent ? 'top-bar-transparent' : ''}`}>
      <div className="top-bar-left">{left}</div>
      {title && <h4 className="top-bar-title">{title}</h4>}
      <div className="top-bar-right">{right}</div>
    </div>
  );
}
