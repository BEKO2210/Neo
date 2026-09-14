import type { SVGProps } from 'react';

export type IconName =
  | 'chat'
  | 'agents'
  | 'nodes'
  | 'github'
  | 'terminal'
  | 'system'
  | 'mic'
  | 'stop'
  | 'send'
  | 'power'
  | 'refresh';

const PATHS: Record<IconName, string> = {
  chat: 'M4 5h16v10H9l-5 4V5z',
  agents: 'M12 3v4m0 10v4M3 12h4m10 0h4M7.5 7.5 5 5m14 0-2.5 2.5M7.5 16.5 5 19m14 0-2.5-2.5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  nodes: 'M5 6h14M5 12h14M5 18h14M7 4v4M17 10v4M9 16v4',
  github:
    'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z',
  terminal: 'M4 5h16v14H4V5zm3 4 3 3-3 3m5 0h5',
  system: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 2',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  stop: 'M7 7h10v10H7z',
  send: 'M20 12 4 4l4 8-4 8 16-8z',
  power: 'M12 4v8m5-5.5a7 7 0 1 1-10 0',
  refresh: 'M4 12a8 8 0 0 1 13.66-5.66L20 8m0-5v5h-5M20 12a8 8 0 0 1-13.66 5.66L4 16m0 5v-5h5',
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  const filled = name === 'github' || name === 'stop' || name === 'send';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
