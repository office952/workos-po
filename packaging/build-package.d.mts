export function compileProductionArtifacts(): void;
export function buildLocalPackage(options?: {
  destRoot?: string;
  frontendRoot?: string;
}): {
  destRoot: string;
  appDir: string;
  version: string;
  nodePath: string;
  sqliteBindings: string[];
  frontendPackaged: boolean;
};
