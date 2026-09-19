export const LOCAL_PRODUCT_HOST: "127.0.0.1";
export const DEFAULT_LOCAL_PRODUCT_PORT: "8790";

export function resolveLocalProductLaunchEnv(
  source?: NodeJS.ProcessEnv | Record<string, string | undefined>,
  defaults?: {
    defaultLocalRoot?: string;
    staticRoot?: string;
  },
): {
  HOST: "127.0.0.1";
  PORT: string;
  NODE_ENV: "production";
  WORKOS_PUBLIC_ORIGIN: string;
  WORKOS_CLOUD_ROOT: "";
  WORKOS_TRUSTED_ORIGINS: "";
  WORKOS_LOCAL_ROOT: string | undefined;
  WORKOS_STATIC_ROOT: string | undefined;
};
