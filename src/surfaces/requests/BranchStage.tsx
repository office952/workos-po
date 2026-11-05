import type { BranchStageCell } from "../../presentation/requestCommercialBranches";

export function BranchStage({
  name,
  cell,
  plain = false,
}: {
  name: string;
  cell: BranchStageCell;
  /** Inside a row button the stage stays text; the expanded panel holds the links. */
  plain?: boolean;
}) {
  const body = (
    <>
      <span className="branch-stage__name">{name}</span>
      <span className="branch-stage__label">{cell.label}</span>
      {cell.detail ? <span className="branch-stage__detail">{cell.detail}</span> : null}
    </>
  );
  if (plain || !cell.href) {
    return (
      <span className="branch-stage" data-tone={cell.tone}>
        {body}
      </span>
    );
  }
  return (
    <a className="branch-stage hit" data-tone={cell.tone} href={cell.href}>
      {body}
    </a>
  );
}
