import { Button } from "../components/Button";
import { StateNotice } from "../components/StateNotice";
import { AppShell } from "../layout/AppShell";
import { PageRegion } from "../layout/PageRegion";

export function FailClosedPage() {
  return (
    <AppShell contextLabel="WorkOS" mode="slice" currentHref="/">
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
    </AppShell>
  );
}
