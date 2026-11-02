/**
 * N-019 demo atelier: versioned synthetic scenario definition.
 *
 * This file only names synthetic fixtures and the order in which canonical
 * HTTP commands are issued. Eligibility, pricing, readiness, dependencies and
 * every total stay with the business engine. Credentials and the persistent
 * data live outside Git, in the demo root.
 */

export const DEMO_ATELIER_FIXTURE_KIND = "DEMO_ATELIER_N019_V1" as const;
export const DEMO_ATELIER_MARKER = "DEMO_ATELIER_N019";
export const DEMO_ATELIER_LEDGER = "demo-atelier-ledger.json";
export const DEMO_ATELIER_CYCLE_STATE = "demo-atelier-cycle.json";
export const DEMO_ATELIER_DEFAULT_PORT = 8891;


export type DemoPersonKey =
  | "cnc1"
  | "cnc2"
  | "cant"
  | "weldSteel"
  | "weldAlu"
  | "electric"
  | "assembly1"
  | "assembly2"
  | "finish"
  | "quality";

export type DemoPerson = {
  key: DemoPersonKey;
  ordinal: number;
  displayName: string;
  roleLabel: string;
  /** Skill codes requested from the server. Eligibility is always read back from the server. */
  skillCodes: readonly string[];
  /** Earlier synthetic environments where this exact person already existed. */
  recoveredFrom: string | null;
};

/**
 * Organization-defined skills this demo adds through POST /api/people/skills.
 * The SYNTHETIC_TEST foundation maps no capability to them; see the welding
 * conflict in docs/DEMO_ATELIER_N019.md.
 */
export const DEMO_EXTRA_SKILLS: ReadonlyArray<{ code: string; displayLabel: string; description: string }> = [
  {
    code: "SK_DEMO_WELD_STEEL",
    displayLabel: "Sudură oțel",
    description: "Calificare demonstrativă. Fără mapare de capabilitate în planul sintetic.",
  },
  {
    code: "SK_DEMO_WELD_ALUMINIUM",
    displayLabel: "Sudură aluminiu",
    description: "Calificare demonstrativă. Fără mapare de capabilitate în planul sintetic.",
  },
];

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    key: "cnc1",
    ordinal: 1,
    displayName: "Ion CNC Demo",
    roleLabel: "Operator CNC router (exclusiv)",
    skillCodes: ["SK_CNC_OPERATOR"],
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "cnc2",
    ordinal: 2,
    displayName: "Ana CNC Sintetic N-014",
    roleLabel: "Operator CNC router",
    skillCodes: ["SK_CNC_OPERATOR"],
    recoveredFrom: "N-014",
  },
  {
    key: "cant",
    ordinal: 3,
    displayName: "Radu Cant Demo",
    roleLabel: "Operator formare cant / profil aluminiu",
    skillCodes: ["SK_LETTER_CANT_OPERATOR"],
    recoveredFrom: null,
  },
  {
    key: "weldSteel",
    ordinal: 4,
    displayName: "Sorin Sudură Oțel Demo",
    roleLabel: "Sudor oțel / debitare metale",
    skillCodes: ["SK_DEMO_WELD_STEEL", "SK_METAL_CUTTING_OPERATOR"],
    recoveredFrom: null,
  },
  {
    key: "weldAlu",
    ordinal: 5,
    displayName: "Dan Sudură Aluminiu Demo",
    roleLabel: "Sudor aluminiu / modelare cant",
    skillCodes: ["SK_DEMO_WELD_ALUMINIUM", "SK_LETTER_MODELING"],
    recoveredFrom: null,
  },
  {
    key: "electric",
    ordinal: 6,
    displayName: "Elena Electric Demo",
    roleLabel: "Electrică și iluminare",
    skillCodes: ["SK_ELECTRICIAN"],
    recoveredFrom: null,
  },
  {
    key: "assembly1",
    ordinal: 7,
    displayName: "Maria Ansamblu Demo",
    roleLabel: "Asamblare",
    skillCodes: ["SK_ASSEMBLY"],
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "assembly2",
    ordinal: 8,
    displayName: "Vlad Ansamblu Demo",
    roleLabel: "Asamblare și operații manuale",
    skillCodes: ["SK_ASSEMBLY"],
    recoveredFrom: null,
  },
  {
    key: "finish",
    ordinal: 9,
    displayName: "Irina Finisaj Demo",
    roleLabel: "Vopsire și aplicare folie",
    skillCodes: ["SK_PAINTING", "SK_VINYL_APPLICATOR"],
    recoveredFrom: null,
  },
  {
    key: "quality",
    ordinal: 10,
    displayName: "Paul Calitate Demo",
    roleLabel: "Control calitate (persoana desemnată)",
    // SK_ASSEMBLY is the only skill the foundation maps to QUALITY_CONTROL.
    skillCodes: ["SK_ASSEMBLY"],
    recoveredFrom: null,
  },
];

