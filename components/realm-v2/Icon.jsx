const paths = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9 20v-6h6v6"/></>,
  checklist: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.4 1.5L7 4.8m-3.5 7.1 1.4 1.5L7 10.7m-3.5 7.2 1.4 1.5L7 16.7"/></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M5.5 8h1M11.5 8h1m5 0h1"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7V2Z"/>,
  command: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 9 3 3-3 3m5 0h3"/></>,
  inbox: <><path d="M4 5h16l1 11H15l-2 3h-2l-2-3H3L4 5Z"/><path d="M4 13h5l2 3h2l2-3h5"/></>,
  folder: <path d="M3 6.5h7l2-2h9v15H3v-13Z"/>,
  timeline: <><path d="M6 3v18M6 7h11M6 12h8M6 17h11"/><circle cx="6" cy="7" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="6" cy="17" r="1.5"/></>,
  people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6m0-5c3 0 5 1.5 5 4.5"/></>,
  map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16m6-14v16"/></>,
  brief: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3m-12 5h18M10 12v2h4v-2"/></>,
  person: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.5-5 3-7 8-7s7.5 2 8 7"/></>,
  ledger: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/></>,
  approval: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"/><path d="M10 20h4"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.1-.7a7 7 0 0 0-.7-1.7l1-2-2.1-2.1-2 1a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2.1a7 7 0 0 0-1.7.7l-2-1L1 5.9l1 2a7 7 0 0 0-.7 1.7L0 10.5v3l2.1.7c.2.6.4 1.2.7 1.7l-1 2L3.9 20l2-1c.5.3 1.1.5 1.7.7l.9 2.3h3l.7-2.1c.6-.2 1.2-.4 1.7-.7l2 1 2.1-2.1-1-2c.3-.5.5-1.1.7-1.7L19 13.5Z" transform="translate(2) scale(.9)"/></>,
  mobile: <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  panel: <><path d="M4 5h16v14H4zM9 5v14"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  close: <path d="M5 5l14 14M19 5 5 19"/>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18.5 17a8 8 0 1 1 .5-9l1 4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>,
  sort: <path d="M8 4v16m0 0-3-3m3 3 3-3m5 3V4m0 0-3 3m3-3 3 3"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6m-6 4h3"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></>,
  warning: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  offline: <><path d="M4 7c5-4 11-4 16 0M7 11c3.5-2.5 6.5-2.5 10 0m-7 4c1.5-1 2.5-1 4 0"/><path d="M3 3l18 18"/></>,
  eyeOff: <><path d="M3 12s3.5-6 9-6 9 6 9 6-1.5 2.5-3.8 4.2M10 17.8c-4.3-.8-7-5.8-7-5.8"/><path d="M3 3l18 18"/></>,
  chat: <path d="M4 4h16v13H9l-5 4V4Z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></>,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/>,
  cash: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-1-4.8-1.2-5.6.5-1.3 2.8 6.5 1.7 5.5 5.5-.5 2-4.8 2.3-6 0M12 5v14"/></>,
};

export default function Icon({ name, size = 20, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name] || paths.dot}
    </svg>
  );
}
