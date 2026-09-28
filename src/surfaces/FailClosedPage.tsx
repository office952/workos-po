import { StateNotice } from "../components/StateNotice";
import { Button } from "../components/Button";
import { PageRegion } from "../layout/PageRegion";

/** Content-only fail-closed notice. Must render inside the authenticated AppShell. */
export function FailClosedPage() {
  return (
    <PageRegion>
      <StateNotice
        kind="blocked"
        title="WorkOS nu poate continua"
        reason="Aplicația nu a putut confirma că este pregătită pentru lucru. Reîncearcă."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reîncearcă
          </Button>
        }
      />
    </PageRegion>
  );
}
