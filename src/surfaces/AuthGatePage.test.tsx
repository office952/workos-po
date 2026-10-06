import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { AuthGatePage } from "./AuthGatePage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
});

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
    expect(screen.getByLabelText("Panou autentificare WorkOS")).toBeInTheDocument();
    expect(screen.queryByLabelText("Adresă email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Parolă")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autentificare" })).not.toBeInTheDocument();
  });

  it("keeps exclusive historical glyphs on the standby workbench without a static word", () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    const { container } = render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    expect(container.querySelectorAll(".auth-workbench-v3__letter")).toHaveLength(6);
    expect(container.querySelector(".auth-workbench-v3__letter--1")).not.toBeNull();
    expect(container.querySelector(".auth-workbench-v3__letter--6")).not.toBeNull();
    expect(container.querySelector(".auth-workbench-v3__word-silhouette")).toBeNull();
    expect(container.querySelector(".auth-tech__viewport")?.hasAttribute("data-auth-active")).toBe(
      false,
    );
  });

  it("reveals Societate auth content inside the technical frame", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));

    const frame = screen.getByLabelText("Panou autentificare WorkOS");
    expect(within(frame).getByRole("heading", { name: "Acces Societate" })).toBeInTheDocument();
    expect(within(frame).getByLabelText("Adresă email")).toBeInTheDocument();
    expect(within(frame).getByLabelText("Parolă")).toBeInTheDocument();
    expect(within(frame).getByRole("button", { name: "Autentificare" })).toBeInTheDocument();
    expect(frame.querySelector(".auth-tech__viewport")?.hasAttribute("data-auth-active")).toBe(true);
    expect(frame.querySelectorAll(".auth-workbench-v3__letter")).toHaveLength(6);
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
    expect(screen.getByLabelText("Adresă email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
    const frame = screen.getByLabelText("Panou autentificare WorkOS");
    expect(frame.querySelector(".auth-tech__viewport")?.hasAttribute("data-auth-active")).toBe(true);
    expect(frame.querySelectorAll(".auth-workbench-v3__letter")).toHaveLength(6);
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
    await userEvent.type(screen.getByLabelText("Adresă email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "OwnerPass12");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));

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
    expect(screen.queryByLabelText("Adresă email")).not.toBeInTheDocument();
  });

  it("shows session expiry without treating it as a wrong password", () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="session_expired" />
      </CloudSessionProvider>,
    );

    expect(screen.getByText("Sesiunea a expirat. Autentifică-te din nou.")).toBeInTheDocument();
    expect(screen.getByLabelText("Adresă email")).toBeInTheDocument();
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
    await userEvent.type(screen.getByLabelText("Adresă email"), "owner@example.test");
    await userEvent.type(screen.getByLabelText("Parolă"), "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: "Autentificare" }));

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
    expect(screen.getByRole("slider", { name: "Intensitate iluminare" })).toBeDisabled();

    await userEvent.click(power);
    expect(power).toHaveAttribute("aria-checked", "true");
    expect(root).toHaveAttribute("data-scene", "night");
    expect(window.localStorage.getItem("workos-color-scheme")).toBe("dark");

    const dimmer = screen.getByRole("slider", { name: "Intensitate iluminare" });
    expect(dimmer).toHaveValue("75");

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
    expect(screen.getByRole("radiogroup", { name: "Culoare RGB" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Roșu" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Verde" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Albastru" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Magenta" })).toBeInTheDocument();

    const demo = document.querySelector(".sign-demo");
    expect(demo).toHaveAttribute("data-source", "rgb");
    expect(demo).toHaveAttribute("data-light-color", "blue");

    await userEvent.click(screen.getByRole("radio", { name: "Roșu" }));
    expect(demo).toHaveAttribute("data-light-color", "red");
    expect((demo as HTMLElement).style.getPropertyValue("--sign-light-rgb")).toBe("255 56 64");

    await userEvent.click(screen.getByRole("radio", { name: "Verde" }));
    expect(demo).toHaveAttribute("data-light-color", "green");
    expect((demo as HTMLElement).style.getPropertyValue("--sign-light-rgb")).toBe("46 196 92");

    await userEvent.click(screen.getByRole("radio", { name: "ALB CALD" }));
    expect(demo).toHaveAttribute("data-source", "warm");
    expect(demo).toHaveAttribute("data-light-color", "warm");
    expect(screen.queryByRole("radiogroup", { name: "Culoare RGB" })).not.toBeInTheDocument();

    expect(document.querySelector(".sign-demo__infrastructure--desktop")).not.toBeNull();
    expect(document.querySelector(".sign-demo__power-rail")).not.toBeNull();

    expect(screen.queryByLabelText("Adresă email")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    expect(screen.getByLabelText("Adresă email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();

    const tech = document.querySelector(".auth-tech");
    expect(tech).not.toBeNull();
    expect(
      Boolean(demo && tech && demo.compareDocumentPosition(tech) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-layout");
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-detail");
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-scene-fit");
  });

  it("keeps the product demo before the auth frame when Societate is opened", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    const demo = document.querySelector(".sign-demo");
    const tech = document.querySelector(".auth-tech");
    expect(demo).not.toBeNull();
    expect(tech).not.toBeNull();
    expect(
      Boolean(demo && tech && demo.compareDocumentPosition(tech) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(document.querySelector(".sign-demo__power-rail")).not.toBeNull();
  });

  it("keeps product system before workbench and auth in document order", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));

    const { container } = render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    const product = container.querySelector(".sign-demo__product");
    const sign = container.querySelector(".sign-demo__word");
    const controller = container.querySelector(".sign-controller");
    const psu = container.querySelector(".sign-power-panel");
    const rail = container.querySelector(".sign-demo__power-rail");
    const tech = container.querySelector(".auth-tech");
    expect(product).not.toBeNull();
    expect(sign).not.toBeNull();
    expect(controller).not.toBeNull();
    expect(psu).not.toBeNull();
    expect(rail).not.toBeNull();
    expect(tech).not.toBeNull();
    expect(
      Boolean(sign && controller && sign.compareDocumentPosition(controller) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(controller && psu && controller.compareDocumentPosition(psu) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(psu && tech && psu.compareDocumentPosition(tech) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    const panel = container.querySelector("#auth-access-panel");
    expect(panel).not.toBeNull();
    expect(
      Boolean(product && panel && product.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it("marks compact layout auth-active as a login panel state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ mode: "cloud", user: null })));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });

    render(
      <CloudSessionProvider>
        <AuthGatePage kind="unauthenticated" />
      </CloudSessionProvider>,
    );

    window.dispatchEvent(new Event("resize"));
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-layout", "compact");
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-access", "idle");

    await userEvent.click(screen.getByRole("button", { name: "Login Societate" }));
    expect(document.querySelector(".auth-gate")).toHaveAttribute("data-access", "societate");
    expect(screen.getByRole("heading", { name: "Acces Societate" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adresă email")).toBeInTheDocument();
    expect(document.querySelectorAll(".auth-workbench-v3__letter")).toHaveLength(6);
  });
});
