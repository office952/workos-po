import { useState } from "react";
import type { CloudMembershipPresentation } from "../adapters/cloudSessionAdapter";
import { Button } from "../components/Button";

export type AccountAreaProps = {
  organizationName: string;
  userLabel: string;
  memberships: readonly CloudMembershipPresentation[];
  currentOrganizationId: string;
  onSwitchOrganization?: (organizationId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown> | void;
};

export function AccountArea({
  organizationName,
  userLabel,
  memberships,
  currentOrganizationId,
  onSwitchOrganization,
  onLogout,
}: AccountAreaProps) {
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const canSwitch = memberships.length > 1 && onSwitchOrganization !== undefined;

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await onLogout();
    } finally {
      setBusy(false);
    }
  }

  async function switchOrganization(nextId: string): Promise<void> {
    if (!onSwitchOrganization || nextId === currentOrganizationId) {
      return;
    }
    setBusy(true);
    setSwitchError(null);
    try {
      const result = await onSwitchOrganization(nextId);
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok?: unknown }).ok === false
      ) {
        setSwitchError("Organizația nu a putut fi schimbată.");
      }
    } catch {
      setSwitchError("Organizația nu a putut fi schimbată.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-area">
      <div className="account-area__identity">
        {canSwitch ? (
          <>
            <label className="u-visually-hidden" htmlFor="active-organization">
              Organizație activă
            </label>
            <select
              id="active-organization"
              className="field__control account-area__switch"
              value={currentOrganizationId}
              disabled={busy}
              onChange={(event) => {
                void switchOrganization(event.target.value);
              }}
            >
              {memberships.map((item) => (
                <option key={item.organizationId} value={item.organizationId}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="account-area__org" title={organizationName}>
            {organizationName}
          </p>
        )}
        <p className="account-area__user" title={userLabel}>
          {userLabel}
        </p>
        {switchError ? (
          <p className="account-area__error" role="alert">
            {switchError}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => {
          void logout();
        }}
      >
        Ieși din cont
      </Button>
    </div>
  );
}
