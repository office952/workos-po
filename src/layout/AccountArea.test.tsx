import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountArea } from "./AccountArea";

describe("AccountArea", () => {
  it("shows organization and user without a selector for a single membership", () => {
    render(
      <AccountArea
        organizationName="Atelier Alpha"
        userLabel="owner@example.test"
        memberships={[{ organizationId: "org:a", displayName: "Atelier Alpha" }]}
        currentOrganizationId="org:a"
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText("Atelier Alpha")).toHaveAttribute("title", "Atelier Alpha");
    expect(screen.queryByLabelText("Organizație activă")).not.toBeInTheDocument();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cont" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ieși din cont" })).not.toBeInTheDocument();
  });

  it("opens account menu with theme and logout", async () => {
    const onLogout = vi.fn();
    render(
      <AccountArea
        organizationName="Atelier Alpha"
        userLabel="owner@example.test"
        membershipRole="owner"
        memberships={[{ organizationId: "org:a", displayName: "Atelier Alpha" }]}
        currentOrganizationId="org:a"
        onLogout={onLogout}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cont" }));
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Schimbă prezentarea WorkOS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ieși din cont" })).toBeInTheDocument();
  });

  it("uses a native organization control when switching is available", async () => {
    const onSwitch = vi.fn().mockResolvedValue({ ok: true });
    render(
      <AccountArea
        organizationName="Atelier Alpha"
        userLabel="owner@example.test"
        memberships={[
          { organizationId: "org:a", displayName: "Atelier Alpha" },
          { organizationId: "org:b", displayName: "Atelier Beta" },
        ]}
        currentOrganizationId="org:a"
        onSwitchOrganization={onSwitch}
        onLogout={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cont" }));
    const select = screen.getByLabelText("Organizație activă");
    expect(select.tagName).toBe("SELECT");
    await userEvent.selectOptions(select, "org:b");
    expect(onSwitch).toHaveBeenCalledWith("org:b");
    expect(screen.queryByText("org:b")).not.toBeInTheDocument();
  });
});
