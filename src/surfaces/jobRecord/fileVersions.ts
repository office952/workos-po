/**
 * N-018 · the versions of one file, oldest first, following only the `supersedesArtifactId`
 * links the server records. A version without links is its own single-item chain.
 */
export function fileVersions<T extends { artifactId: string; supersedesArtifactId: string | null }>(
  files: readonly T[],
  artifactId: string,
): T[] {
  const byId = new Map(files.map((file) => [file.artifactId, file]));
  let root = byId.get(artifactId);
  if (!root) return [];
  const seen = new Set<string>([root.artifactId]);
  while (root.supersedesArtifactId && byId.has(root.supersedesArtifactId) && !seen.has(root.supersedesArtifactId)) {
    root = byId.get(root.supersedesArtifactId)!;
    seen.add(root.artifactId);
  }
  const chain: T[] = [root];
  const visited = new Set<string>([root.artifactId]);
  for (;;) {
    const last = chain[chain.length - 1]!;
    const next = files.find((file) => file.supersedesArtifactId === last.artifactId && !visited.has(file.artifactId));
    if (!next) break;
    visited.add(next.artifactId);
    chain.push(next);
  }
  return chain;
}

/** The version of a file chain the operation is associated with, if the record says so. */
export function associatedVersion<T extends { artifactId: string; usages: readonly { taskId: string }[] }>(
  chain: readonly T[],
  taskId: string | null,
): T | null {
  if (!taskId) return null;
  return chain.find((file) => file.usages.some((usage) => usage.taskId === taskId)) ?? null;
}
