import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { AuthGatePage } from "./AuthGatePage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("AuthGatePage", () => {
  it("shows Romanian login fields without internal jargon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo) => {
        if (String(url).endsWith("/api/cloud/session")) {
          return jsonResponse({
            mode: "cloud",
            user: null,
            organization: null,
            memberships: [],
          });
        }
        return jsonResponse({});
      }),
    );

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Intră" });
    expect(submit).toBeInTheDocument();
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toHaveClass("auth-gate__submit");
    expect(submit).not.toBeDisabled();
    expect(submit.querySelector(".button--primary")).not.toBeNull();
    expect(screen.queryByText("Control Plane")).not.toBeInTheDocument();
    expect(screen.queryByText("organization_id")).not.toBeInTheDocument();
  });

  it("asks for an organization when the account has more than one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo) => {
        if (String(url).endsWith("/api/cloud/session")) {
          return jsonResponse({
            mode: "cloud",
            user: null,
            organization: null,
            memberships: [],
          });
        }
        if (String(url).endsWith("/api/cloud/login")) {
          return jsonResponse(
            {
              error: "organization_selection_required",
              memberships: [
                {
                  organizationId: "org:a",
                  displayName: "Atelier Alpha",
                  slug: "alpha",
                  role: "owner",
                  status: "ACTIVE",
                },
                {
                  organizationId: "org:b",
                  displayName: "Atelier Beta",
                  slug: "beta",
                  role: "member",
                  status: "ACTIVE",
                },
              ],
            },
            409,
          );
        }
        return jsonResponse({});
      }),
    );

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Intră" }));

    expect(await screen.findByLabelText("Organizație")).toBeInTheDocument();
    expect(screen.getByText("Alege organizația pentru acest cont.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Atelier Alpha" })).toBeInTheDocument();
  });

  it("keeps missing Cloud config distinct from invalid credentials", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          mode: "cloud",
          authConfigured: false,
          user: null,
          organization: null,
          memberships: [],
        }),
      ),
    );

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="auth_config_missing" />
      </CloudSessionProvider>,
    );

    expect(screen.getByRole("heading", { name: "Autentificare indisponibilă" })).toBeInTheDocument();
    expect(screen.getByText(/nu este o problemă de email sau parolă/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows session expiry without treating it as a wrong password", () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="session_expired" />
      </CloudSessionProvider>,
    );

    expect(screen.getByText("Sesiunea a expirat. Autentifică-te din nou.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText("Email sau parolă greșită.")).not.toBeInTheDocument();
  });

  it("associates an invalid login without repeating the password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo) => {
        if (String(url).endsWith("/api/cloud/login")) {
          return jsonResponse({ error: "invalid_credentials" }, 401);
        }
        return jsonResponse({ mode: "cloud", user: null });
      }),
    );

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: "Intră" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email sau parolă greșită.");
    expect(screen.getByLabelText("Parolă")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("wrong-pass")).not.toBeInTheDocument();
    expect(screen.queryByText("invalid_credentials")).not.toBeInTheDocument();
  });
});
