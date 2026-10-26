import { ACM, acmValues } from "../../cloud/ownerReviewSeed.js";
import { DEMO_MARK } from "./demoFiles.js";
import type { ClientDossierScenario } from "./clientDossierSeed.js";

/**
 * Scenario data for the N-020 demo: the synthetic customer "Alpha Clima Demo SRL" restored from
 * the N-019 backup. Its three WorkOS projects already exist (showroom finished on 7 Oct 2026,
 * reception in execution, warehouse cassette quoted); this adds what the dossier holds: three
 * sites, a second quote on the warehouse request, the work from before WorkOS as historical
 * records (2021, Nov 2025, Mar 2026), documents and illustrative photos coherent with each state,
 * and the commercial terms. Nothing here is engine history: no operations, sessions or
 * acceptances are created for the past.
 */
const SHOWROOM = "Litere volumetrice showroom Alpha — Brașov";
const RECEPTION = "Litere volumetrice recepție Alpha";
const WAREHOUSE = "Casetă luminoasă depozit Alpha";

const pdf = (heading: string, subtitle: string, lines: string[]) => ({ pdf: { heading, subtitle, lines: [...lines, "", DEMO_MARK] } });
const facade: [number, number, number] = [205, 198, 186];
const warehouseFacade: [number, number, number] = [170, 176, 182];
const blue: [number, number, number] = [20, 90, 170];

