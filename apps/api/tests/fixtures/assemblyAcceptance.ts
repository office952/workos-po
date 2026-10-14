type Requester = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

/** Accepts the assembly's current frozen quote by the exact snapshot identity the server reports. */
export async function acceptCurrentAssemblyQuote(
  app: Requester,
  assemblyId: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const view = await app.request(`/api/assemblies/${assemblyId}`, { headers });
  const body = (await view.json()) as { assembly?: { quoteSnapshotId?: unknown } };
  return app.request(`/api/assemblies/${assemblyId}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ quoteSnapshotId: body.assembly?.quoteSnapshotId ?? null }),
  });
}
