import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessAdminPage } from "./AccessAdminPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultAdmin = {
  canEdit: true,
  members: [
    {
      membershipId: "mem:owner",
      email: "owner@firma.test",
      role: "owner",
      status: "ACTIVE",
      userStatus: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("AccessAdminPage", () => {
  it("renders Owner access admin without exposing internal membership ids in the title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<AccessAdminPage />);

    expect(await screen.findByText("owner@firma.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adaugă utilizator" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Produse oferite" })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.queryByText("mem:owner")).not.toBeInTheDocument();
  });

  it("hides write controls for members", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...defaultAdmin, canEdit: false }),
      }),
    );

    render(<AccessAdminPage />);

    expect(await screen.findByText("owner@firma.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă utilizator" })).not.toBeInTheDocument();
    expect(screen.getByText(/doar un Owner poate adăuga/i)).toBeInTheDocument();
  });

  it("validates and posts a new user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          canEdit: true,
          members: [
            ...defaultAdmin.members,
            {
              membershipId: "mem:member",
              email: "membru@firma.test",
              role: "member",
              status: "ACTIVE",
              userStatus: "ACTIVE",
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccessAdminPage />);
    await screen.findByText("owner@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Adaugă utilizator" }));
    await userEvent.type(screen.getByLabelText("Email"), "membru@firma.test");
    await userEvent.type(screen.getByLabelText("Parolă inițială"), "MemberPass12");
    await userEvent.click(screen.getByRole("button", { name: "Salvează utilizatorul" }));

    expect(await screen.findByText("membru@firma.test")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes("/api/admin/access/users") &&
        typeof call[1] === "object" &&
        call[1] !== null &&
        (call[1] as { method?: string }).method === "POST",
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String((createCall![1] as { body?: string }).body))).toMatchObject({
      email: "membru@firma.test",
      role: "member",
      password: "MemberPass12",
    });
  });

  it("renders a neutral error when identity cannot be added", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: "access_identity_unavailable",
          reasons: ["Adresa nu poate fi adăugată prin această operație."],
          ...defaultAdmin,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccessAdminPage />);
    await screen.findByText("owner@firma.test");
    await userEvent.click(screen.getByRole("button", { name: "Adaugă utilizator" }));
    await userEvent.type(screen.getByLabelText("Email"), "altcineva@firma.test");
    await userEvent.type(screen.getByLabelText("Parolă inițială"), "MemberPass12");
    await userEvent.click(screen.getByRole("button", { name: "Salvează utilizatorul" }));

    expect(
      await screen.findByText("Adresa nu poate fi adăugată prin această operație."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already exists|user_disabled|dezactivat/i)).not.toBeInTheDocument();
  });
});
