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
    try {
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
    } catch (error) {
      setError(
        error instanceof Error && error.message === "session_context_changed"
          ? "Sesiunea s-a schimbat. Descărcarea s-a oprit. Poți reîncerca după ce revii în organizație."
          : "Conexiunea sau citirea a eșuat. Poți reîncerca descărcarea.",
      );
    }
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
