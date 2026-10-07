import { TransportError } from "../api/http";

export function presentResourceAccess(error: unknown): "denied" | "error" {
  if (error instanceof TransportError && (error.status === 401 || error.status === 403)) {
    return "denied";
  }
  return "error";
}
