export function installWorkos(
  env?: NodeJS.ProcessEnv,
  options?: {
    packageRoot?: string;
    installDir?: string;
    dataRoot?: string;
    startMenuDir?: string;
    desktopPath?: string;
    desktopShortcut?: boolean;
    preUpgradeBackup?: boolean;
  },
): Promise<{
  ok: boolean;
  upgraded?: boolean;
  installDir: string;
  dataRoot: string;
  version?: string;
  startMenuShortcut?: boolean;
  desktopShortcut?: boolean;
  code?: string;
  message?: string;
}>;
