import { quoteHref } from "../routing/appRoute";

export function quoteHrefFromSnapshotIdentity(
  quoteSnapshotId: string | null | undefined,
  productCode?: string | null,
): string | null {
  if (!quoteSnapshotId) {
    return null;
  }
  const product = productCode?.trim() || productCodeFromQuoteSnapshotId(quoteSnapshotId);
  if (!product) {
    return null;
  }
  return quoteHref(product, quoteSnapshotId);
}

export function quoteHrefFromEngineHref(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }
  const path = href.split("?")[0] ?? "";
  const match = path.match(/^\/quotes\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }
  return quoteHrefFromSnapshotIdentity(decodeURIComponent(match[1]));
}

function productCodeFromQuoteSnapshotId(quoteSnapshotId: string): string | null {
  const parts = quoteSnapshotId.split(":");
  if (parts[0] === "qts" && parts.length >= 3 && parts[1]) {
    return parts[1];
  }
  return null;
}
