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
    {
      membershipId: "mem:member",
      email: "membru@firma.test",
      role: "member",
      status: "ACTIVE",
      userStatus: "ACTIVE",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ],
};

describe("AccessAdminPage", () => {
  it("renders Owner access admin without create form or internal membership ids", async () => {
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
    expect(screen.getByText("membru@firma.test")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Utilizatorii noi sunt adăugați prin administrarea controlată WorkOS în această versiune/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă utilizator" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Parolă inițială")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revocă" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Produse oferite" })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.queryByText("mem:owner")).not.toBeInTheDocument();
  });

  it("hides revoke controls for members", async () => {
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
    expect(screen.queryByRole("button", { name: "Revocă" })).not.toBeInTheDocument();
    expect(screen.getByText(/doar un Owner poate revoca/i)).toBeInTheDocument();
  });

  it("revokes an eligible membership without calling create users", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          canEdit: true,
          members: [
            {
              ...defaultAdmin.members[0],
            },
            {
              ...defaultAdmin.members[1],
              status: "REVOKED",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccessAdminPage />);
    await screen.findByText("membru@firma.test");
    const revokeButtons = screen.getAllByRole("button", { name: "Revocă" });
    await userEvent.click(revokeButtons[1]!);

    expect(await screen.findByText("Acces actualizat")).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/api/admin/access/users"),
    );
    expect(createCall).toBeUndefined();
    const revokeCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes("/memberships/") &&
        String(call[0]).includes("revoke") &&
        typeof call[1] === "object" &&
        call[1] !== null &&
        (call[1] as { method?: string }).method === "POST",
    );
    expect(revokeCall).toBeTruthy();
    expect(String(revokeCall![0])).toContain(encodeURIComponent("mem:member"));
  });
});
