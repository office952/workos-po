export function windowsSystem32(fileName: string, env?: NodeJS.ProcessEnv): string;
export function userShortcutArguments(hiddenVbs: string, installDir: string, command: string): string;
export function operatorMessageWscriptArgs(showMessageVbs: string, message: string): string[];
export function createShortcut(
  shortcutPath: string,
  target: string,
  args: string,
  workingDir: string,
  description: string,
): boolean;
export function inspectShortcut(shortcutPath: string): {
  TargetPath: string;
  Arguments: string;
  WorkingDirectory: string;
  WindowStyle: number;
} | null;
export function runUserFacingHiddenLaunch(
  hiddenVbs: string,
  installDir: string,
  command: string,
  env?: NodeJS.ProcessEnv,
  options?: { wait?: boolean },
): { unref: () => void; on: (event: string, listener: (...args: unknown[]) => void) => void };
