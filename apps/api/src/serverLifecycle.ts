export type ClosableHttpServer = {
  close(callback?: (error?: Error) => void): unknown;
};
export function closeHttpServer(server: ClosableHttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (!error) {
        resolve();
        return;
      }
      if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

export async function shutdownApi(
  server: ClosableHttpServer,
  closeResources: () => void,
): Promise<void> {
  await closeHttpServer(server);
  closeResources();
}

export function installProcessShutdown(
  server: ClosableHttpServer,
  closeResources: () => void,
): void {
  let closing = false;
  const onSignal = () => {
    if (closing) {
      return;
    }
    closing = true;
    void shutdownApi(server, closeResources)
      .then(() => {
        console.log("workos-final-api shutdown complete");
        process.exit(0);
      })
      .catch((error) => {
        console.error("workos-final-api shutdown failed", error);
        process.exit(1);
      });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}
