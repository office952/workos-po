type Versioned = { artifactId: string; supersedesArtifactId: string | null; uploadedAt: string };

/** Where the oldest version of a document comes from, as far as this record can tell. */
export type VersionOrigin = "initial" | "missing" | "unresolved";

export type VersionNode<T> = {
  file: T;
  /** The recorded predecessor, when it is in this record and the link can be followed. */
  parent: T | null;
  /** A number only along a confirmed chain from an initial file; never presumed for a branch or a gap. */
  number: number | null;
  /** Another revision in this record supersedes the same predecessor. */
  parallel: boolean;
  /** A later version in this record supersedes this one. */
  superseded: boolean;
};

/** One document: every version of it, parents before their revisions, siblings oldest first. */
export type VersionTree<T> = { origin: VersionOrigin; linear: boolean; nodes: VersionNode<T>[] };

function byUpload(a: Versioned, b: Versioned): number {
  if (a.uploadedAt !== b.uploadedAt) return a.uploadedAt < b.uploadedAt ? -1 : 1;
  return a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0;
}

/**
 * N-018 / R-005 · the recorded files grouped per document along the server's `supersedesArtifactId`
 * links. Each artifact appears exactly once; two revisions of the same file both stay, under the
 * version they revise. A link to a file missing from the record, or one that loops back, ends the
 * walk instead of being guessed. The order follows upload time, not the position in the response.
 */
export function versionTrees<T extends Versioned>(files: readonly T[]): VersionTree<T>[] {
  const byId = new Map<string, T>();
  for (const file of files) if (!byId.has(file.artifactId)) byId.set(file.artifactId, file);
  const sorted = [...byId.values()].sort(byUpload);
  const parentOf = (file: T) =>
    file.supersedesArtifactId && file.supersedesArtifactId !== file.artifactId ? byId.get(file.supersedesArtifactId) ?? null : null;
  const children = new Map<string, T[]>();
  for (const file of sorted) {
    const parent = parentOf(file);
    if (parent) children.set(parent.artifactId, [...(children.get(parent.artifactId) ?? []), file]);
  }

  const placed = new Set<string>();
  const trees: VersionTree<T>[] = [];
  const grow = (root: T, origin: VersionOrigin) => {
    const visits: { file: T; parent: T | null }[] = [];
    const stack: { file: T; parent: T | null }[] = [{ file: root, parent: null }];
    while (stack.length) {
      const visit = stack.pop()!;
      if (placed.has(visit.file.artifactId)) continue;
      placed.add(visit.file.artifactId);
      visits.push(visit);
      const next = (children.get(visit.file.artifactId) ?? []).filter((child) => !placed.has(child.artifactId));
      for (let index = next.length - 1; index >= 0; index -= 1) stack.push({ file: next[index]!, parent: visit.file });
    }
    const revisions = new Map<string, number>();
    for (const { parent } of visits) if (parent) revisions.set(parent.artifactId, (revisions.get(parent.artifactId) ?? 0) + 1);
    const linear = [...revisions.values()].every((count) => count === 1);
    const nodes = visits.map(({ file, parent }, index) => ({
      file,
      parent,
      number: origin === "initial" && (linear || index === 0) ? index + 1 : null,
      parallel: parent ? revisions.get(parent.artifactId)! > 1 : false,
      superseded: revisions.has(file.artifactId),
    }));
    trees.push({ origin, linear, nodes });
  };

  for (const file of sorted) {
    if (parentOf(file)) continue;
    const link = file.supersedesArtifactId;
    grow(file, link === null ? "initial" : link === file.artifactId ? "unresolved" : "missing");
  }
  // What is left only links in a loop: it is shown from its oldest member, with the link left open.
  for (const file of sorted) {
    if (placed.has(file.artifactId)) continue;
    const walked: T[] = [];
    let cursor: T | null = file;
    while (cursor && !walked.includes(cursor)) {
      walked.push(cursor);
      cursor = parentOf(cursor);
    }
    const loop = cursor ? walked.slice(walked.indexOf(cursor)) : walked;
    grow([...loop].sort(byUpload)[0]!, "unresolved");
  }
  return trees.sort((left, right) => byUpload(left.nodes[0]!.file, right.nodes[0]!.file));
}

/** Versions grouped per document, each artifact once (see `versionTrees`). */
export function fileGroups<T extends Versioned>(files: readonly T[]): T[][] {
  return versionTrees(files).map((tree) => tree.nodes.map((node) => node.file));
}

/**
 * N-018 · the line of revisions one file belongs to, oldest first: the versions it comes from, the
 * file itself, then later versions while there is a single one. A parallel revision is not part of
 * this line, so it is never numbered as if it came after the file.
 */
export function fileVersions<T extends Versioned>(files: readonly T[], artifactId: string): T[] {
  const tree = versionTrees(files).find((candidate) => candidate.nodes.some((node) => node.file.artifactId === artifactId));
  if (!tree) return [];
  const nodeOf = new Map(tree.nodes.map((node) => [node.file.artifactId, node]));
  const line: T[] = [];
  for (let node = nodeOf.get(artifactId); node; node = node.parent ? nodeOf.get(node.parent.artifactId) : undefined) line.unshift(node.file);
  for (;;) {
    const last = line[line.length - 1]!;
    const next = tree.nodes.filter((node) => node.parent?.artifactId === last.artifactId);
    if (next.length !== 1) break;
    line.push(next[0]!.file);
  }
  return line;
}

/** The short mark of a version: „v2” on a confirmed chain, otherwise „rev.” with no presumed number. */
export function versionTag(node: VersionNode<unknown>): string {
  return node.number === null ? "rev." : `v${node.number}`;
}

/**
 * Where a version comes from, in operator words: the initial file, a revision of a named version,
 * or a revision whose predecessor this record cannot show.
 */
export function versionRelation<T extends Versioned>(tree: VersionTree<T>, node: VersionNode<T>, day: (iso: string) => string | null): string {
  if (!node.parent) {
    switch (tree.origin) {
      case "initial":
        return "Fișier inițial";
      case "missing":
        return "Revizie înregistrată · versiunea anterioară nu este în acest dosar";
      case "unresolved":
        return "Revizie înregistrată · legătura cu versiunea anterioară nu poate fi urmată";
      default: {
        const unknown: never = tree.origin;
        return unknown;
      }
    }
  }
  const parent = tree.nodes.find((candidate) => candidate.file.artifactId === node.parent!.artifactId);
  const when = day(node.parent.uploadedAt);
  const source = parent && !parent.parent && tree.origin === "initial" ? "fișierului inițial" : when ? `versiunii din ${when}` : "versiunii anterioare";
  return `${node.parallel ? "Revizie paralelă" : "Revizie"} a ${source}`;
}

/** The version of a file chain the operation is associated with, if the record says so. */
export function associatedVersion<T extends { artifactId: string; usages: readonly { taskId: string }[] }>(
  chain: readonly T[],
  taskId: string | null,
): T | null {
  if (!taskId) return null;
  return chain.find((file) => file.usages.some((usage) => usage.taskId === taskId)) ?? null;
}