export const ALPHA_CLIMA_DOSSIER_SCENARIO: ClientDossierScenario = {
  customer: { cui: "RO90190002", displayName: "Alpha Clima Demo SRL" },
  sites: [
    {
      key: "central",
      fields: {
        name: "Sediu central — recepție",
        address: "Bd. Muncii 45",
        city: "Brașov",
        contactName: "Mihai Ionescu",
        phone: "0700 900 102",
        accessNotes: "Recepție la parter. Montajul în afara programului 08–17 se face doar cu acordul administratorului.",
      },
    },
    {
      key: "showroom",
      fields: {
        name: "Showroom Str. Lungă",
        address: "Str. Lungă 120",
        city: "Brașov",
        contactName: "Elena Matei",
        phone: "0700 900 115",
        accessNotes: "Vitrine spre stradă. Oprire interzisă 07–19; montajul pe fațadă cere aviz de ocupare a trotuarului.",
      },
    },
    {
      key: "warehouse",
      fields: {
        name: "Depozit Ghimbav",
        address: "DN1 km 7, Zona Industrială",
        city: "Ghimbav",
        contactName: "Sorin Dinu",
        phone: "0700 900 120",
        accessNotes: "Acces camion pe poarta 2. Fațada la 7 m înălțime — montaj cu nacelă.",
      },
    },
  ],
  siteAssignments: [
    { key: "showroom-request", subject: "REQUEST", requestTitle: SHOWROOM, site: "showroom" },
    { key: "showroom-job", subject: "JOB", requestTitle: SHOWROOM, site: "showroom" },
    { key: "reception-request", subject: "REQUEST", requestTitle: RECEPTION, site: "central" },
    { key: "reception-job", subject: "JOB", requestTitle: RECEPTION, site: "central" },
    { key: "warehouse-request", subject: "REQUEST", requestTitle: WAREHOUSE, site: "warehouse" },
  ],
  quoteRevisions: [
    {
      key: "warehouse-v2",
      requestTitle: WAREHOUSE,
      productCode: ACM,
      // The customer asked for a narrower cassette (2800 × 700 instead of 3000 × 700).
      values: { ...acmValues("ALPHA DEPOZIT"), "face.widthMm": 2800, "face.heightMm": 700 },
      manualProductNetPrice: 620,
    },
  ],
  historicalWorks: [
    {
      key: "2021-warehouse",
      site: "warehouse",
      fields: {
        title: "Litere volumetrice și casetă luminoasă depozit Ghimbav",
        reference: "AC-2021-014",
        eventDate: "2021-06",
        eventDateEnd: "2021-07",
        description: "Litere volumetrice „ALPHA CLIMA” și casetă luminoasă pe fațada depozitului. Lucrare anterioară WorkOS, reconstituită din factură și procesul-verbal de recepție.",
      },
    },
    {
      key: "2025-showroom-vinyl",
      site: "showroom",
      fields: {
        title: "Autocolant vitrine showroom",
        reference: "AC-2025-087",
        eventDate: "2025-11-12",
        description: "Autocolant print pe vitrinele showroomului pentru campania de iarnă. Lucrare anterioară WorkOS.",
      },
    },
    {
      key: "2026-warehouse-service",
      site: "warehouse",
      fields: {
        title: "Mentenanță casetă luminoasă depozit",
        reference: "AC-2026-021",
        eventDate: "2026-03-20",
        description: "Înlocuire surse LED și curățare casetă. Lucrare anterioară WorkOS.",
      },
    },
  ],
  documents: [
    {
      key: "framework-contract",
      fileName: "contract-cadru-CC-12-2025.pdf",
      file: pdf("Contract-cadru de prestări servicii", "Nr. CC-12/2025 din 15.10.2025 · Alpha Clima Demo SRL", [
        "Obiect: execuție și montaj de elemente de signalistică.",
        "Termen de plată: 30 de zile de la facturare. Avans: 40% la comandă.",
        "Valabilitate: 24 de luni.",
      ]),
      kind: "CONTRACT",
      title: "Contract-cadru de prestări servicii",
      documentNumber: "CC-12/2025",
      documentDate: "2025-10-15",
      links: [],
    },
    {
      key: "addendum-2026",
      fileName: "act-aditional-AA-1-2026.pdf",
      file: pdf("Act adițional nr. 1", "La contractul-cadru CC-12/2025 · 30.09.2026", ["Se adaugă sediul Depozit Ghimbav în anexa locurilor de montaj."]),
      kind: "ADDENDUM",
      title: "Act adițional nr. 1 la contractul-cadru",
      documentNumber: "AA-1/2026",
      documentDate: "2026-09-30",
      links: [{ kind: "SITE", site: "warehouse" }],
    },
    // 2021 — historical work at the warehouse.
    {
      key: "2021-invoice",
      fileName: "factura-F-ALC-2021-0412.pdf",
      file: pdf("Factură F-ALC-2021-0412", "02.07.2021 · Alpha Clima Demo SRL", ["Litere volumetrice „ALPHA CLIMA” — 1 set", "Casetă luminoasă 2500 × 600 mm — 1 buc.", "Montaj cu nacelă — 1 serviciu"]),
      kind: "INVOICE",
      title: "Factură litere și casetă depozit",
      documentNumber: "F-ALC-2021-0412",
      documentDate: "2021-07-02",
      links: [{ kind: "HISTORICAL_WORK", work: "2021-warehouse" }],
    },
    {
      key: "2021-reception",
      fileName: "pv-receptie-2021-031.pdf",
      file: pdf("Proces-verbal de recepție", "PV-2021-031 · 01.07.2021 · Depozit Ghimbav", ["Lucrarea a fost recepționată fără obiecții."]),
      kind: "RECEPTION",
      title: "PV recepție litere depozit",
      documentNumber: "PV-2021-031",
      documentDate: "2021-07-01",
      links: [{ kind: "HISTORICAL_WORK", work: "2021-warehouse" }],
    },
    {
      key: "2021-photo-before",
      fileName: "depozit-2021-inainte.png",
      file: { image: { stage: "BEFORE", signText: "ALPHA CLIMA", facade: warehouseFacade, sign: blue } },
      kind: "PHOTO",
      photoStage: "BEFORE",
      title: "Fațada depozitului înainte de montaj (2021)",
      documentDate: "2021-06-03",
      links: [{ kind: "HISTORICAL_WORK", work: "2021-warehouse" }, { kind: "SITE", site: "warehouse" }],
    },
    {
      key: "2021-photo-after",
      fileName: "depozit-2021-dupa.png",
      file: { image: { stage: "AFTER", signText: "ALPHA CLIMA", facade: warehouseFacade, sign: blue } },
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "Litere montate pe depozit (2021)",
      documentDate: "2021-07-01",
      links: [{ kind: "HISTORICAL_WORK", work: "2021-warehouse" }, { kind: "SITE", site: "warehouse" }],
    },
    // Nov 2025 and Mar 2026 — historical works.
    {
      key: "2025-vinyl-invoice",
      fileName: "factura-F-ALC-2025-1187.pdf",
      file: pdf("Factură F-ALC-2025-1187", "20.11.2025 · Alpha Clima Demo SRL", ["Autocolant print vitrine showroom — 14 mp", "Aplicare la fața locului"]),
      kind: "INVOICE",
      title: "Factură autocolant vitrine",
      documentNumber: "F-ALC-2025-1187",
      documentDate: "2025-11-20",
      links: [{ kind: "HISTORICAL_WORK", work: "2025-showroom-vinyl" }],
    },
    {
      key: "2025-vinyl-photo",
      fileName: "showroom-2025-autocolant.png",
      file: { image: { stage: "AFTER", signText: "IARNA 2025", facade, sign: [30, 140, 110] } },
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "Vitrine cu autocolant (noiembrie 2025)",
      documentDate: "2025-11-12",
      links: [{ kind: "HISTORICAL_WORK", work: "2025-showroom-vinyl" }],
    },
    {
      key: "2026-service-report",
      fileName: "pv-interventie-2026-021.pdf",
      file: pdf("Proces-verbal de intervenție", "PV-2026-021 · 20.03.2026 · Depozit Ghimbav", ["Înlocuite 4 surse LED. Caseta funcționează."]),
      kind: "RECEPTION",
      title: "PV intervenție mentenanță casetă",
      documentNumber: "PV-2026-021",
      documentDate: "2026-03-20",
      links: [{ kind: "HISTORICAL_WORK", work: "2026-warehouse-service" }],
    },
    // Showroom — finished in WorkOS on 7 Oct 2026: before, simulation, after, reception, invoice.
    {
      key: "showroom-before",
      fileName: "showroom-inainte.png",
      file: { image: { stage: "BEFORE", signText: "ALPHA SHOWROOM", facade, sign: blue } },
      kind: "PHOTO",
      photoStage: "BEFORE",
      title: "Fațada showroomului înainte",
      documentDate: "2026-09-29",
      links: [{ kind: "REQUEST", requestTitle: SHOWROOM }, { kind: "SITE", site: "showroom" }],
    },
    {
      key: "showroom-simulation",
      fileName: "showroom-simulare.png",
      file: { image: { stage: "SIMULATION", signText: "ALPHA SHOWROOM", facade, sign: blue } },
      kind: "PHOTO",
      photoStage: "SIMULATION",
      title: "Simulare litere showroom",
      documentDate: "2026-09-30",
      links: [{ kind: "REQUEST", requestTitle: SHOWROOM }],
    },
    {
      key: "showroom-after",
      fileName: "showroom-dupa-montaj.png",
      file: { image: { stage: "AFTER", signText: "ALPHA SHOWROOM", facade, sign: blue } },
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "Litere montate pe showroom",
      documentDate: "2026-10-07",
      links: [{ kind: "JOB", requestTitle: SHOWROOM }, { kind: "SITE", site: "showroom" }],
    },
    {
      key: "showroom-reception",
      fileName: "pv-receptie-2026-118.pdf",
      file: pdf("Proces-verbal de recepție", "PV-2026-118 · 08.10.2026 · Showroom Str. Lungă", ["Litere volumetrice luminoase „ALPHA SHOWROOM” recepționate."]),
      kind: "RECEPTION",
      title: "PV recepție litere showroom",
      documentNumber: "PV-2026-118",
      documentDate: "2026-10-08",
      links: [{ kind: "JOB", requestTitle: SHOWROOM }],
    },
    {
      key: "showroom-invoice",
      fileName: "factura-F-ALC-2026-1342.pdf",
      file: pdf("Factură F-ALC-2026-1342", "09.10.2026 · Alpha Clima Demo SRL", ["Litere volumetrice luminoase showroom — conform ofertei acceptate"]),
      kind: "INVOICE",
      title: "Factură litere showroom",
      documentNumber: "F-ALC-2026-1342",
      documentDate: "2026-10-09",
      links: [{ kind: "JOB", requestTitle: SHOWROOM }],
    },
    // Reception — in execution: before, simulation, execution contract; no reception, no invoice yet.
    {
      key: "reception-before",
      fileName: "receptie-inainte.png",
      file: { image: { stage: "BEFORE", signText: "ALPHA CLIMA", facade: [214, 210, 200], sign: blue } },
      kind: "PHOTO",
      photoStage: "BEFORE",
      title: "Peretele recepției înainte",
      documentDate: "2026-10-20",
      links: [{ kind: "REQUEST", requestTitle: RECEPTION }, { kind: "SITE", site: "central" }],
    },
    {
      key: "reception-simulation",
      fileName: "receptie-simulare.png",
      file: { image: { stage: "SIMULATION", signText: "ALPHA CLIMA", facade: [214, 210, 200], sign: blue } },
      kind: "PHOTO",
      photoStage: "SIMULATION",
      title: "Simulare litere recepție",
      documentDate: "2026-10-21",
      links: [{ kind: "REQUEST", requestTitle: RECEPTION }],
    },
    {
      key: "reception-contract",
      fileName: "comanda-CE-2026-077.pdf",
      file: pdf("Comandă de execuție", "CE-2026-077 · 23.10.2026 · în baza contractului-cadru CC-12/2025", ["Litere volumetrice recepție — conform ofertei acceptate."]),
      kind: "CONTRACT",
      title: "Comandă de execuție litere recepție",
      documentNumber: "CE-2026-077",
      documentDate: "2026-10-23",
      links: [{ kind: "REQUEST", requestTitle: RECEPTION }, { kind: "JOB", requestTitle: RECEPTION }],
    },
    // Warehouse cassette — quoting (two quotes): site survey and simulation only.
    {
      key: "warehouse-survey",
      fileName: "depozit-releveu-2026.png",
      file: { image: { stage: "BEFORE", signText: "ALPHA DEPOZIT", facade: warehouseFacade, sign: blue } },
      kind: "PHOTO",
      photoStage: "BEFORE",
      title: "Releveu fațadă depozit (2026)",
      documentDate: "2026-10-22",
      links: [{ kind: "REQUEST", requestTitle: WAREHOUSE }, { kind: "SITE", site: "warehouse" }],
    },
    {
      key: "warehouse-simulation",
      fileName: "depozit-simulare-caseta.png",
      file: { image: { stage: "SIMULATION", signText: "ALPHA DEPOZIT", facade: warehouseFacade, sign: blue } },
      kind: "PHOTO",
      photoStage: "SIMULATION",
      title: "Simulare casetă depozit",
      documentDate: "2026-10-23",
      links: [{ kind: "REQUEST", requestTitle: WAREHOUSE }],
    },
  ],
  commercialTerms: {
    key: "initial",
    referenceDocument: "framework-contract",
    fields: {
      legalName: "Alpha Clima Demo SRL",
      registrationNumber: "J08/1234/2019",
      billingAddress: "Bd. Muncii 45, Brașov, jud. Brașov",
      representativeName: "Mihai Ionescu",
      representativeRole: "Administrator",
      commercialContactName: "Andreea Pop",
      commercialContactPhone: "0700 900 110",
      commercialContactEmail: "comercial@alpha-clima.demo.test",
      billingContactName: "Ioana Rusu",
      billingContactPhone: "0700 900 111",
      billingContactEmail: "facturare@alpha-clima.demo.test",
      paymentTermDays: 30,
      advancePercent: 40,
      currency: "RON",
      notes: `${DEMO_MARK}. Cont bancar necunoscut — lăsat necompletat.`,
    },
  },
};
