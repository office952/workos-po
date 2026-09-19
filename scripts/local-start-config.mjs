export const LOCAL_PRODUCT_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_PRODUCT_PORT = "8790";

export function resolveLocalProductLaunchEnv(
  source = {},
  defaults = {},
) {
  const cloudRoot = typeof source.WORKOS_CLOUD_ROOT === "string" ? source.WORKOS_CLOUD_ROOT.trim() : "";
  if (cloudRoot) {
    throw new Error("WORKOS_CLOUD_ROOT cannot be set for Local WorkOS. Cloud and Local stay separate.");
  }

  const port =
    typeof source.PORT === "string" && source.PORT.trim().length > 0
      ? source.PORT.trim()
      : DEFAULT_LOCAL_PRODUCT_PORT;
  const localRoot =
    typeof source.WORKOS_LOCAL_ROOT === "string" && source.WORKOS_LOCAL_ROOT.trim().length > 0
      ? source.WORKOS_LOCAL_ROOT.trim()
      : defaults.defaultLocalRoot;
  const staticRoot =
    typeof source.WORKOS_STATIC_ROOT === "string" && source.WORKOS_STATIC_ROOT.trim().length > 0
      ? source.WORKOS_STATIC_ROOT.trim()
      : defaults.staticRoot;

  return {
    HOST: LOCAL_PRODUCT_HOST,
    PORT: port,
    NODE_ENV: "production",
    WORKOS_PUBLIC_ORIGIN: `http://${LOCAL_PRODUCT_HOST}:${port}`,
    WORKOS_CLOUD_ROOT: "",
    WORKOS_TRUSTED_ORIGINS: "",
    WORKOS_LOCAL_ROOT: localRoot,
    WORKOS_STATIC_ROOT: staticRoot,
  };
}
