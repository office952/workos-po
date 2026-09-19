export const ACM_FRAME_CLEARANCE_MM = 2;
export const ACM_UNFOLD_RETURN_SIDES = 2;

export function frameExternalSizeMm(panelMm: number, thicknessMm: number): number {
  return panelMm - 2 * thicknessMm - ACM_FRAME_CLEARANCE_MM;
}

export function cassetteBlankMm(outerMm: number, depthMm: number): number {
  return outerMm + ACM_UNFOLD_RETURN_SIDES * depthMm;
}

export function rectanglePerimeterMm(widthMm: number, heightMm: number): number {
  return 2 * (widthMm + heightMm);
}
