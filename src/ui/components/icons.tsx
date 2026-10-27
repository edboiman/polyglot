/** Custom line icons, 24px grid, 1.75 stroke. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconHome = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 19v-4.5h4V19" /></svg>
);
export const IconLearn = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 6.5c2.8-1.3 5.5-1.3 8 .3 2.5-1.6 5.2-1.6 8-.3V18c-2.8-1.3-5.5-1.3-8 .3-2.5-1.6-5.2-1.6-8-.3Z" /><path d="M12 6.8v11.5" /></svg>
);
export const IconPractice = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="4" y="7" width="12" height="13" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v11" /><path d="M7.5 12h5M7.5 15.5h3" /></svg>
);
export const IconProgress = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 19h16" /><path d="M7 16v-4M12 16V8M17 16v-6" /></svg>
);
export const IconProfile = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="9" r="3.5" /><path d="M5.5 19.5c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5" /></svg>
);
export const IconSpeaker = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 10v4h3.5L12 18V6L7.5 10Z" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" /></svg>
);
export const IconSlow = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 10v4h3.5L12 18V6L7.5 10Z" /><path d="M16 12h4" /></svg>
);
export const IconMic = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5" /></svg>
);
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M15 5 8 12l7 7" /></svg>
);
export const IconChevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconLock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="5.5" y="10.5" width="13" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
export const IconCards = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3.5" y="6" width="13" height="13" rx="2" transform="rotate(-6 10 12.5)" /><path d="M13 4.5h5.5a2 2 0 0 1 2 2V16" /></svg>
);
export const IconChat = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 6.5h14v9H10l-4 3.5v-3.5H5Z" /><path d="M9 11h6" /></svg>
);
export const IconEar = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M8 9.5a4.5 4.5 0 0 1 9 0c0 2.6-2.5 3.4-2.5 6a2.5 2.5 0 0 1-4.5 1.5" /><path d="M11 10a1.8 1.8 0 0 1 3.4.6c0 1.2-1.4 1.6-1.4 2.6" /></svg>
);
export const IconPuzzle = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 8h3.2a1.8 1.8 0 1 1 3.6 0H15v3.2a1.8 1.8 0 1 0 0 3.6V18H5Z" /></svg>
);
export const IconBook = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 4.5h11v15H7.5A1.5 1.5 0 0 1 6 18Z" /><path d="M6 16.5A1.5 1.5 0 0 1 7.5 15H17" /><path d="M9.5 8h4.5" /></svg>
);
export const IconSpark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2" /></svg>
);
export const IconFlame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 20c3.3 0 5.5-2.3 5.5-5.4 0-3.6-3-5.3-3.5-9.1-2.3 1.3-3.7 3.5-3.6 6-1-.6-1.6-1.6-1.8-2.8C7.5 10.1 6.5 12.4 6.5 14.6 6.5 17.7 8.7 20 12 20Z" /></svg>
);
export const IconBulb = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 17.5h6M10 20.5h4" /><path d="M8.5 14c-1.3-1.1-2-2.6-2-4.3A5.5 5.5 0 0 1 12 4.2a5.5 5.5 0 0 1 5.5 5.5c0 1.7-.7 3.2-2 4.3-.6.5-1 1.2-1 2v.5h-5V16c0-.8-.4-1.5-1-2Z" /></svg>
);
