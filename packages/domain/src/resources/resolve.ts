import type { ComponentTypeId, DraftValues } from "../product/types.js";
import {
  ACM_3MM_ID,
  ALUMINIUM_RETURN_PROFILE_ID,
  FOREX_10MM_ID,
  MAT_LED_MODULE_ID,
  MAT_LED_PSU_12V_100W_ID,
  MAT_LED_PSU_12V_160W_ID,
  MAT_LED_PSU_12V_200W_ID,
  MAT_LED_PSU_12V_60W_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  RETURN_CANT_FORMING_ID,
  STEEL_FRAME_PROFILE_ID,
  matchMaterialSpecification,
} from "./catalog.js";

export type ResourceResolution =
  | { status: "RESOLVED"; resourceId: string }
  | { status: "UNRESOLVED"; reason: string };

export function resolveResourcesForType(
  typeId: ComponentTypeId,
  values: DraftValues,
): ResourceResolution[] {
  switch (typeId) {
    case "PLEXIGLAS_FACE":
      return [resolvePlexiglasSheet(values)];
    case "ALUMINIUM_VOLUME":
      return resolveAluminiumVolume(values);
    case "FOREX_BACK":
      return [resolveForexSheet(values)];
    case "LIGHTING_FRONT_LED":
      return [];
    case "ACM_CASSETTE_BODY":
      return [resolveAcmSheet(values)];
    case "STEEL_INTERNAL_FRAME":
      return [resolveSteelFrameProfile()];
    default: {
      const _exhaustive: never = typeId;
      return _exhaustive;
    }
  }
}

export function liveResourceIdsForType(
  typeId: ComponentTypeId,
): readonly string[] {
  switch (typeId) {
    case "PLEXIGLAS_FACE":
      return [PLEXIGLAS_3MM_OPAL_ID];
    case "ALUMINIUM_VOLUME":
      return [ALUMINIUM_RETURN_PROFILE_ID, RETURN_CANT_FORMING_ID];
    case "FOREX_BACK":
      return [FOREX_10MM_ID];
    case "LIGHTING_FRONT_LED":
      return [
        MAT_LED_MODULE_ID,
        MAT_LED_PSU_12V_60W_ID,
        MAT_LED_PSU_12V_100W_ID,
        MAT_LED_PSU_12V_160W_ID,
        MAT_LED_PSU_12V_200W_ID,
      ];
    case "ACM_CASSETTE_BODY":
      return [ACM_3MM_ID];
    case "STEEL_INTERNAL_FRAME":
      return [STEEL_FRAME_PROFILE_ID];
    default: {
      const _exhaustive: never = typeId;
      return _exhaustive;
    }
  }
}

function resolvePlexiglasSheet(values: DraftValues): ResourceResolution {
  const thickness = values["face.thicknessMm"];
  const optical = values["face.opticalType"];
  if (typeof thickness !== "number" || optical !== "opal") {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de Plexiglas pentru această configurație.",
    };
  }
  const match = matchMaterialSpecification("PLEXIGLAS", {
    thicknessMm: thickness,
    opticalType: "opal",
    form: "sheet",
  });
  if (!match) {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de Plexiglas pentru această configurație.",
    };
  }
  return { status: "RESOLVED", resourceId: match.id };
}

function resolveForexSheet(values: DraftValues): ResourceResolution {
  const thickness = values["back.thicknessMm"];
  if (typeof thickness !== "number") {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de Forex pentru această grosime.",
    };
  }
  const match = matchMaterialSpecification("FOREX", {
    thicknessMm: thickness,
    form: "sheet",
  });
  if (!match) {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de Forex pentru această grosime.",
    };
  }
  return { status: "RESOLVED", resourceId: match.id };
}

function resolveAcmSheet(values: DraftValues): ResourceResolution {
  const thickness = values["face.thicknessMm"];
  if (typeof thickness !== "number") {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de ACM pentru această grosime.",
    };
  }
  const match = matchMaterialSpecification("ACM", {
    thicknessMm: thickness,
    form: "sheet",
  });
  if (!match) {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de ACM pentru această grosime.",
    };
  }
  return { status: "RESOLVED", resourceId: match.id };
}

function resolveSteelFrameProfile(): ResourceResolution {
  const match = matchMaterialSpecification("STEEL", { form: "profile" });
  if (!match) {
    return {
      status: "UNRESOLVED",
      reason: "Nicio specificație de profil oțel pentru cadru intern.",
    };
  }
  return { status: "RESOLVED", resourceId: match.id };
}

function resolveAluminiumVolume(values: DraftValues): ResourceResolution[] {
  const thickness = values["volume.thicknessMm"];
  const match =
    typeof thickness === "number"
      ? matchMaterialSpecification("ALUMINIUM", {
          thicknessMm: thickness,
          form: "profile",
        })
      : matchMaterialSpecification("ALUMINIUM", { form: "profile" });
  if (!match) {
    return [
      {
        status: "UNRESOLVED",
        reason: "Nicio specificație de profil aluminiu pentru această grosime.",
      },
    ];
  }
  return [
    { status: "RESOLVED", resourceId: match.id },
    { status: "RESOLVED", resourceId: RETURN_CANT_FORMING_ID },
  ];
}
