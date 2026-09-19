import { capabilities } from "../capabilities.js";

export const IMPLEMENTATION_STATES = [
  "IMPLEMENTED",
  "POLICY_CONFIRMED",
  "PLANNED",
  "NOT_IMPLEMENTED",
] as const;

export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

export type AuthorityRecord = {
  id: string;
  label: string;
  owns: readonly string[];
  state: ImplementationState;
};

export type SystemBoundary = {
  id: string;
  label: string;
  statement: string;
  state: ImplementationState;
};

export type OwnerGate = {
  id: string;
  statement: string;
};

export type RoadmapItem = {
  id: string;
  label: string;
  state: ImplementationState;
};

export type GovernanceProjection = {
  terminology: {
    componentTerm: string;
    moduleNote: string;
  };
  authorities: readonly AuthorityRecord[];
  boundaries: readonly SystemBoundary[];
  sources: readonly string[];
  ownerGates: readonly OwnerGate[];
  protectionRules: readonly string[];
  roadmap: readonly RoadmapItem[];
  uiRules: readonly string[];
  freeze: {
    label: string;
    state: ImplementationState;
    note: string;
  };
  capabilityKernelNote: string;
  capabilityKernelStatuses: readonly {
    id: string;
    status: string;
  }[];
};

export function projectSystemGovernance(): GovernanceProjection {
  return {
    terminology: {
      componentTerm: "componentă",
      moduleNote:
        "Față, Volum, Spate și Iluminare sunt componente de produs. Titlul «Module și componente» păstrează «module» pentru modulele de sistem viitoare.",
    },
    authorities: [
      {
        id: "PRODUCT",
        label: "Produs",
        owns: [
          "familia și categoria",
          "ProductTemplate",
          "compoziția de componente",
          "configurația permisă",
          "identitatea fixă a produsului",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "FORM",
        label: "Formular",
        owns: ["schema", "câmpuri", "vizibilitate", "prezentarea validării"],
        state: "IMPLEMENTED",
      },
      {
        id: "TRUTH_COMPILER",
        label: "Adevăr / compilator",
        owns: [
          "ProductDefinition",
          "confirmarea definiției verificate",
          "ProductTruth",
          "orchestrarea ProductAggregate",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "COMPONENT_CONTRACTS",
        label: "Contracte de componentă",
        owns: [
          "măsurătorile componentei",
          "calculul cantității",
          "cererea de resurse",
          "starea de disponibilitate",
          "consumul setărilor tehnice, nu valorile ajustabile",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "COMPONENT_TECHNICAL_SETTINGS",
        label: "Setări tehnice de componentă",
        owns: [
          "parametrii tehnici reutilizabili activi pentru variantele de componentă",
          "metadatele parametrilor",
          "valorile tehnice configurate",
          "starea rezolvat / nerezolvat",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "PRODUCT_SYSTEM_PERSISTENCE",
        label: "Persistență Product System",
        owns: [
          "metadatele de afișare persistate",
          "bootstrap-ul determinist",
          "autoritatea runtime a etichetei",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "AUTHORIZATION",
        label: "Autorizare",
        owns: [
          "enforcement-ul owner/member pe write-uri de administrare în Cloud",
          "single-plane rămâne compatibilitate explicită, nu autoritate Cloud",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "CLOUD_CONTROL_PLANE",
        label: "WorkOS Cloud — Control Plane",
        owns: [
          "Organization",
          "User",
          "Membership",
          "PlatformSession",
          "OperationalPlane descriptor",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "CLOUD_AUTH",
        label: "Autentificare Cloud",
        owns: [
          "email și parolă",
          "sesiune platformă HttpOnly",
          "organizația activă pe sesiune",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "CLOUD_OPERATIONAL_PLANE",
        label: "Plan operațional per organizație",
        owns: [
          "identitate plane verificată",
          "runtime request-scoped",
          "izolarea adevărului operațional",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "RESOURCES_COST",
        label: "Resurse / cost intern",
        owns: [
          "identitatea resursei",
          "familia și specificația de material",
          "evidența de cost intern / tarife",
          "rețetele de serviciu și manoperă",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "INVENTORY",
        label: "Stoc",
        owns: [
          "mișcările de stoc",
          "soldul derivat din mișcări",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "EIC",
        label: "EIC",
        owns: ["proiecția de cost intern din cereri de resurse"],
        state: "IMPLEMENTED",
      },
      {
        id: "OPERATIONAL_PROCESSES",
        label: "Procese operaționale",
        owns: [
          "definiția reutilizabilă a procesului",
          "clasa de capabilitate cerută",
          "aplicabilitatea pe tip constructiv",
          "compunerea tehnologică de procese pentru produs / componentă",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "WORKCENTERS_MACHINES",
        label: "Utilaje și zone",
        owns: [
          "identitatea workcenter",
          "identitatea utilajului",
          "furnizarea de capabilități de producție",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "COMMERCIAL",
        label: "Commercial",
        owns: [
          "preț client",
          "reguli comerciale",
          "snapshot ofertă",
          "identitate vânzător curentă",
          "document ofertă PDF (proiecție)",
          "acceptare ofertă",
          "snapshot comandă",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "CUSTOMER",
        label: "Client",
        owns: ["profilul curent", "starea ACTIVE / RETIRED"],
        state: "IMPLEMENTED",
      },
      {
        id: "COMMERCIAL_REQUEST",
        label: "Cerere de ofertă",
        owns: [
          "ce a cerut clientul",
          "starea de birou",
          "legătura Request↔Quote",
        ],
        state: "IMPLEMENTED",
      },
      {
        id: "EXECUTION",
        label: "Execuție",
        owns: ["plan operațional", "actuale de execuție"],
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "ANALYZER",
        label: "Analyzer",
        owns: ["propuneri geometrice, după confirmare de operator"],
        state: "NOT_IMPLEMENTED",
      },
    ],
    boundaries: [
      {
        id: "analyzer",
        label: "Analyzer",
        statement:
          "Aplicație separată. Ieșirea este evidență sau propunere, nu Product Truth, până la confirmarea operatorului.",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "commercial",
        label: "Commercial",
        statement:
          "Prețul client este derivat din EIC planificat. Snapshot-ul de ofertă îngheață acel preț. Acceptarea ofertei este o decizie separată. Snapshot-ul de comandă copiază oferta acceptată. Eliberarea în producție din comandă nu este implementată.",
        state: "IMPLEMENTED",
      },
      {
        id: "customer",
        label: "Client",
        statement:
          "Customer deține profilul curent. Workspace-ul client doar proiectează Cereri, Oferte și Lucrări după customerId. Nu este CRM și nu rescrie snapshot-uri.",
        state: "IMPLEMENTED",
      },
      {
        id: "client-workspace",
        label: "Workspace client",
        statement:
          "Proiecție de citire. Nu deține profil, cerere, ofertă sau lucrare. Relațiile rămân pe customerId, nu pe nume.",
        state: "IMPLEMENTED",
      },
      {
        id: "execution",
        label: "Execuție",
        statement: "Nu există plan de execuție, sarcini sau actuale.",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "business-db",
        label: "Persistență Product System",
        statement:
          "SQLite local deține etichetele de afișare Product System. Nu este o bază universală de business și nu persistă setări tehnice.",
        state: "IMPLEMENTED",
      },
      {
        id: "authorization",
        label: "Autorizare",
        statement:
          "Write-urile de administrare sunt acțiuni de owner. În Cloud, membership owner/member este enforcement-ul. Single-plane rămâne compatibilitate explicită.",
        state: "IMPLEMENTED",
      },
      {
        id: "cloud-foundation",
        label: "WorkOS Cloud Foundation",
        statement:
          "Control Plane partajat plus un Operational Plane verificat per Organization. User ≠ Person ≠ OperatorSession. OperatorSession este valid doar în organizația deja autentificată. Nu există Hub, billing sau signup public.",
        state: "IMPLEMENTED",
      },
      {
        id: "inventory",
        label: "Stoc",
        statement:
          "Stocul este sold derivat din mișcări. Consumul real de execuție generează ieșire. Fără rezervare, achiziție, lot sau evaluare.",
        state: "IMPLEMENTED",
      },
      {
        id: "actual-internal-cost",
        label: "Cost intern real",
        statement:
          "Proiecție din consum real × tarif înghețat din snapshot. Nu este EIC, Commercial, pontaj sau evaluare de stoc.",
        state: "IMPLEMENTED",
      },
      {
        id: "machines",
        label: "Utilaje / workcenter",
        statement:
          "Harta de atelier este live: mese de asamblare, sudură, debitare metale, CNC, formare, electric, print și celelalte utilaje reale. Planificarea de capacitate nu este implementată.",
        state: "IMPLEMENTED",
      },
      {
        id: "capacity-planning",
        label: "Planificare capacitate",
        statement:
          "Workcenter / Utilaj vor deține ulterior modelul de capacitate. Nu există calendar, disponibilitate dinamică sau ore-mașină.",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "scheduling",
        label: "Programare",
        statement:
          "Nu există programare, calendar sau capacitate. Alocarea de furnizor și executant pe task există, fără programare.",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "machine-run",
        label: "MachineRun",
        statement: "Catalogul de utilaje nu stochează rulare reală pe comandă.",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "people-skills",
        label: "Persoane / calificări",
        statement:
          "Catalogul de oameni, skill-uri și disponibilitate operațională există. Eligibilitatea curentă este derivată. Pontaj, HR și Claim-on-Start rămân în afara acestui registru.",
        state: "IMPLEMENTED",
      },
      {
        id: "intake-settings",
        label: "Intake",
        statement:
          "Intake nu deține setările tehnice de sistem. Nu administrează pasul LED sau rezerva PSU.",
        state: "IMPLEMENTED",
      },
      {
        id: "documentation-values",
        label: "Documentație",
        statement:
          "Documentația explică setările. Nu este autoritatea valorii active.",
        state: "IMPLEMENTED",
      },
    ],
    sources: [
      "Contractele de componentă din domeniu",
      "Setările tehnice canonice ale variantelor de componentă",
      "ProductTemplate și catalogul de produse",
      "Catalogul canonic de resurse și cost intern",
      "Catalogul canonic de procese operaționale",
      "Catalogul canonic Workcenter / Utilaj și acoperirea de capabilitate",
      "Compilatorul de definiție / adevăr / agregat",
      "EIC generic din cereri de resurse",
      "Politica comercială canonică a companiei",
      "Canonul documentului de ofertă",
      "Harta canonică de domenii și administrare",
      "Metadatele de afișare persistate ale Product System",
      "Proiecția de administrare Product System",
    ],
    ownerGates: [
      { id: "scope", statement: "Doar ownerul autorizează domeniul de implementare." },
      { id: "commercial", statement: "Fără Commercial silent." },
      { id: "second-product", statement: "Fără al doilea produs fără GO." },
      {
        id: "analyzer",
        statement: "Fără integrare runtime Analyzer fără GO.",
      },
      {
        id: "db",
        statement: "Fără bază de date de business sau migrări fără GO.",
      },
      {
        id: "invented",
        statement: "Fără valori tehnice inventate acolo unde adevărul lipsește.",
      },
    ],
    protectionRules: [
      "O faptă de business are un singur proprietar.",
      "UI poate codifica experiența, nu adevărul de business.",
      "Tarifele trăiesc doar în Resurse / Cost.",
      "Valorile tehnice ajustabile trăiesc în setările canonice ale variantei, nu în documentație, Intake sau literali ascunși.",
      "Documentația explică; calculul consumă; Intake nu administrează setările de sistem.",
      "Fiecare domeniu deține setările sale. Nu există un Settings global care deține tot adevărul.",
      "Eticheta de afișare persistată este autoritatea runtime după bootstrap. Codul rămâne default de inițializare, nu a doua valoare activă.",
      "Setările tehnice, lifecycle-ul și identitatea resurselor nu au write persistat. Tariful activ din dovada de cost se salvează de owner pentru calcule noi.",
      "Identitatea resursei, specificația, dovada de cost, cererea de componentă și prețul client rămân separate.",
      "Commercial consumă EIC planificat. Nu recalculează cantități și nu repricează din costul real.",
      "Customer deține profilul curent. Workspace-ul client nu deține adevăr de business. Quote și Order rămân imutabile.",
      "Procesul operațional este HOW. Resursa este WHAT. Workcenter / utilaj furnizează capabilitatea. Task-ul de execuție alege ulterior furnizorul.",
      "Se confirmă definiția verificată, nu un draft ulterior.",
      "Componenta neselectată este tăcută; cea selectată este calculabilă independent.",
    ],
    roadmap: [
      { id: "repo", label: "Fundație repository", state: "IMPLEMENTED" },
      { id: "shell", label: "Platformă și stare sistem", state: "IMPLEMENTED" },
      { id: "catalog", label: "Ierarhie de catalog", state: "IMPLEMENTED" },
      { id: "first-product", label: "Primul produs canonic", state: "IMPLEMENTED" },
      {
        id: "component-first",
        label: "Calcule pe contracte de componentă",
        state: "IMPLEMENTED",
      },
      {
        id: "partial-eic",
        label: "EIC parțial față / volum / spate",
        state: "IMPLEMENTED",
      },
      {
        id: "component-settings",
        label: "Setări tehnice de componentă",
        state: "IMPLEMENTED",
      },
      {
        id: "admin-map",
        label: "Hartă de administrare cross-sistem",
        state: "IMPLEMENTED",
      },
      {
        id: "product-system-admin",
        label: "Fundație administrare Product System",
        state: "IMPLEMENTED",
      },
      {
        id: "product-system-persistence",
        label: "Persistență Product System",
        state: "IMPLEMENTED",
      },
      {
        id: "display-label-write",
        label: "Write etichetă afișată",
        state: "IMPLEMENTED",
      },
      {
        id: "resources-catalog-foundation",
        label: "Fundație catalog resurse / cost",
        state: "IMPLEMENTED",
      },
      {
        id: "resource-admin-write",
        label: "Write administrare resurse",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "inventory-stock-movements",
        label: "Stoc și mișcări",
        state: "IMPLEMENTED",
      },
      {
        id: "inventory",
        label: "Rezervări / disponibilitate",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "operational-processes",
        label: "Fundație procese operaționale",
        state: "IMPLEMENTED",
      },
      {
        id: "letters-process-composition",
        label: "Compunere procese Letters",
        state: "IMPLEMENTED",
      },
      {
        id: "letters-critical-process-completion",
        label: "Traseu tehnologic Letters V1",
        state: "IMPLEMENTED",
      },
      {
        id: "process-admin-write",
        label: "Write administrare procese",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "execution-plan-preview",
        label: "Previzualizare producție",
        state: "IMPLEMENTED",
      },
      {
        id: "accepted-production-snapshot",
        label: "Snapshot producție acceptat",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-plan",
        label: "ExecutionPlan",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-tasks",
        label: "ExecutionTasks",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-task-lifecycle",
        label: "Ciclu de viață task",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-completion-evidence",
        label: "Evidență de finalizare",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-actual-internal-cost",
        label: "Cost intern real din execuție",
        state: "IMPLEMENTED",
      },
      {
        id: "people-registry",
        label: "Registru persoane",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-task-executor",
        label: "Executant pe task",
        state: "IMPLEMENTED",
      },
      {
        id: "workcenters",
        label: "Workcenters",
        state: "IMPLEMENTED",
      },
      {
        id: "assembly-workcenters",
        label: "Mese de asamblare confirmate",
        state: "IMPLEMENTED",
      },
      {
        id: "real-shopfloor-map",
        label: "Hartă reală de atelier",
        state: "IMPLEMENTED",
      },
      {
        id: "shopfloor-process-completion",
        label: "Catalog procese atelier reale",
        state: "IMPLEMENTED",
      },
      {
        id: "machines",
        label: "Catalog utilaje",
        state: "IMPLEMENTED",
      },
      {
        id: "service-labor-recipes",
        label: "Rețete serviciu / labor",
        state: "IMPLEMENTED",
      },
      {
        id: "recipe-admin-write",
        label: "Write administrare rețete",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "capacity-planning",
        label: "Planificare capacitate",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "scheduling",
        label: "Programare",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "machine-run",
        label: "MachineRun",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "people-skills",
        label: "Persoane / calificări",
        state: "IMPLEMENTED",
      },
      {
        id: "labor-recipes",
        label: "Rețete labor / serviciu LETTERS",
        state: "IMPLEMENTED",
      },
      {
        id: "cnc-pricing",
        label: "Preț CNC",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "administrare-nav",
        label: "Administrare globală",
        state: "IMPLEMENTED",
      },
      {
        id: "technical-settings-write",
        label: "Write setări tehnice",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "lifecycle-write",
        label: "Write lifecycle",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "lighting-foundation",
        label: "Fundație calcul iluminare",
        state: "IMPLEMENTED",
      },
      { id: "lighting", label: "Calcul complet iluminare", state: "IMPLEMENTED" },
      {
        id: "commercial-price-rules",
        label: "Reguli preț comercial",
        state: "IMPLEMENTED",
      },
      {
        id: "quote-snapshot",
        label: "Snapshot ofertă",
        state: "IMPLEMENTED",
      },
      {
        id: "quote-document-pdf",
        label: "Document ofertă PDF",
        state: "IMPLEMENTED",
      },
      {
        id: "quote-acceptance",
        label: "Acceptare ofertă",
        state: "IMPLEMENTED",
      },
      {
        id: "order-snapshot",
        label: "Snapshot comandă",
        state: "IMPLEMENTED",
      },
      {
        id: "frozen-production-input",
        label: "Input producție înghețat",
        state: "IMPLEMENTED",
      },
      { id: "commercial", label: "Eliberare producție din comandă", state: "IMPLEMENTED" },
      {
        id: "execution-from-order-release",
        label: "Execuție din eliberarea comenzii",
        state: "IMPLEMENTED",
      },
      {
        id: "execution-workspace",
        label: "Workspace execuție",
        state: "IMPLEMENTED",
      },
      {
        id: "operational-job-overview",
        label: "Prezentare lucrări operaționale",
        state: "IMPLEMENTED",
      },
      {
        id: "commercial-request",
        label: "Cereri de ofertă",
        state: "IMPLEMENTED",
      },
      {
        id: "client-workspace",
        label: "Workspace client",
        state: "IMPLEMENTED",
      },
      { id: "execution", label: "Execuție", state: "NOT_IMPLEMENTED" },
      {
        id: "cloud-foundation-v1",
        label: "WorkOS Cloud Foundation V1",
        state: "IMPLEMENTED",
      },
      {
        id: "real-hub-media-cloud-pilot",
        label: "Pilot Cloud HUB MEDIA real",
        state: "NOT_IMPLEMENTED",
      },
      {
        id: "self-service-onboarding",
        label: "Onboarding self-service",
        state: "NOT_IMPLEMENTED",
      },
    ],
    uiRules: [
      "Interfața operator este în română.",
      "Codurile interne nu sunt conținut principal.",
      "Proiecția nu devine o a doua autoritate.",
      "Starea planificată nu se afișează ca activă.",
    ],
    freeze: {
      label: "Politică de freeze",
      state: "PLANNED",
      note: "Nu este activă. Eliberarea din comandă și planul de execuție din acea eliberare sunt implementate. Snapshot-ul de producție acceptat (pilot) rămâne calea de atelier.",
    },
    capabilityKernelNote:
      "Nucleul de capabilități păstrează identificatorii înghețați. Statusul kernel PLANNED nu înseamnă că primul produs nu există; înseamnă că nucleul nu a fost promovat la ACTIVE.",
    capabilityKernelStatuses: capabilities.map((item) => ({
      id: item.id,
      status: item.status,
    })),
  };
}

export function implementationStateLabel(state: ImplementationState): string {
  switch (state) {
    case "IMPLEMENTED":
      return "Implementat";
    case "POLICY_CONFIRMED":
      return "Politică confirmată";
    case "PLANNED":
      return "Planificat";
    case "NOT_IMPLEMENTED":
      return "Neimplementat";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
