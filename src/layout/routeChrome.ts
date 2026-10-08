import type { AppRoute } from "../routing/appRoute";
import {
  clientHref,
  executionHref,
  jobHref,
  quoteHref,
  requestHref,
} from "../routing/appRoute";
import type { PageSurface, PageWorkspace } from "./SlicePage";

export type RouteChrome = {
  contextLabel: string;
  currentHref: string;
  workspace: PageWorkspace;
  eyebrow: string;
  title: string;
  lead: string;
  surface?: PageSurface;
  pilot?: { surface: PageSurface; metrics?: readonly string[] };
};

export function presentRouteChrome(route: AppRoute): RouteChrome {
  switch (route.name) {
    case "home":
      return {
        contextLabel: "WorkOS",
        currentHref: "/",
        workspace: "launchpad",
        eyebrow: "WorkOS",
        title: "WorkOS",
        lead: "Punctul de pornire. De aici intri în comercial, operațiuni sau administrare.",
      };
    case "admin":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Administrare",
        lead: "Alege domeniul de setări al organizației.",
      };
    case "clients":
      return {
        contextLabel: "Clienți",
        currentHref: "/clienti",
        workspace: "stack",
        eyebrow: "Registru comercial",
        title: "Clienți",
        lead: "",
        pilot: { surface: "clients-registry", metrics: ["Total", "Activi", "Retrași", "Necesită acțiune"] },
      };
    case "client":
      return {
        contextLabel: "Client",
        currentHref: clientHref(route.customerId),
        workspace: "object",
        eyebrow: "Client",
        title: "Client",
        lead: "",
        pilot: { surface: "client-hub", metrics: ["Cereri", "Oferte", "Lucrări"] },
      };
    case "requests":
      return {
        contextLabel: "Cereri",
        currentHref: "/cereri",
        workspace: "stack",
        eyebrow: "Registru comercial",
        title: "Cereri de ofertă",
        lead: "",
        pilot: { surface: "cereri-registry", metrics: ["Total", "Necesită acțiune"] },
      };
    case "request":
      return {
        contextLabel: "Cerere",
        currentHref: requestHref(route.requestId),
        workspace: "object",
        eyebrow: "Cerere",
        title: "Cerere",
        lead: "Se încarcă detaliile cererii și următorul pas disponibil.",
        pilot: { surface: "cereri-detail" },
      };
    case "new-request":
      return { contextLabel: "Cereri", currentHref: "/cereri/noua", workspace: "stack", surface: "cereri-intake", eyebrow: "Registru comercial", title: "Cerere nouă", lead: "Alege clientul, descrie lucrarea și selectează produsul. Poți decide produsul și mai târziu." };
    case "catalog":
      return {
        contextLabel: "Catalog",
        currentHref: "/catalog",
        workspace: "stack",
        eyebrow: "Definiții de produse",
        title: "Catalog",
        lead: "",
        pilot: { surface: "catalog-registry" },
      };
    case "assembly":
      return {
        contextLabel: "Ansamblu",
        currentHref: "/ansamblu",
        workspace: "stack",
        eyebrow: "Ansamblu",
        title: "Ansamblu",
        lead: "Panou ACM și litere volumetrice.",
        pilot: { surface: "assembly-workbench" },
      };
    case "configurator":
      return {
        contextLabel: "Configurator",
        currentHref: "/configurator",
        workspace: "configuration",
        eyebrow: "Pregătire produs",
        title: "Configurator",
        lead: "",
        surface: "configuration-workbench",
      };
    case "quotes":
      return {
        contextLabel: "Oferte",
        currentHref: "/oferte",
        workspace: "stack",
        eyebrow: "Registru comercial",
        title: "Oferte",
        lead: "",
        pilot: { surface: "quotes-registry", metrics: ["Oferte", "Necesită atenție"] },
      };
    case "quote":
      return {
        contextLabel: "Ofertă",
        currentHref: quoteHref(route.productCode, route.quoteSnapshotId),
        workspace: "stack",
        eyebrow: "Ofertă",
        title: "Ofertă înghețată",
        lead: "Înregistrare comercială înghețată. Acceptarea păstrează această versiune.",
        pilot: { surface: "quote-detail" },
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
    case "planning":
      return {
        contextLabel: "Planificare",
        currentHref: "/planificare",
        workspace: "operational",
        eyebrow: "Planificare",
        title: "Planificare",
        lead: "Ce lucru este acum pe fiecare zonă sau utilaj și cât timp estimat avem.",
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
        lead: "Pornește și închide sarcinile pe care le poți lucra.",
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
    case "admin-services":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/services",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Servicii operaționale",
        lead: "Modul în care organizația oferă montajul la locație pentru lucrările noi.",
      };
    case "admin-material-readiness":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/material-readiness",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Materiale pentru execuție",
        lead: "Organizația alege dacă pornirea unei sarcini cere confirmarea materialelor planificate.",
      };
    case "admin-external-production":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/external-production",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Execuție externă",
        lead: "Organizația alege dacă o sarcină planificată poate fi predată unui furnizor de producție din afara atelierului.",
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
    case "admin-formulas":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/formulas",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Formule de calcul",
        lead: "Aceste formule sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
      };
    case "admin-products":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/products",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Produse oferite",
        lead: "Alege ce produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise.",
      };
    case "admin-access":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/access",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Acces organizație",
        lead: "Gestionează utilizatorii care se pot autentifica în organizație. Conturile de producție (oameni/PIN) rămân separate.",
      };
    case "admin-people":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/people",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Oameni",
        lead: "Configurează persoanele care pot lucra în producție. Contul de autentificare rămâne separat.",
      };
    case "admin-person":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/people/${encodeURIComponent(route.personId)}`,
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Oameni",
        lead: "Configurează persoanele care pot lucra în producție. Contul de autentificare rămâne separat.",
      };
    case "admin-workcenters":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/workcenters",
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "admin-workcenter":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/workcenters/${encodeURIComponent(route.workcenterId)}`,
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "admin-machine":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/workcenters/${encodeURIComponent(route.workcenterId)}/machines/${encodeURIComponent(route.machineId)}`,
        workspace: "admin",
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "foundation":
      return {
        contextLabel: "Fundație",
        currentHref: "/foundation",
        workspace: "stack",
        eyebrow: "Fundație",
        title: "Fundație",
        lead: "Se încarcă verificarea.",
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
    case "launchpad":
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
