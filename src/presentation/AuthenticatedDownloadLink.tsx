import { useState, type MouseEvent, type ReactNode } from "react";
import { fetchDownload } from "../api/http";
import { triggerBrowserDownload } from "./download";

export function AuthenticatedDownloadLink({
  href,
  children,
  className = "text-link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  async function onClick(event: MouseEvent<HTMLAnchorElement>): Promise<void> {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setError(null);
    const result = await fetchDownload(href);
    if (!result.ok) {
      setError(
        result.status === 401 || result.status === 403
          ? "Descărcarea cere o sesiune autentificată."
          : "Fișierul nu a putut fi descărcat. Poți reîncerca.",
      );
      return;
    }
    triggerBrowserDownload(result.blob, result.filename ?? "document");
  }

  return (
    <>
      <a
        className={className}
        href={href}
        data-authenticated-download=""
        onClick={(event) => {
          void onClick(event);
        }}
      >
        {children}
      </a>
      {error ? (
        <span className="authenticated-download__error" role="status">
          {error}
        </span>
      ) : null}
    </>
  );
}
