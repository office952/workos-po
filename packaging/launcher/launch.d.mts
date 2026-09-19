export function operatorMessageWscriptInvocation(message: string): {
  file: "wscript.exe";
  args: string[];
};

export type WorkosLaunchLayout = {
  installDir: string;
  appDir: string;
  nodePath: string;
  entryPath: string;
  staticRoot: string;
  dataRoot: string;
  port: number;
  version: string;
};

export function resolveLayout(
  env?: NodeJS.ProcessEnv,
  options?: {
    installDir?: string;
    launcherPath?: string;
  },
): WorkosLaunchLayout;

export function launchWorkos(
  env?: NodeJS.ProcessEnv,
  options?: {
    command?: "start" | "stop" | "status" | "backup";
    openBrowser?: boolean;
    installDir?: string;
    launcherPath?: string;
  },
): Promise<{
  ok: boolean;
  reused?: boolean;
  code?: string;
  message?: string;
  layout: WorkosLaunchLayout;
}>;
