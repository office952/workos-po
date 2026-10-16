import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const preparation = {
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
    expect(screen.getByText(/Material marcat lipsă/)).toBeInTheDocument();
    expect(screen.getByText(/Solicitare înregistrată: 140/)).toBeInTheDocument();
    expect(screen.getByText(/În așteptarea Achizițiilor/)).toBeInTheDocument();
    expect(screen.queryByText(/mreq:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lipsește — solicită achiziție" })).not.toBeInTheDocument();
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
    expect(screen.getByText(/Solicitare existentă, de revizuit: 140/)).toBeInTheDocument();
    expect(screen.queryByText(/În așteptarea Achizițiilor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Material marcat lipsă/)).not.toBeInTheDocument();
  });
});
