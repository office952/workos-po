import { InlineAlert } from "../components/InlineAlert";
import { AppShell } from "../layout/AppShell";
import { PageHeader } from "../layout/PageHeader";
import { PageRegion } from "../layout/PageRegion";

type FailClosedPageProps = {
  reason: string;
};

export function FailClosedPage({ reason }: FailClosedPageProps) {
  return (
    <AppShell contextLabel="Contract: incompatibil" mode="slice" currentHref="/clienti">
      <PageRegion>
        <PageHeader
          title="Contract API incompatibil"
          lead="Aplicația nu continuă până când contractul API este confirmat."
        />
        <div className="page-region">
          <InlineAlert tone="blocked" title="Sistem indisponibil">
            {reason}
          </InlineAlert>
        </div>
      </PageRegion>
    </AppShell>
  );
}
