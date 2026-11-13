const paths = {
  home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M12 7v2m0 2v2m0 2v2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h2m4 0h2m-8 3h2"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  settings: <><path d="M10 3h4l.6 2.2 2 .8 2-.9 2.8 2.8-.9 2 .8 2L23 12l-1.7 1.1-.8 2 .9 2-2.8 2.8-2-.9-2 .8L14 22h-4l-.6-2.2-2-.8-2 .9-2.8-2.8.9-2-.8-2L1 12l1.7-1.1.8-2-.9-2L5.4 4l2 .9 2-.8z"/><circle cx="12" cy="12" r="3"/></>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  back: <path d="m15 18-6-6 6-6"/>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4m-6-4h10"/></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
  plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  sport: <><circle cx="12" cy="12" r="9"/><path d="m12 5 3 3-1 4h-4L9 8zm-7 5 4 2m6 0 4-2M8 18l2-6m4 0 2 6"/></>,
  graduation: <><path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5m4-3v7"/></>,
};

export default function Icon({ name, size = 24, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.ticket}</svg>;
}
