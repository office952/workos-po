export function RecordIcon({ kind }: { kind: 'file' | 'hours' | 'people' | 'history' | 'machine' | 'check' | 'link' }) {
  const paths = {
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
    hours: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>,
    history: <><path d="M4 8a9 9 0 1 1-1 8M4 3v5h5M12 7v5l4 2"/></>,
    machine: <path d="M3 21V4h18v17H3M3 17h18M8 4v5h8V4M12 9v5M7 21v-4M17 21v-4"/>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
    link: <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>,
  };
  return <svg className="job-record__icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

export function Heading({ icon, children }: { icon: Parameters<typeof RecordIcon>[0]['kind']; children: React.ReactNode }) {
  return <h2><RecordIcon kind={icon}/>{children}</h2>;
}
