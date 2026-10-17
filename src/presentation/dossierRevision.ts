export function laterDocumentVersions<T extends { artifactId: string; supersedesArtifactId?: string | null }>(
  selectedArtifactId: string | null | undefined,
  candidates: readonly T[],
): T[] {
  if (!selectedArtifactId) {
    return [];
  }
  const seen = new Set<string>();
  return candidates.filter((file) => {
    if (file.artifactId === selectedArtifactId || file.supersedesArtifactId !== selectedArtifactId) {
      return false;
    }
    if (seen.has(file.artifactId)) {
      return false;
    }
    seen.add(file.artifactId);
    return true;
  });
}
