import type { AppRoute } from "../routing/appRoute";
import {
  clientHref,
  executionHref,
  jobHref,
  quoteHref,
  requestHref,
} from "../routing/appRoute";
import type { PageWorkspace } from "./SlicePage";

export type RouteChrome = {
  contextLabel: string;
  currentHref: string;
  workspace: PageWorkspace;
  eyebrow: string;
  title: string;
  lead: string;
};

export function presentRouteChrome(route: AppRoute): RouteChrome {
  switch (route.name) {
    case "clients":
      return {
        contextLabel: "Clienți",
        currentHref: "/clienti",
        workspace: "collection-with-rail",
        eyebrow: "Clienți",
        title: "Clienți",
        lead: "Alege un client existent sau înregistrează unul nou pentru lucrare.",
      };
    case "client":
      return {
        contextLabel: "Client",
        currentHref: clientHref(route.customerId),
        workspace: "object",
        eyebrow: "Client",
        title: "Client",
        lead: "Deschide o cerere existentă sau creează cererea pentru această lucrare.",
      };
    case "requests":
      return {
        contextLabel: "Cereri",
        currentHref: "/cereri",
        workspace: "stack",
        eyebrow: "Cereri",
        title: "Cereri de ofertă",
        lead: "Deschide cererea lucrării și continuă către catalog.",
      };
    case "request":
      return {
        contextLabel: "Cerere",
        currentHref: requestHref(route.requestId),
        workspace: "object",
        eyebrow: "Cerere",
        title: "Cerere",
        lead: "Alege produsul din catalog. Nu adăuga montaj pe această lucrare.",
      };
    case "catalog":
      return {
        contextLabel: "Catalog",
        currentHref: "/catalog",
        workspace: "catalog",
        eyebrow: "Catalog",
        title: "Catalog de produse",
        lead: "Alege produsul lucrării. Configuratorul primește clientul, cererea și produsul selectat.",
      };
    case "configurator":
      return {
        contextLabel: "Configurator",
        currentHref: "/configurator",
        workspace: "configuration",
        eyebrow: "Configurator",
        title: "Configurator",
        lead: "Completează faptele confirmate, verifică costul intern și prețul clientului, apoi îngheață oferta.",
      };
    case "quotes":
      return {
        contextLabel: "Oferte",
        currentHref: "/oferte",
        workspace: "stack",
        eyebrow: "Oferte",
        title: "Oferte",
        lead: "Ofertele înghețate rămân neschimbate după acceptare.",
      };
    case "quote":
      return {
        contextLabel: "Ofertă",
        currentHref: quoteHref(route.productCode, route.quoteSnapshotId),
        workspace: "object",
        eyebrow: "Ofertă",
        title: "Ofertă înghețată",
        lead: "Înregistrare comercială înghețată. Acceptarea păstrează această versiune.",
      };
    case "jobs":
      return {
        contextLabel: "Lucrări",
        currentHref: "/lucrari",
        workspace: "stack",
        eyebrow: "Lucrări",
        title: "Lucrări",
        lead: "Continuă eliberarea, planul de execuție sau lucrarea finalizată.",
      };
    case "job":
      return {
        contextLabel: "Lucrare",
        currentHref: jobHref(route.jobId),
        workspace: "traveler",
        eyebrow: "Lucrare",
        title: "Lucrare",
        lead: "Eliberează producția, materializează planul și compară planificat cu realizat.",
      };
    case "atelier":
      return {
        contextLabel: "Atelier",
        currentHref: "/atelier",
        workspace: "operational",
        eyebrow: "Atelier",
        title: "Atelier",
        lead: "Identifică operatorul, apoi preia sarcina disponibilă.",
      };
    case "execution":
      return {
        contextLabel: "Execuție",
        currentHref: executionHref(route.planId),
        workspace: "operational",
        eyebrow: "Execuție",
        title: "Execuție",
        lead: "Planul vine de la motorul de producție. Operatorul pornește și închide sarcinile eligibile.",
      };
    case "admin-resources":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/resources",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Dovezi de cost",
        lead: "Tarif confirmat pe resursă și calificator. Valoarea salvată este folosită doar la calcule noi.",
      };
    case "admin-commercial":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/commercial",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Valori comerciale implicite",
        lead: "Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă.",
      };
    case "admin-technical":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/technical",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Setări tehnice",
        lead: "Aceste valori sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
      };
    case "foundation":
      return {
        contextLabel: "Fundație",
        currentHref: "/foundation",
        workspace: "stack",
        eyebrow: "Fundație",
        title: "Fundație",
        lead: "Se verifică contractul API.",
      };
    case "unknown":
      return {
        contextLabel: "Operator",
        currentHref: route.path,
        workspace: "stack",
        eyebrow: "Operator",
        title: "Pagină inexistentă",
        lead: "Această adresă nu există în aplicație.",
      };
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}

export function loadingFloorVariantFor(
  workspace: PageWorkspace,
): "registry" | "object" | "form" | "operational" | "admin" | "traveler" {
  switch (workspace) {
    case "stack":
    case "collection-with-rail":
      return "registry";
    case "object":
      return "object";
    case "configuration":
    case "catalog":
      return "form";
    case "traveler":
      return "traveler";
    case "operational":
    case "operational-gate":
      return "operational";
    case "admin":
      return "admin";
    default: {
      const exhaustive: never = workspace;
      return exhaustive;
    }
  }
}
