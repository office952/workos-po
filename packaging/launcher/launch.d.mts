export function operatorMessageWscriptInvocation(message: string): {
  file: "wscript.exe";
  args: string[];
};

export function launchWorkos(
  env?: NodeJS.ProcessEnv,
  options?: {
    command?: "start" | "stop" | "status" | "backup";
    openBrowser?: boolean;
  },
): Promise<{
  ok: boolean;
  reused?: boolean;
  code?: string;
  message?: string;
  layout: {
    installDir: string;
    appDir: string;
    nodePath: string;
    entryPath: string;
    staticRoot: string;
    dataRoot: string;
    port: number;
    version: string;
  };
}>;
