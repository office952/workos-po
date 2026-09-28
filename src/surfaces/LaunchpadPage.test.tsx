import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { LaunchpadPage } from "./LaunchpadPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function session(role: "owner" | "member") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      mode: "cloud",
      user: { userId: "usr:1", email: "owner@example.test" },
      organization: {
        organizationId: "org:a",
        displayName: "Atelier Alpha",
        slug: "alpha",
        role,
      },
      memberships: [
        {
          organizationId: "org:a",
          displayName: "Atelier Alpha",
          slug: "alpha",
          role,
          status: "ACTIVE",
        },
      ],
    }),
  };
}

describe("LaunchpadPage", () => {
  it("orients the owner without metrics or internal identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(session("owner")));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText(/Atelier Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Proprietar/)).toBeInTheDocument();
    expect(screen.getByText("Pregătit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continuă" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Planificare/ })[0]).toHaveAttribute(
      "href",
      "/planificare",
    );
    expect(screen.getByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operațiuni" })).toBeInTheDocument();
    expect(screen.getByText("Poți modifica setările pentru lucrările noi.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Configurator/ })).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/foundation"),
    ).toBe(false);
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
    expect(screen.queryByText(/API|DTO|motorul/)).not.toBeInTheDocument();
  });

  it("keeps organization changes reserved for the owner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(session("member")));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText(/Membru/)).toBeInTheDocument();
    expect(
      screen.getByText("Modificările sunt rezervate proprietarului organizației."),
    ).toBeInTheDocument();
  });
});
