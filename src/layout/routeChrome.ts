import type { AppRoute } from "../routing/appRoute";
import {
  clientHref,
  executionHref,
  jobHref,
  quoteHref,
  requestHref,
} from "../routing/appRoute";
import { layoutForRouteName, type LayoutVariant, type StructuralLayoutId } from "./pageLayout";

export type RouteChrome = {
  contextLabel: string;
  currentHref: string;
  layout: StructuralLayoutId;
  variant?: LayoutVariant;
  eyebrow: string;
  title: string;
  lead: string;
};

function routeChromeCopy(route: AppRoute): Omit<RouteChrome, "layout" | "variant"> {
  switch (route.name) {
    case "home":
      return {
        contextLabel: "WorkOS",
        currentHref: "/",
        eyebrow: "WorkOS",
        title: "WorkOS",
        lead: "Punctul de pornire. De aici intri în comercial, operațiuni sau administrare.",
      };
    case "admin":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin",
        eyebrow: "Administrare",
        title: "Administrare",
        lead: "Alege domeniul de setări al organizației.",
      };
    case "clients":
      return {
        contextLabel: "Clienți",
        currentHref: "/clienti",
        eyebrow: "Clienți",
        title: "Clienți",
        lead: "Alege un client existent sau înregistrează unul nou pentru lucrare.",
      };
    case "client":
      return {
        contextLabel: "Client",
        currentHref: clientHref(route.customerId),
        eyebrow: "Client",
        title: "Client",
        lead: "Deschide o cerere existentă sau creează cererea pentru această lucrare.",
      };
    case "requests":
      return {
        contextLabel: "Cereri",
        currentHref: "/cereri",
        eyebrow: "Cereri",
        title: "Cereri",
        lead: "Registrul cererilor de ofertă. Deschide obiectul sau continuă pasul canonic.",
      };
    case "request":
      return {
        contextLabel: "Cerere",
        currentHref: requestHref(route.requestId),
        eyebrow: "Cerere",
        title: "Cerere",
        lead: "Se încarcă detaliile cererii și următorul pas disponibil.",
      };
    case "catalog":
      return {
        contextLabel: "Catalog",
        currentHref: "/catalog",
        eyebrow: "Catalog",
        title: "Catalog de produse",
        lead: "Alege produsul lucrării. Configuratorul primește clientul, cererea și produsul selectat.",
      };
    case "assembly":
      return {
        contextLabel: "Ansamblu",
        currentHref: "/ansamblu",
        eyebrow: "Ansamblu",
        title: "Ansamblu",
        lead: "Panou ACM și litere volumetrice.",
      };
    case "configurator":
      return {
        contextLabel: "Configurator",
        currentHref: "/configurator",
        eyebrow: "Configurator",
        title: "Configurator",
        lead: "Completează faptele confirmate, verifică costul intern și prețul clientului, apoi îngheață oferta.",
      };
    case "quotes":
      return {
        contextLabel: "Oferte",
        currentHref: "/oferte",
        eyebrow: "Oferte",
        title: "Oferte",
        lead: "Ofertele înghețate rămân neschimbate după acceptare.",
      };
    case "quote":
      return {
        contextLabel: "Ofertă",
        currentHref: quoteHref(route.productCode, route.quoteSnapshotId),
        eyebrow: "Ofertă",
        title: "Ofertă înghețată",
        lead: "Înregistrare comercială înghețată. Acceptarea păstrează această versiune.",
      };
    case "jobs":
      return {
        contextLabel: "Lucrări",
        currentHref: "/lucrari",
        eyebrow: "Lucrări",
        title: "Lucrări",
        lead: "Continuă eliberarea, planul de execuție sau lucrarea finalizată.",
      };
    case "planning":
      return {
        contextLabel: "Planificare",
        currentHref: "/planificare",
        eyebrow: "Planificare",
        title: "Planificare",
        lead: "Ce lucru este acum pe fiecare zonă sau utilaj și cât timp estimat avem.",
      };
    case "job":
      return {
        contextLabel: "Lucrare",
        currentHref: jobHref(route.jobId),
        eyebrow: "Lucrare",
        title: "Lucrare",
        lead: "Eliberează producția, materializează planul și compară planificat cu realizat.",
      };
    case "atelier":
      return {
        contextLabel: "Atelier",
        currentHref: "/atelier",
        eyebrow: "Atelier",
        title: "Atelier",
        lead: "Identifică operatorul, apoi preia sarcina disponibilă.",
      };
    case "execution":
      return {
        contextLabel: "Execuție",
        currentHref: executionHref(route.planId),
        eyebrow: "Execuție",
        title: "Execuție",
        lead: "Pornește și închide sarcinile pe care le poți lucra.",
      };
    case "admin-resources":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/resources",
        eyebrow: "Administrare",
        title: "Dovezi de cost",
        lead: "Tarif confirmat pe resursă și calificator. Valoarea salvată este folosită doar la calcule noi.",
      };
    case "admin-services":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/services",
        eyebrow: "Administrare",
        title: "Servicii operaționale",
        lead: "Modul în care organizația oferă montajul la locație pentru lucrările noi.",
      };
    case "admin-material-readiness":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/material-readiness",
        eyebrow: "Administrare",
        title: "Materiale pentru execuție",
        lead: "Organizația alege dacă pornirea unei sarcini cere confirmarea materialelor planificate.",
      };
    case "admin-external-production":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/external-production",
        eyebrow: "Administrare",
        title: "Execuție externă",
        lead: "Organizația alege dacă o sarcină planificată poate fi predată unui furnizor de producție din afara atelierului.",
      };
    case "admin-commercial":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/commercial",
        eyebrow: "Administrare",
        title: "Valori comerciale implicite",
        lead: "Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă.",
      };
    case "admin-technical":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/technical",
        eyebrow: "Administrare",
        title: "Setări tehnice",
        lead: "Aceste valori sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
      };
    case "admin-formulas":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/formulas",
        eyebrow: "Administrare",
        title: "Formule de calcul",
        lead: "Aceste formule sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
      };
    case "admin-products":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/products",
        eyebrow: "Administrare",
        title: "Produse oferite",
        lead: "Alege ce produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise.",
      };
    case "admin-access":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/access",
        eyebrow: "Administrare",
        title: "Acces organizație",
        lead: "Gestionează utilizatorii care se pot autentifica în organizație. Conturile de producție (oameni/PIN) rămân separate.",
      };
    case "admin-people":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/people",
        eyebrow: "Administrare",
        title: "Oameni",
        lead: "Configurează persoanele care pot lucra în producție. Contul de autentificare rămâne separat.",
      };
    case "admin-person":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/people/${encodeURIComponent(route.personId)}`,
        eyebrow: "Administrare",
        title: "Oameni",
        lead: "Configurează persoanele care pot lucra în producție. Contul de autentificare rămâne separat.",
      };
    case "admin-workcenters":
      return {
        contextLabel: "Administrare",
        currentHref: "/admin/workcenters",
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "admin-workcenter":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/workcenters/${encodeURIComponent(route.workcenterId)}`,
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "admin-machine":
      return {
        contextLabel: "Administrare",
        currentHref: `/admin/workcenters/${encodeURIComponent(route.workcenterId)}/machines/${encodeURIComponent(route.machineId)}`,
        eyebrow: "Administrare",
        title: "Zone și utilaje",
        lead: "Configurează zonele de lucru și utilajele. Atelierul citește același registru.",
      };
    case "foundation":
      return {
        contextLabel: "Fundație",
        currentHref: "/foundation",
        eyebrow: "Fundație",
        title: "Fundație",
        lead: "Se încarcă verificarea.",
      };
    case "unknown":
      return {
        contextLabel: "Operator",
        currentHref: route.path,
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

export function presentRouteChrome(route: AppRoute): RouteChrome {
  return {
    ...routeChromeCopy(route),
    ...layoutForRouteName(route.name),
  };
}