export type DemoWorkcenter = { key: string; label: string; capabilityIds: readonly string[] };
export type DemoMachine = {
  key: string;
  label: string;
  workcenterKey: string;
  capabilityIds: readonly string[];
};

/** Labels follow the canonical atelier catalog in packages/domain/src/workcenters/catalog.ts. */
export const DEMO_WORKCENTERS: readonly DemoWorkcenter[] = [
  { key: "cncZone", label: "Zonă CNC", capabilityIds: [] },
  { key: "cantZone", label: "Zonă formare cant", capabilityIds: [] },
  { key: "metalZone", label: "Stație debitare metale", capabilityIds: [] },
  { key: "weldZone", label: "Stație sudură", capabilityIds: [] },
  { key: "assembly1", label: "Masă asamblare 1", capabilityIds: ["MANUAL_ASSEMBLY"] },
  { key: "assembly2", label: "Masă asamblare 2", capabilityIds: ["MANUAL_ASSEMBLY"] },
  { key: "electric", label: "Montaj LED / electric", capabilityIds: ["ELECTRICAL_ASSEMBLY"] },
  { key: "vinyl", label: "Zonă aplicare folie", capabilityIds: ["VINYL_APPLICATION"] },
  { key: "paint", label: "Cabină vopsire", capabilityIds: ["PAINTING"] },
];

export const DEMO_MACHINES: readonly DemoMachine[] = [
  { key: "cnc", label: "CNC 4020", workcenterKey: "cncZone", capabilityIds: ["CNC_ROUTING"] },
  {
    key: "cant",
    label: "CNC Cant Litere",
    workcenterKey: "cantZone",
    capabilityIds: ["PROFILE_FORMING"],
  },
  {
    key: "metalCutter",
    label: "Debitator metale",
    workcenterKey: "metalZone",
    capabilityIds: ["METAL_CUTTING"],
  },
  {
    key: "weldSteel",
    label: "Aparat sudură oțel",
    workcenterKey: "weldZone",
    capabilityIds: ["WELD_STEEL"],
  },
  {
    key: "weldAlu",
    label: "Aparat sudură aluminiu",
    workcenterKey: "weldZone",
    capabilityIds: ["WELD_ALUMINIUM"],
  },
];

export type DemoCustomer = {
  key: string;
  displayName: string;
  /** null = deliberately incomplete case kept for testing. */
  profile: {
    cui: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    notes: string | null;
  };
  recoveredFrom: string | null;
};

const NOTE = "Client sintetic N-019. Date de test, fără verificare fiscală.";

/**
 * Test CUI values are invented and never sent to a fiscal service.
 * Emails use the reserved .test domain, so nothing can be delivered.
 */
