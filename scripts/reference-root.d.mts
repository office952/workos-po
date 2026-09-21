export const SYNTHETIC_REFERENCE_MARKER: string;
export const REFERENCE_PORT: number;
export const REFERENCE_HOST: string;
export const REFERENCE_URL: string;

export function defaultReferenceRoot(env?: NodeJS.ProcessEnv): string;
export function resolveReferenceRoot(env?: NodeJS.ProcessEnv): string;
export function markerPath(root: string): string;
export function hasSyntheticMarker(root: string): boolean;
export function looksLikeBusinessStorage(root: string): boolean;
export function classifyReferenceRoot(root: string): string;
export function assertSafeReferenceRoot(root: string): string;
export function ensureSyntheticReferenceRoot(root: string): string;
export function isInside(base: string, candidate: string): boolean;
