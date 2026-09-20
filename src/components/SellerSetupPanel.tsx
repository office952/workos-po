import { useState } from "react";
import { TransportError } from "../api/http";
import { updateSeller } from "../api/seller";
import { invalidateAfterSellerChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { Button } from "./Button";
import { InlineAlert } from "./InlineAlert";
import { TextField } from "./TextField";

type SellerSetupPanelProps = {
  onSaved?: () => void;
};

export function SellerSetupPanel({ onSaved }: SellerSetupPanelProps) {
  const [legalName, setLegalName] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (legalName.trim() === "") {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      await updateSeller({ legalName: legalName.trim() });
      writeResource(resourceKeys.seller(), true);
      invalidateAfterSellerChange();
      setSaveState("idle");
      onSaved?.();
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof TransportError && error.status === 403
          ? "Doar proprietarul organizației poate configura datele firmei."
          : "Datele firmei nu au putut fi salvate.",
      );
    }
  }

  return (
    <InlineAlert tone="blocked" title="Datele firmei lipsesc">
      Datele firmei trebuie configurate înainte de a crea oferta.
      <TextField
        id="seller-legal-name"
        label="Denumire firmă"
        value={legalName}
        onChange={setLegalName}
      />
      <Button
        variant="secondary"
        disabled={legalName.trim() === "" || saveState === "pending"}
        onClick={() => {
          void save();
        }}
      >
        Salvează datele firmei
      </Button>
      {saveError ? <p>{saveError}</p> : null}
    </InlineAlert>
  );
}
