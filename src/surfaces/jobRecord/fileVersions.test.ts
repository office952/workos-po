import { describe, expect, it } from "vitest";
import { fileGroups, fileVersions, versionRelation, versionTag, versionTrees, type VersionTree } from "./fileVersions";

type F = { artifactId: string; supersedesArtifactId: string | null; uploadedAt: string };

const at = (minute: number) => `2026-10-23T08:${String(minute).padStart(2, "0")}:00.000Z`;
const f = (artifactId: string, supersedesArtifactId: string | null, minute: number): F => ({ artifactId, supersedesArtifactId, uploadedAt: at(minute) });
const ids = (groups: readonly (readonly F[])[]) => groups.map((group) => group.map((file) => file.artifactId));
const day = (iso: string) => iso.slice(0, 10);
/** id · tag · relation, the way both surfaces read a tree. */
const read = (tree: VersionTree<F>) => tree.nodes.map((node) => `${node.file.artifactId} · ${versionTag(node)} · ${versionRelation(tree, node, day)}`);
const everyIdOnce = (files: readonly F[]) => {
  const shown = fileGroups(files).flat().map((file) => file.artifactId);
  expect(shown).toHaveLength(new Set(files.map((file) => file.artifactId)).size);
  expect(new Set(shown)).toEqual(new Set(files.map((file) => file.artifactId)));
};

const v1 = f("v1", null, 0);
const a = f("a", "v1", 1);
const b = f("b", "v1", 2);

describe("file versions · confirmed chains keep their numbers", () => {
  it("a single file is its own initial version", () => {
    const [tree] = versionTrees([v1]);
    expect(tree).toMatchObject({ origin: "initial", linear: true });
    expect(read(tree!)).toEqual(["v1 · v1 · Fișier inițial"]);
    expect(fileVersions([v1], "v1")).toEqual([v1]);
  });

  it("a chain of 2 and of 3 versions is numbered along its links", () => {
    expect(read(versionTrees([v1, a])[0]!)).toEqual(["v1 · v1 · Fișier inițial", "a · v2 · Revizie a fișierului inițial"]);
    const c = f("c", "a", 3);
    const [tree] = versionTrees([v1, a, c]);
    expect(tree!.nodes.map((node) => [node.file.artifactId, node.number, node.superseded, node.parallel])).toEqual([
      ["v1", 1, true, false],
      ["a", 2, true, false],
      ["c", 3, false, false],
    ]);
    expect(fileVersions([v1, a, c], "a")).toEqual([v1, a, c]);
  });
});

describe("file versions · branching (UX-S1)", () => {
  it("shows both revisions of the same predecessor, each artifact exactly once", () => {
    const groups = fileGroups([v1, a, b]);
    expect(ids(groups)).toEqual([["v1", "a", "b"]]);
    everyIdOnce([v1, a, b]);
  });

  it("names parallel revisions by what they revise, with no presumed v2 / v3", () => {
    const [tree] = versionTrees([v1, a, b]);
    expect(tree).toMatchObject({ origin: "initial", linear: false });
    expect(read(tree!)).toEqual([
      "v1 · v1 · Fișier inițial",
      "a · rev. · Revizie paralelă a fișierului inițial",
      "b · rev. · Revizie paralelă a fișierului inițial",
    ]);
    expect(tree!.nodes.every((node) => node.number === null || node.number === 1)).toBe(true);
  });

  it("keeps the real links when each branch has its own continuation", () => {
    const a1 = f("a1", "a", 3);
    const b1 = f("b1", "b", 4);
    const [tree] = versionTrees([v1, a, b, a1, b1]);
    expect(tree!.nodes.map((node) => [node.file.artifactId, node.parent?.artifactId ?? null])).toEqual([
      ["v1", null],
      ["a", "v1"],
      ["a1", "a"],
      ["b", "v1"],
      ["b1", "b"],
    ]);
    expect(read(tree!).slice(2)).toEqual([
      "a1 · rev. · Revizie a versiunii din 2026-10-23",
      "b · rev. · Revizie paralelă a fișierului inițial",
      "b1 · rev. · Revizie a versiunii din 2026-10-23",
    ]);
    everyIdOnce([v1, a, b, a1, b1]);
  });

  it("does not depend on the order the files arrive in", () => {
    expect(ids(fileGroups([b, a, v1]))).toEqual([["v1", "a", "b"]]);
    const other = f("o1", null, 5);
    expect(ids(fileGroups([other, b, a, v1]))).toEqual(ids(fileGroups([v1, a, b, other])));
  });

  it("gives each branch its own line, never the sibling's", () => {
    expect(fileVersions([v1, a, b], "b").map((file) => file.artifactId)).toEqual(["v1", "b"]);
    expect(fileVersions([v1, a, b], "a").map((file) => file.artifactId)).toEqual(["v1", "a"]);
    expect(fileVersions([v1, a, b], "v1").map((file) => file.artifactId)).toEqual(["v1"]);
  });
});

describe("file versions · gaps and anomalous links", () => {
  it("a revision whose predecessor is not in the record gets no presumed number", () => {
    const orphan = f("r", "absent", 1);
    const next = f("r2", "r", 2);
    const [tree] = versionTrees([orphan, next]);
    expect(tree).toMatchObject({ origin: "missing", linear: true });
    expect(tree!.nodes.map((node) => node.number)).toEqual([null, null]);
    expect(versionRelation(tree!, tree!.nodes[0]!, day)).toBe("Revizie înregistrată · versiunea anterioară nu este în acest dosar");
  });

  it("a loop or a self link ends the walk without losing a file", () => {
    const x = f("x", "y", 1);
    const y = f("y", "x", 2);
    const self = f("s", "s", 3);
    const tail = f("t", "y", 4);
    const trees = versionTrees([tail, self, y, x]);
    expect(trees.map((tree) => [tree.origin, tree.nodes.map((node) => node.file.artifactId)])).toEqual([
      ["unresolved", ["x", "y", "t"]],
      ["unresolved", ["s"]],
    ]);
    expect(trees.flatMap((tree) => tree.nodes.map((node) => node.number))).toEqual([null, null, null, null]);
    expect(versionRelation(trees[0]!, trees[0]!.nodes[0]!, day)).toBe("Revizie înregistrată · legătura cu versiunea anterioară nu poate fi urmată");
    everyIdOnce([tail, self, y, x]);
    expect(fileVersions([x, y], "y").map((file) => file.artifactId)).toEqual(["x", "y"]);
  });

  it("a duplicated artifact in the response is shown once", () => {
    expect(ids(fileGroups([v1, a, { ...a }]))).toEqual([["v1", "a"]]);
  });
});
