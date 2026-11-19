import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessAdminPage } from "./AccessAdminPage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it("renders Owner access admin with invitations only: no direct user creation, no password, no internal ids (D1)", async () => {
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
    // D3: member is labelled Comercial.
    expect(screen.getByText(/Comercial · de la/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invită utilizator" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă utilizator" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Parolă inițială")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revocă" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Administrare" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("mem:owner")).not.toBeInTheDocument();
  });

  it("invites by email and role and shows the link once when there is no email delivery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...defaultAdmin, canManage: true, roles: [
        { role: "owner", label: "Proprietar", summary: "Administrează firma.", cannot: "—", assignable: true },
        { role: "member", label: "Comercial", summary: "Clienți și oferte.", cannot: "Nu vede costuri interne.", assignable: true },
      ] }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ...defaultAdmin,
          canManage: true,
          invitation: { invitationId: "inv:1", email: "nou@firma.test", role: "member", roleLabel: "Comercial", deliveryChannel: "LINK", deliveryStatus: "NOT_SENT", createdAt: "2026-01-03T00:00:00.000Z", expiresAt: "2026-01-10T00:00:00.000Z" },
          inviteUrl: "http://localhost/invitatie#t=abc",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AccessAdminPage />);
    await user.click(await screen.findByRole("button", { name: "Invită utilizator" }));
    const dialog = screen.getByRole("dialog", { name: "Invită utilizator" });
    await user.type(within(dialog).getByLabelText("Email"), "nou@firma.test");
    await user.click(within(dialog).getByLabelText(/Comercial/));
    await user.click(within(dialog).getByRole("button", { name: "Trimite invitația" }));
    expect(await screen.findByText(/Linkul de invitație pentru nou@firma.test/)).toBeInTheDocument();
    expect(screen.getByText(/Linkul nu va mai fi afișat/)).toBeInTheDocument();
    const invite = fetchMock.mock.calls[1];
    expect(String(invite[0])).toContain("/api/admin/access/invitations");
    expect(JSON.parse(String((invite[1] as { body: string }).body))).toEqual({ email: "nou@firma.test", role: "member" });
  });

  it("shows the last active owner without revoke or role actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      ...defaultAdmin,
      members: [{ ...defaultAdmin.members[0], lastActiveOwner: true, active: true, roleLabel: "Proprietar" }, defaultAdmin.members[1]],
    }) }));
    render(<AccessAdminPage />);
    expect(await screen.findByText(/Ultimul proprietar activ/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revocă" })).toHaveLength(1);
  });

  it("presents production and workshop users with the server label", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      ...defaultAdmin,
      members: [...defaultAdmin.members, { membershipId: "mem:w", email: "atelier@firma.test", role: "workshop", roleLabel: "Atelier", status: "ACTIVE_SCOPED", active: true, userStatus: "ACTIVE", createdAt: "2026-01-03T00:00:00.000Z" }],
    }) }));
    render(<AccessAdminPage />);
    expect(await screen.findByText("atelier@firma.test")).toBeInTheDocument();
    expect(screen.getByText(/Atelier · de la/)).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Invită utilizator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revocă" })).not.toBeInTheDocument();
    expect(screen.getByText(/doar proprietarul poate administra accesul/i)).toBeInTheDocument();
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
    expect(within(ask).getByText(/Nu se va mai putea autentifica în organizație/)).toBeInTheDocument();
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

const inviteAdmin = {
  ...defaultAdmin,
  canManage: true,
  roles: [
    { role: "owner", label: "Proprietar", summary: "Administrează firma.", cannot: "—", assignable: true },
    { role: "member", label: "Comercial", summary: "Clienți și oferte.", cannot: "Nu vede costuri interne.", assignable: true },
  ],
};

async function openInviteDialog() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => inviteAdmin,
    }),
  );
  const user = userEvent.setup();
  render(<AccessAdminPage />);
  const opener = await screen.findByRole("button", { name: "Invită utilizator" });
  await user.click(opener);
  return { user, opener };
}

describe("AccessAdminPage clipboard and invite focus", () => {
  async function showOnceLink() {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => inviteAdmin })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ...inviteAdmin,
          invitation: {
            invitationId: "inv:1",
            email: "nou@firma.test",
            role: "member",
            roleLabel: "Comercial",
            deliveryChannel: "LINK",
            deliveryStatus: "NOT_SENT",
            createdAt: "2026-01-03T00:00:00.000Z",
            expiresAt: "2026-01-10T00:00:00.000Z",
          },
          inviteUrl: "http://localhost/invitatie#t=abc",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AccessAdminPage />);
    await user.click(await screen.findByRole("button", { name: "Invită utilizator" }));
    const dialog = screen.getByRole("dialog", { name: "Invită utilizator" });
    await user.type(within(dialog).getByLabelText("Email"), "nou@firma.test");
    await user.click(within(dialog).getByLabelText(/Comercial/));
    await user.click(within(dialog).getByRole("button", { name: "Trimite invitația" }));
    expect(await screen.findByText(/Linkul de invitație pentru nou@firma.test/)).toBeInTheDocument();
    return user;
  }

  it("shows an explicit error and keeps the link when clipboard write is denied", async () => {
    const user = await showOnceLink();
    const writeText = vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    await user.click(screen.getByRole("button", { name: "Copiază linkul" }));
    expect(await screen.findByText("Linkul nu a fost copiat")).toBeInTheDocument();
    expect(screen.getByText(/Browserul a refuzat copierea/)).toBeInTheDocument();
    expect(screen.queryByText("Linkul a fost copiat.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Link de invitație")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit error when the Clipboard API is missing", async () => {
    const user = await showOnceLink();
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(undefined as unknown as Clipboard);
    await user.click(screen.getByRole("button", { name: "Copiază linkul" }));
    expect(await screen.findByText("Linkul nu a fost copiat")).toBeInTheDocument();
    expect(screen.getByText(/nu este disponibilă/)).toBeInTheDocument();
    expect(screen.queryByText("Linkul a fost copiat.")).not.toBeInTheDocument();
  });

  it("keeps the success copy notice when writeText resolves", async () => {
    const user = await showOnceLink();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    await user.click(screen.getByRole("button", { name: "Copiază linkul" }));
    expect(await screen.findByText("Linkul a fost copiat.")).toBeInTheDocument();
    expect(screen.queryByText("Linkul nu a fost copiat")).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("focuses Anulează on open and restores the exact Invită utilizator button after Escape", async () => {
    const { opener } = await openInviteDialog();
    const cancel = screen.getByRole("button", { name: "Anulează" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(cancel).toHaveAttribute("data-dialog-focus", "true");
    fireEvent(screen.getByRole("dialog", { name: "Invită utilizator" }), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Invită utilizator" })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

