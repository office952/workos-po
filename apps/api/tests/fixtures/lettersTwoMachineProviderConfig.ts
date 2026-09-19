import {
  MCH_CNC_4020_ID,
  MCH_CNC_CANT_LITERE_ID,
  WC_CNC_ROUTING_ID,
  WC_LETTER_FORMING_ID,
} from "@workos-final/domain";

export const LETTERS_TWO_MACHINE_PROVIDER_CONFIG = {
  workcenters: [
    {
      id: WC_CNC_ROUTING_ID,
      label: "Zona CNC",
      description: "Zonă de debitare foi CNC.",
      capabilityIds: [],
    },
    {
      id: WC_LETTER_FORMING_ID,
      label: "Zona formare cant",
      description: "Zonă de formare profil / cant litere.",
      capabilityIds: [],
    },
  ],
  machines: [
    {
      id: MCH_CNC_4020_ID,
      label: "CNC Router 4050 x 2050",
      description: "Utilaj CNC de debitare foi. Masă 4050 x 2050 mm.",
      workcenterId: WC_CNC_ROUTING_ID,
      capabilityIds: ["CNC_ROUTING"],
    },
    {
      id: MCH_CNC_CANT_LITERE_ID,
      label: "CNC formare cant litere",
      description: "Utilaj de formare cant / profil aluminiu.",
      workcenterId: WC_LETTER_FORMING_ID,
      capabilityIds: ["PROFILE_FORMING"],
    },
  ],
} as const;
