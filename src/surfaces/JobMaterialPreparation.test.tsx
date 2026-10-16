import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobMaterialPreparationTransport } from "../api/jobMaterials";
import { resetResourceCache } from "../data/resourceCache";
import { JobMaterialPreparation } from "./JobMaterialPreparation";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const preparation: { preparation: JobMaterialPreparationTransport } = {
  preparation: {
    jobId: "job-1",
    planId: "exp:1",
    lines: [
      {
        resourceId: "MAT-LED-MODULE",
        label: "Modul LED 12V",
        unit: "buc",
        estimatedQuantity: 125,
        taskIds: ["task-led"],
        canCheck: true,
        latestCheck: {
          status: "MISSING",
          checkedByLabel: "Maria Ansamblu Demo",
          checkedAt: "2026-10-16T01:39:00.000Z",
        },
        openRequest: {
          requestId: "mreq:secret-id",
          requestedQuantity: 140,
          unit: "buc",
          status: "REQUESTED",
          requestedByLabel: "Maria Ansamblu Demo",
          requestedAt: "2026-10-16T01:39:00.000Z",
          requiresReview: false,
        },
      },
    ],
  },
};

describe("JobMaterialPreparation", () => {
  it("shows the estimate, the saved operator name and no internal request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({
            operator: { personId: "per:maria", displayName: "Maria Ansamblu Demo" },
          });
        }
        return jsonResponse(preparation);
      }),
    );

    render(<JobMaterialPreparation jobId="job-1" />);

    expect(await screen.findByText("Modul LED 12V")).toBeInTheDocument();
    expect(screen.getByText(/Necesar estimat: 125/)).toBeInTheDocument();
    expect(screen.queryByText(/Necesar estimat total pe lucrare/)).not.toBeInTheDocument();
    expect(screen.getByText(/Verificat de Maria Ansamblu Demo/)).toBeInTheDocument();
    expect(screen.getByText("Insuficient")).toBeInTheDocument();
    expect(screen.getByText(/Avertisment: materialul nu este suficient/)).toBeInTheDocument();
    expect(screen.getByText(/Aprovizionare solicitată · 140 buc/)).toBeInTheDocument();
    expect(screen.getByText(/Nu este o comandă/)).toBeInTheDocument();
    expect(screen.queryByText(/mreq:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Semnalează necesar de aprovizionare" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("stays quiet on an operation whose demands are not job materials", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: null });
      }
      return jsonResponse(preparation);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <JobMaterialPreparation jobId="job-quiet" onlyResourceIds={["SVC-PLACE-LED-MODULES"]} />,
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("material-preparation"))).toBe(true);
    });
    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByText("Nu există materiale planificate în această selecție.")).not.toBeInTheDocument();
  });

  it("names the job total on the current operation and asks for review after availability", async () => {
    const reviewed = structuredClone(preparation);
    const line = reviewed.preparation.lines[0];
    if (!line?.latestCheck || !line.openRequest) {
      throw new Error("fixture");
    }
    line.latestCheck.status = "AVAILABLE";
    line.openRequest.requiresReview = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-session")) {
          return jsonResponse({ operator: null });
        }
        return jsonResponse(reviewed);
      }),
    );

    render(<JobMaterialPreparation jobId="job-1" onlyResourceIds={["MAT-LED-MODULE"]} />);

    expect(await screen.findByRole("heading", { name: "Materiale pentru operație" })).toBeInTheDocument();
    expect(screen.getByText(/Necesar estimat total pe lucrare: 125/)).toBeInTheDocument();
    expect(screen.getByText(/Solicitare de revizuit · 140 buc/)).toBeInTheDocument();
    expect(screen.queryByText(/Nu este o comandă/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Avertisment: materialul nu este suficient/)).not.toBeInTheDocument();
  });

  it("signals replenishment without a purchase quantity", async () => {
    const unchecked = structuredClone(preparation);
    const line = unchecked.preparation.lines[0];
    if (!line) {
      throw new Error("fixture");
    }
    line.latestCheck = null;
    line.openRequest = null;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: { personId: "per:maria", displayName: "Maria Ansamblu Demo" },
        });
      }
      if (init?.method === "POST") {
        const saved = structuredClone(unchecked);
        const savedLine = saved.preparation.lines[0];
        if (!savedLine) {
          throw new Error("fixture");
        }
        savedLine.latestCheck = {
          status: "MISSING",
          checkedByLabel: "Maria Ansamblu Demo",
          checkedAt: "2026-10-16T01:39:00.000Z",
        };
        savedLine.openRequest = {
          requestId: "mreq:secret-id",
          requestedQuantity: null,
          unit: "buc",
          status: "REQUESTED",
          requestedByLabel: "Maria Ansamblu Demo",
          requestedAt: "2026-10-16T01:39:00.000Z",
          requiresReview: false,
        };
        return jsonResponse({ alreadyApplied: false, preparation: saved.preparation });
      }
      return jsonResponse(unchecked);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<JobMaterialPreparation jobId="job-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Semnalează necesar de aprovizionare" }));

    await screen.findByText(/cantitate de cumpărare nestabilită/);
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>;
    expect(body.status).toBe("MISSING");
    expect(body).not.toHaveProperty("requestedQuantity");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});
