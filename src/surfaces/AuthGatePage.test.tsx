import { render, screen, within } from "@testing-library/react";
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
  it("keeps auth fields hidden until a login choice is selected", async () => {
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

    expect(screen.getByRole("button", { name: "Login Societate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login Angajat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cadru tehnic Auth Frame")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Parolă")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autentificare" })).not.toBeInTheDocument();
  });

  it("reveals Societate auth content inside the technical frame", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));

    const frame = screen.getByLabelText("Cadru tehnic Auth Frame");
    expect(within(frame).getByRole("heading", { name: "Acces Societate" })).toBeInTheDocument();
    expect(within(frame).getByLabelText("Email")).toBeInTheDocument();
    expect(within(frame).getByLabelText("Parolă")).toBeInTheDocument();
    expect(within(frame).getByRole("button", { name: "Intră" })).toBeInTheDocument();
  });

  it("reveals Angajat auth content inside the technical frame", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Login Angajat" }));

    expect(screen.getByRole("heading", { name: "Acces Angajat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
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

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    await userEvent.type(screen.getByLabelText("Email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: "Intră" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email sau parolă greșită.");
    expect(screen.getByLabelText("Parolă")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("wrong-pass")).not.toBeInTheDocument();
    expect(screen.queryByText("invalid_credentials")).not.toBeInTheDocument();
  });

  it("keeps power and lighting modes operable without replacing authentication", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    const root = document.querySelector(".auth-gate");
    expect(root).toHaveAttribute("data-scene", "day");

    const power = screen.getByRole("switch", { name: "Alimentare iluminare WorkOS" });
    expect(power).toHaveAttribute("aria-checked", "false");

    await userEvent.click(power);
    expect(power).toHaveAttribute("aria-checked", "true");
    expect(root).toHaveAttribute("data-scene", "night");

    const dimmer = screen.getByRole("slider", { name: "Intensitate iluminare" });
    expect(dimmer).toHaveValue("72");

    const face = screen.getByRole("radio", { name: "FATA" });
    const halo = screen.getByRole("radio", { name: "HALO" });
    const combined = screen.getByRole("radio", { name: "FATA + HALO" });

    await userEvent.click(face);
    expect(face).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector(".sign-demo__word")).toHaveAttribute("data-face-emission", "on");

    await userEvent.click(halo);
    expect(halo).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector(".sign-demo__word")).toHaveAttribute("data-halo-only");
    expect(document.querySelector(".sign-demo__word")).toHaveAttribute("data-face-emission", "off");

    await userEvent.click(combined);
    expect(combined).toHaveAttribute("aria-checked", "true");

    const rgb = screen.getByRole("radio", { name: "RGB" });
    await userEvent.click(rgb);
    expect(screen.getByRole("radio", { name: "magenta" })).toBeInTheDocument();

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
  });
});
