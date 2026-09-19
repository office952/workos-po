export function httpPathIdentity(path: string, prefix: string, suffix = ""): string {
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  const identity = suffix && rest.endsWith(suffix) ? rest.slice(0, -suffix.length) : rest;
  try {
    return decodeURIComponent(identity);
  } catch {
    return identity;
  }
}
