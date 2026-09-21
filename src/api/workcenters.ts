import { getJson, sendJson } from "./http";

export function workcentersAdminPath(): string {
  return "/api/workcenters";
}

export function workcenterPath(workcenterId: string): string {
  return `/api/workcenters/${encodeURIComponent(workcenterId)}`;
}

export function machinesAdminPath(): string {
  return "/api/machines";
}

export function machinePath(machineId: string): string {
  return `/api/machines/${encodeURIComponent(machineId)}`;
}

export async function fetchWorkcentersAdmin(): Promise<unknown> {
  return getJson(workcentersAdminPath());
}

export async function createWorkcenter(body: {
  label: string;
  description?: string;
  lifecycle?: "ACTIVE" | "PLANNED";
  capabilityIds?: readonly string[];
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", workcentersAdminPath(), body);
}

export async function updateWorkcenter(
  workcenterId: string,
  body: {
    label?: string;
    description?: string;
    lifecycle?: "ACTIVE" | "PLANNED" | "RETIRED";
    status?: "RETIRED";
    capabilityIds?: readonly string[];
  },
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PATCH", workcenterPath(workcenterId), body);
}

export async function createMachine(body: {
  label: string;
  description?: string;
  workcenterId: string;
  lifecycle?: "ACTIVE" | "PLANNED";
  capabilityIds?: readonly string[];
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", machinesAdminPath(), body);
}

export async function updateMachine(
  machineId: string,
  body: {
    label?: string;
    description?: string;
    workcenterId?: string;
    lifecycle?: "ACTIVE" | "PLANNED" | "RETIRED";
    status?: "RETIRED";
    capabilityIds?: readonly string[];
  },
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PATCH", machinePath(machineId), body);
}
