import type { ReactNode } from "react";
import { floorplanForLayout } from "./floorplan";
import { PageHeader } from "./PageHeader";
import {
  densityForLayout,
  type LayoutVariant,
  type StructuralLayoutId,
} from "./pageLayout";
import { PageRegion } from "./PageRegion";

type SlicePageProps = {
  contextLabel: string;
  currentHref: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  layout: StructuralLayoutId;
  variant?: LayoutVariant;
  children: ReactNode;
};

export function SlicePage({
  eyebrow,
  title,
  lead,
  meta,
  status,
  action,
  layout,
  variant,
  children,
}: SlicePageProps) {
  const density = densityForLayout(layout);
  const quiet = layout === "OPERATIONAL";
  return (
    <PageRegion>
      <div
        className="page-frame"
        data-layout={layout}
        data-layout-variant={variant}
        data-density={density}
      >
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          meta={meta}
          status={status}
          action={action}
          quiet={quiet}
        />
        <div className="page-region">
          <div
            className="page-workspace"
            data-layout={layout}
            data-layout-variant={variant}
            data-density={density}
            data-floorplan={floorplanForLayout(layout)}
          >
            {children}
          </div>
        </div>
      </div>
    </PageRegion>
  );
}
