import { LOCAL_LOOPBACK_HOST } from "./host.js";

export const DEFAULT_LOCAL_PRODUCT_PORT = "8790";

export function resolveLocalProductLaunchEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = {},
  defaults: { defaultLocalRoot?: string; staticRoot?: string } = {},
): {
  HOST: typeof LOCAL_LOOPBACK_HOST;
  PORT: string;
  NODE_ENV: "production";
  WORKOS_PUBLIC_ORIGIN: string;
  WORKOS_CLOUD_ROOT: "";
  WORKOS_TRUSTED_ORIGINS: "";
  WORKOS_LOCAL_ROOT: string | undefined;
  WORKOS_STATIC_ROOT: string | undefined;
} {
  const cloudRoot = source.WORKOS_CLOUD_ROOT?.trim() ?? "";
  if (cloudRoot) {
    throw new Error("WORKOS_CLOUD_ROOT cannot be set for Local WorkOS. Cloud and Local stay separate.");
  }

  const port = source.PORT?.trim() || DEFAULT_LOCAL_PRODUCT_PORT;
  const localRoot = source.WORKOS_LOCAL_ROOT?.trim() || defaults.defaultLocalRoot;
  const staticRoot = source.WORKOS_STATIC_ROOT?.trim() || defaults.staticRoot;

  return {
    HOST: LOCAL_LOOPBACK_HOST,
    PORT: port,
    NODE_ENV: "production",
    WORKOS_PUBLIC_ORIGIN: `http://${LOCAL_LOOPBACK_HOST}:${port}`,
    WORKOS_CLOUD_ROOT: "",
    WORKOS_TRUSTED_ORIGINS: "",
    WORKOS_LOCAL_ROOT: localRoot,
    WORKOS_STATIC_ROOT: staticRoot,
  };
}
