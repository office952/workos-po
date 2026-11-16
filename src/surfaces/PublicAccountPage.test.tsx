import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  completeEmailVerification: vi.fn(),
  acceptInvitation: vi.fn(),
  completePasswordReset: vi.fn(),
  previewInvitation: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../api/organizationAccess", () => api);

const { PublicAccountPage } = await import("./PublicAccountPage");

function openWithToken(token: string) {
  window.history.replaceState(null, "", `/verificare-email#t=${token}`);
}

beforeEach(() => {
  api.completeEmailVerification.mockReset();
});

describe("Verificare email · B (single-use token, StrictMode)", () => {
  it("a genuine success stays a success when React runs the effect twice; the token is sent once", async () => {
    openWithToken("tok-success-1");
    api.completeEmailVerification.mockResolvedValueOnce({ ok: true, status: 204, body: null }).mockResolvedValue({ ok: false, status: 410, body: null });
    render(
      <StrictMode>
        <PublicAccountPage kind="email-verification" signedInEmail={null} />
      </StrictMode>,
    );
    expect(await screen.findByRole("heading", { name: "Email verificat" })).toBeVisible();
    expect(screen.queryByText(/nu mai este valabil/)).toBeNull();
    expect(api.completeEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("an invalid, used or expired link is refused by the server and shown as unavailable", async () => {
    openWithToken("tok-used-2");
    api.completeEmailVerification.mockResolvedValue({ ok: false, status: 410, body: null });
    render(
      <StrictMode>
        <PublicAccountPage kind="email-verification" signedInEmail={null} />
      </StrictMode>,
    );
    expect(await screen.findByRole("heading", { name: "Linkul nu mai este valabil" })).toBeVisible();
    expect(api.completeEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("a different token is a new request (no client-side success is reused)", async () => {
    openWithToken("tok-other-3");
    api.completeEmailVerification.mockResolvedValue({ ok: false, status: 410, body: null });
    render(<PublicAccountPage kind="email-verification" signedInEmail={null} />);
    expect(await screen.findByRole("heading", { name: "Linkul nu mai este valabil" })).toBeVisible();
    expect(api.completeEmailVerification).toHaveBeenCalledWith("tok-other-3");
  });
});
