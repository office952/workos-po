import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  membershipRoleLabel,
  type CloudMembershipPresentation,
} from "../adapters/cloudSessionAdapter";
import { Button } from "../components/Button";
import { ThemeControl } from "../theme/ThemeControl";

export type AccountAreaProps = {
  organizationName: string;
  userLabel: string;
  membershipRole?: "owner" | "member" | null;
  memberships: readonly CloudMembershipPresentation[];
  currentOrganizationId: string;
  onSwitchOrganization?: (organizationId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown> | void;
};

export function AccountArea({
  organizationName,
  userLabel,
  membershipRole = null,
  memberships,
  currentOrganizationId,
  onSwitchOrganization,
  onLogout,
}: AccountAreaProps) {
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const canSwitch = memberships.length > 1 && onSwitchOrganization !== undefined;
  const roleLabel = membershipRoleLabel(membershipRole);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await onLogout();
    } finally {
      setBusy(false);
      setOpen(false);
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

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="account-area" ref={rootRef}>
      <div className="account-area__summary">
        <p className="account-area__org" title={organizationName}>
          {organizationName}
        </p>
        {roleLabel ? <p className="account-area__role">{roleLabel}</p> : null}
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="account-area__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => {
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        Cont
      </button>
      {open ? (
        <div id={menuId} className="account-area__menu" role="menu" aria-label="Cont">
          <p className="account-area__user" title={userLabel} role="presentation">
            {userLabel}
          </p>
          {canSwitch ? (
            <div className="account-area__switch-block" role="none">
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
            </div>
          ) : null}
          <div className="account-area__theme" role="none">
            <ThemeControl />
          </div>
          {switchError ? (
            <p className="account-area__error" role="alert">
              {switchError}
            </p>
          ) : null}
          <div role="none">
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
        </div>
      ) : null}
    </div>
  );
}
