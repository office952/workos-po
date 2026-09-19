import type { ReactNode } from "react";

type RecordLinkProps = {
  href: string;
  title: string;
  meta?: string;
  detail?: string;
  status?: ReactNode;
};

export function RecordLink({ href, title, meta, detail, status }: RecordLinkProps) {
  return (
    <a className="list-row" href={href}>
      <span className="list-row__main">
        <span className="list-row__id">{meta ?? ""}</span>
        <span className="list-row__label">
          {title}
          {detail ? ` · ${detail}` : ""}
        </span>
      </span>
      {status}
    </a>
  );
}
