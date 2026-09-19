import { describe, expect, it } from "vitest";
import {
  SITE_INSTALLATION_SCOPE_ID,
  TRANSPORT_CAPABILITY_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("operational services admin", () => {
  it("starts unconfigured, refuses reserved transport, and versions owner writes", async () => {
    const app = createApp();
    const initial = await readBody(await app.request("/api/operational-services"));
    const capabilities = (initial.services as JsonObject).capabilities as Array<JsonObject>;
    expect(capabilities).toHaveLength(2);
    expect(capabilities[0]).toMatchObject({
      capabilityId: SITE_INSTALLATION_SCOPE_ID,
      configured: false,
      offerMode: null,
      selectable: true,
    });
    expect(capabilities[1]).toMatchObject({
      capabilityId: TRANSPORT_CAPABILITY_ID,
      reserved: true,
      selectable: false,
      offerMode: null,
    });

    const reserved = await app.request(`/api/operational-services/${TRANSPORT_CAPABILITY_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    expect(reserved.status).toBe(400);
    expect((await readBody(reserved)).error).toBe("capability_reserved");

    const written = await app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerMode: "BOTH" }),
      },
    );
    expect(written.status).toBe(200);
    const writtenBody = await readBody(written);
    expect(writtenBody.alreadyApplied).toBe(false);
    expect((writtenBody.record as JsonObject).version).toBe(1);
    expect((writtenBody.record as JsonObject).offerMode).toBe("BOTH");

    const again = await app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerMode: "BOTH" }),
      },
    );
    expect(again.status).toBe(200);
    expect((await readBody(again)).alreadyApplied).toBe(true);

    const disabled = await app.request(
      `/api/operational-services/${SITE_INSTALLATION_SCOPE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerMode: "SERVICE_DISABLED" }),
      },
    );
    expect(disabled.status).toBe(200);
    expect(((await readBody(disabled)).record as JsonObject).version).toBe(2);
  });
});