export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  {
    key: "nord",
    displayName: "Nord Market Demo SRL",
    profile: {
      cui: "RO90190001",
      contactName: "Andreea Pop",
      phone: "0700 900 101",
      email: "achizitii@nord-market.demo.test",
      address: "Str. Fabricii 12",
      city: "Cluj-Napoca",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "alpha",
    displayName: "Alpha Clima Demo SRL",
    profile: {
      cui: "RO90190002",
      contactName: "Mihai Ionescu",
      phone: "0700 900 102",
      email: "office@alpha-clima.demo.test",
      address: "Bd. Muncii 45",
      city: "Brașov",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "urban",
    displayName: "Urban Pharma Demo SRL",
    profile: {
      cui: "RO90190003",
      contactName: "Ioana Marin",
      phone: "0700 900 103",
      email: "marketing@urban-pharma.demo.test",
      address: "Calea Victoriei 88",
      city: "București",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "sign",
    displayName: "Sign Pro Demo SRL",
    profile: {
      cui: "RO90190004",
      contactName: "Cristian Dobre",
      phone: "0700 900 104",
      email: "cereri@sign-pro.demo.test",
      address: "Str. Industriei 3",
      city: "Ploiești",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "delta",
    displayName: "Delta Retail Demo SRL",
    profile: {
      cui: "RO90190005",
      contactName: "Laura Stan",
      phone: "0700 900 105",
      email: "amenajari@delta-retail.demo.test",
      address: "Str. Comerțului 21",
      city: "Iași",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "helix",
    displayName: "Helix Offices Demo SRL",
    profile: {
      cui: "RO90190006",
      contactName: "Bogdan Rusu",
      phone: "0700 900 106",
      email: "facility@helix-offices.demo.test",
      address: "Str. Tehnicii 7",
      city: "Timișoara",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "pine",
    displayName: "Pine Hotels Demo SRL",
    profile: {
      cui: "RO90190007",
      contactName: "Diana Matei",
      phone: "0700 900 107",
      email: "receptie@pine-hotels.demo.test",
      address: "Str. Brazilor 15",
      city: "Sinaia",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "orbit",
    displayName: "Orbit Auto Demo SRL",
    profile: {
      cui: "RO90190008",
      contactName: "Victor Enache",
      phone: "0700 900 108",
      email: "showroom@orbit-auto.demo.test",
      address: "Șos. Pipera 200",
      city: "Voluntari",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "meadow",
    displayName: "Meadow Café Demo SRL",
    // Incomplete case: only a contact phone, no CUI / address.
    profile: {
      cui: null,
      contactName: "Raluca Georgescu",
      phone: "0700 900 109",
      email: null,
      address: null,
      city: null,
      notes: "Client sintetic N-019 — caz incomplet păstrat pentru testare (fără CUI și adresă).",
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "quartz",
    displayName: "Quartz Clinic Demo SRL",
    profile: {
      cui: "RO90190010",
      contactName: "Dr. Elena Vasile",
      phone: "0700 900 110",
      email: "administrativ@quartz-clinic.demo.test",
      address: "Str. Spitalului 4",
      city: "Sibiu",
      notes: NOTE,
    },
    recoveredFrom: "OWNER_REVIEW_V1",
  },
  {
    key: "lumen",
    displayName: "Lumen Studio Demo SRL",
    // Incomplete case: name only.
    profile: {
      cui: null,
      contactName: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      notes: null,
    },
    recoveredFrom: null,
  },
];

/** Letters values with optional finishes; every field is a server-schema field. */
export function demoLettersValues(
  inscription: string,
  finish: { faceVinylColor?: string; volumePaintColor?: string } = {},
): Record<string, unknown> {
  return {
    "root.inscription": inscription,
    "face.finish": finish.faceVinylColor ? "vinyl" : "none",
    ...(finish.faceVinylColor ? { "face.color": finish.faceVinylColor } : {}),
    "face.confirmedAreaMm2": 320000,
    "volume.depthMm": "80",
    "volume.finish": finish.volumePaintColor ? "painted" : "none",
    ...(finish.volumePaintColor ? { "volume.color": finish.volumePaintColor } : {}),
    "volume.confirmedPerimeterMm": 14800,
  };
}

export function demoAcmValues(inscription: string, widthMm = 2400, heightMm = 800): Record<string, unknown> {
  return {
    "root.inscription": inscription,
    "face.widthMm": widthMm,
    "face.heightMm": heightMm,
    "face.cassetteDepthMm": 40,
  };
}
