/**
 * N-020 · the small stroke icons of the client dossier (Figma page 10, components N020/Icon/*).
 * Decorative: the text next to them always carries the meaning.
 */
const PATHS = {
  site: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  history: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2",
  project: "M3 7h6l2 2h10v10H3z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  photo: "M3 6h18v13H3zM3 15l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  check: "M5 12.5 10 17l9-10",
  hourglass: "M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9",
  progress: "M12 3a9 9 0 1 0 0 18V3Z M12 3a9 9 0 0 1 0 18",
  wrench: "M14.5 5.5a4 4 0 0 0-5.3 5.3L4 16l4 4 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.8-.7-.7-2.8z",
  offer: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  request: "M4 5h16v11H9l-5 4z",
  open: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  filter: "M4 6h16M7 12h10M10 18h4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  warning: "M12 4 3 20h18zM12 10v4M12 17h.01",
  document: "M7 3h7l4 4v14H7zM14 3v4h4",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  phone: "M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z",
  mail: "M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6",
} as const;

export type DossierIconName = keyof typeof PATHS;

export function DossierIcon({ name, size = 16 }: { name: DossierIconName; size?: number }) {
  return (
    <svg className="dicon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
