export type CollectionStatus = "idle" | "loading" | "success" | "error";

export type CollectionViewState =
  | "loading"
  | "error"
  | "empty"
  | "filtered-empty"
  | "ready"
  | "refreshing";

export function collectionViewState(
  status: CollectionStatus,
  itemCount: number,
  visibleCount: number,
): CollectionViewState {
  if (status === "error" && itemCount === 0) {
    return "error";
  }
  if ((status === "idle" || status === "loading") && itemCount === 0) {
    return "loading";
  }
  if (status === "success" && itemCount === 0) {
    return "empty";
  }
  if (itemCount > 0 && visibleCount === 0) {
    return "filtered-empty";
  }
  if (visibleCount > 0 && status === "loading") {
    return "refreshing";
  }
  if (visibleCount > 0) {
    return "ready";
  }
  return "loading";
}
