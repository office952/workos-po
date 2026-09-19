export function collectProductionPackages(
  startDir: string,
  names: string[],
): Map<string, string>;
export function compileProductionArtifacts(): void;
export function isPlaceholderOnlyFrontend(html: string): boolean;
export function assertCanonicalFrontend(indexHtmlPath: string): void;
export function buildLocalPackage(options?: {
  destRoot?: string;
  frontendRoot?: string;
  frontendMode?: "canonical" | "TEST_FIXTURE" | "SYNTHETIC";
  rebuildFrontend?: boolean;
  skipFrontendBuild?: boolean;
}): {
  destRoot: string;
  appDir: string;
  version: string;
  nodePath: string;
  sqliteBindings: string[];
  frontendPackaged: boolean;
  frontendMode: "canonical" | "TEST_FIXTURE";
  frontendRoot: string;
};
