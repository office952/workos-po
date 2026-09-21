export const ACM_FRAME_CLEARANCE_STARTER_MM = 2;
export const ACM_UNFOLD_RETURN_SIDES = 2;

export function frameExternalSizeMm(
  panelMm: number,
  thicknessMm: number,
  clearanceMm: number,
): number {
  return panelMm - 2 * thicknessMm - clearanceMm;
}

export function cassetteBlankMm(
  outerMm: number,
  depthMm: number,
  backReturnMm = 0,
): number {
  return outerMm + ACM_UNFOLD_RETURN_SIDES * (depthMm + backReturnMm);
}

export function rectanglePerimeterMm(widthMm: number, heightMm: number): number {
  return 2 * (widthMm + heightMm);
}
