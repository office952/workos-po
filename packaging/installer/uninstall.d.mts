export function uninstallWorkos(
  env?: NodeJS.ProcessEnv,
  options?: {
    installDir?: string;
    dataRoot?: string;
    startMenuDir?: string;
    desktopPath?: string;
    purgeData?: boolean;
  },
): Promise<{
  ok: boolean;
  installDir: string;
  dataRoot: string;
  dataPreserved: boolean;
  purgedData?: boolean;
}>;
