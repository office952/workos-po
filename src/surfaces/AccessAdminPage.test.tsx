import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: "Administrare" })).toHaveAttribute("href", "/admin");
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
    expect(screen.getByText(/doar proprietarul poate revoca/i)).toBeInTheDocument();
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
    // R1 · F7: nothing is sent before the owner confirms.
    const ask = screen.getByRole("dialog", { name: "Revoci accesul pentru membru@firma.test?" });
    expect(within(ask).getByText("Nu se va mai putea autentifica în organizație.")).toBeInTheDocument();
    expect(within(ask).getByRole("button", { name: "Anulează" })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(within(ask).getByRole("button", { name: "Revocă accesul" }));

    expect(await screen.findByText("Acces actualizat")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("keeps the last-owner refusal inside the confirmation and cancels without a call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => defaultAdmin })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "last_owner_removal" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AccessAdminPage />);
    await screen.findByText("owner@firma.test");
    await user.click(screen.getAllByRole("button", { name: "Revocă" })[0]!);
    await user.click(screen.getByRole("button", { name: "Anulează" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole("button", { name: "Revocă" })[0]!);
    const ask = screen.getByRole("dialog", { name: "Revoci accesul pentru owner@firma.test?" });
    await user.click(within(ask).getByRole("button", { name: "Revocă accesul" }));
    expect(await within(ask).findByText(/ultimul proprietar/)).toBeInTheDocument();
  });
});
