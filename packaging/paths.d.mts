export const LOCAL_BIND_HOST: "127.0.0.1";
export const DEFAULT_LOCAL_PORT: 8790;

export type ProductIdentity = {
  productName: string;
  packageId: string;
  version: string;
  defaultPort: number;
  bindHost: string;
};

export function readProductIdentity(productJsonPath: string): ProductIdentity;
export function defaultProductJsonPath(): string;
export function installedAppDir(env?: NodeJS.ProcessEnv): string;
export function installedDataDir(env?: NodeJS.ProcessEnv): string;
export function startMenuShortcutDir(env?: NodeJS.ProcessEnv): string;
export function desktopShortcutPath(env?: NodeJS.ProcessEnv): string;
