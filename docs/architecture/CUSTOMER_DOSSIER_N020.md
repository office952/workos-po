# N-020 — Dosarul clientului: contract funcțional

Înregistrare Notion: [N-020](https://app.notion.com/p/4028ea98e40f81d39351e3d4fc7887e8), legată de N-018 (bază, PR #98) și N-019 (mediu demonstrativ, PR #97). Stare: `IMPLEMENTED_LOCAL_IN_REVIEW`, cu corecțiile review-ului independent (stări canonice, ramuri, contextul căutării). Nu este acceptare vizuală: interfața validează funcțiile; istoricul vertical final se proiectează ulterior.

Obiectiv: deschid un client și găsesc rapid ce s-a realizat pentru el, unde, când, cu ce documente și fotografii — inclusiv o lucrare de acum cinci ani.

## Model și relații

| Entitate | Tabel (047) | Rol | Reguli |
| --- | --- | --- | --- |
| Sediu | `customer_sites` | Loc de montaj al clientului (denumire, adresă, contact, telefon, observații acces/montaj) | Activ/inactiv, niciodată șters; separat de adresa de facturare; opțional (clientul simplu nu are sedii); nu este HostContext |
| Asocierea sediului | `customer_site_assignments` | Un sediu per cerere sau lucrare | Păstrează sediul așa cum era la asociere (`site_snapshot_json`); doar sediu activ al aceluiași client |
| Document / fotografie | `customer_documents` | Un fișier stocat o singură dată, cu tip, etapă foto, titlu, număr, dată, descriere | Tipuri: contract, act adițional, factură, recepție, fotografie, alt document; fotografia are obligatoriu etapa (înainte / simulare / după montaj), restul nu (CHECK în schemă); octeții nu se modifică după încărcare; încărcarea nu înseamnă semnat, aprobat sau plătit |
| Asocierile documentului | `customer_document_links` | Sediu, cerere, lucrare sau lucrare istorică | Același fișier apare în oricâte vederi, fără copii; asociere ulterioară și eliminarea asocierii |
| Date și condiții comerciale | `customer_commercial_terms_revisions` | Identificare, reprezentant, contacte comerciale/facturare, termen de plată, avans, monedă, observații, contract de referință | Append-only: fiecare salvare = versiune nouă; necunoscutele rămân goale; nu intră în calculul ofertelor și nu rescriu documente acceptate; nu este contabilitate, încasare sau facturare |
| Lucrare istorică | `customer_historical_works` | Ce s-a făcut înainte de WorkOS: titlu, referință, descriere, sediu, dată/perioadă cunoscută (an, lună sau zi) | Proveniență `HISTORICAL_RECORD`; data evenimentului ≠ data introducerii; nu creează operații, pontaje, acceptări sau comenzi; data nu poate fi în viitor |
| Jurnal | `customer_dossier_events` | Acțiuni trasabile (creare/modificare sediu, asociere, încărcare, versiune condiții…) | Cine, când, ce |

## Proiecte, ramuri și stări

„Proiect” este numai o grupare de prezentare a relațiilor existente: o cerere și **ramurile** ei. O ramură este o ofertă cu comanda și lucrarea la care a dus (ofertă → comandă → lucrare, prin `orderSnapshotId`), sau o lucrare a cererii la care nu se ajunge printr-o ofertă a ei. Fiecare ofertă și fiecare lucrare apare o singură dată; documentele tuturor lucrărilor cererii și sediul fiecărei lucrări (când diferă de cel al cererii) rămân vizibile. Ofertele și lucrările fără cerere formează intrări proprii, tot o singură dată. Nu există motor de proiecte.

Starea fiecărei ramuri se citește 1:1 din etapa canonică a lucrării, altfel din etapa ofertei:

| Sursă | Stare istoric | Etichetă |
| --- | --- | --- |
| Ofertă creată, neacceptată | `OFERTARE` | Ofertare |
| Ofertă acceptată, fără comandă | `OFERTA_ACCEPTATA` | Ofertă acceptată, fără comandă |
| Ofertă de ansamblu înlocuită | `OFERTA_INLOCUITA` | Ofertă înlocuită |
| Lucrare `ORDER_CREATED` | `COMANDA_CREATA` | Comandă creată |
| Lucrare `RELEASED` | `ELIBERATA` | Eliberată în producție |
| Lucrare `EXECUTION_PLANNED` | `PLAN_PREGATIT` | Plan de execuție pregătit |
| Lucrare `EXECUTION_IN_PROGRESS` | `IN_EXECUTIE` | Execuție în curs |
| Lucrare `EXECUTION_COMPLETED` | `FINALIZAT` | Finalizată |
| Cerere anulată, fără ramuri | `ANULAT` | Anulat |

Intrarea are `states` (stările distincte ale ramurilor, în ordinea vocabularului). Când toate ramurile au aceeași stare, aceasta este și `state`; altfel `state = null`, eticheta este „Ramuri în stări diferite” și interfața arată starea fiecărei ramuri. O ramură finalizată nu face ca o cerere cu altă ramură activă sau cu o ofertă în așteptare să pară finalizată. Filtrul de stare găsește intrarea dacă oricare ramură are starea cerută; filtrul de sediu caută și în sediile lucrărilor. Regulile motorului și documentele nu se modifică.

## Lucrările clientului

Decizia Ownerului (2026-10-23): în fișa clientului, „Lucrări” înseamnă toate lucrările sale — fiecare lucrare WorkOS (o comandă devenită lucrare) și fiecare înregistrare istorică, o singură dată. Cererile, ofertele fără comandă și documentele fără lucrare nu sunt lucrări; ele rămân în Istoric, care este mai larg. Registrul global de producție „Lucrări” nu se schimbă și nu conține înregistrări istorice.

`GET /api/customers/:id/works?q=&kind=WORKOS|HISTORICAL&year=&site=&state=&page=&pageSize=&id=` — proiecția `projectCustomerWorks` (domeniu), construită din aceeași intrare și aceleași reguli ca Istoricul (`createDossierProjectionContext`: documentele unui subiect, sediul cu instantaneul lui, starea canonică a lucrării). O cerere cu două lucrări contribuie cu două lucrări distincte; fiecare lucrare își păstrează oferta și cererea din care vine. Proveniența este explicită: „În WorkOS” / „Înregistrare istorică”.

- Stare: lucrare WorkOS → etapa canonică (Comandă creată … Finalizată); înregistrare istorică → „Finalizată” (o lucrare înregistrată după ce s-a făcut; proveniența „Înregistrare istorică” se afișează separat, nu în eticheta stării), fără operații, progres, pontaje, comenzi sau acceptări.
- `totals` = colecția completă (toate / în WorkOS / istorice), independentă de filtre și pagină; `total` = rezultatele după filtre. Interfața spune „X rezultate din Y lucrări” când un filtru este activ.
- Filtre: proveniență (Toate · În WorkOS · Istorice), text, an, sediu, stare; paginare deterministă (data descrescător, apoi ID); `id` deschide o singură lucrare (detaliul istoric).
- Numărători: registrul și sumarul clientului poartă `jobCount` (numai producția WorkOS), `historicalWorkCount` și `workCount` (= lucrările clientului). Tabul „Lucrări”, cartela și registrul Clienți afișează `workCount`, cu detaliul „În WorkOS · istorice” în titlu; utilizarea sediilor spune explicit „Lucrări WorkOS” și „Lucrări istorice”; mesajul de relație goală spune „în WorkOS”.
- Deschidere: lucrarea WorkOS deschide fișa lucrării existente; lucrarea istorică deschide detaliul înregistrării în secțiunea Lucrări (`?sectiune=lucrari&lucrare=<id>`, cu contextul listei păstrat în URL): denumire, perioadă, sediu, descriere, referință, documente și fotografii (aceleași ca în Istoric), „Modifică” și „Adaugă documente sau fotografii” după permisiuni. Din Istoric, titlul unei lucrări istorice deschide același detaliu.
- Contextul listei folosește același mecanism ca Istoricul (`listContext.ts`: URL + `registryMemory`, cheia `workos-po.client-works.v1`, separată pe client, ștearsă la schimbarea sesiunii).

## Istoric căutabil

`GET /api/customers/:id/history?q=&year=&site=&state=&provenance=&page=&pageSize=` — proiecte WorkOS, lucrări istorice și documentele nelegate de o cerere/lucrare. Caută (fără diacritice, fără majuscule) în titlu, referințe de cerere și ofertă, lucrări, sedii și metadatele documentelor (titlu, număr, nume fișier, descriere, etapă).

**Cuvintele căutării (N-020, corecția „Ghimbav 2021”).**
- Textul se normalizează: fără diacritice, fără majuscule, spațiile multiple se reduc.
- Se împarte în cuvinte, iar **fiecare cuvânt trebuie găsit în aceeași intrare**: ca subșir într-unul dintre câmpurile ei căutabile sau, pentru un an scris cu patru cifre, în perioada ei documentată. De exemplu, „Ghimbav 2021” găsește lucrarea de la Depozit Ghimbav din iun.–iul. 2021, deși sediul și anul sunt în câmpuri diferite.
- Ordinea cuvintelor, majusculele și spațiile nu schimbă nici rezultatul, nici explicația.
- **Anul** este cel al perioadei documentate a intrării:
  - lucrarea istorică: de la `eventDate` la `eventDateEnd`, **inclusiv toți anii dintre ele** — o lucrare din nov. 2025 – feb. 2026 se găsește cu 2025 și cu 2026, nu cu 2024 sau 2027;
  - proiectul: data cererii (sau a primei oferte ori lucrări);
  - documentul încărcat: data documentului.
- **Data încărcării nu este o dată documentată:** un document fără dată nu se găsește după an, deși lista îl așază după ziua încărcării.
- Un an poate apărea și ca subșir într-un câmp, de exemplu în numărul facturii F-ALC-2021-0412; acel câmp este atunci și el o potrivire reală.
- **„Găsit în”** (`matchedOn`) numește doar câmpurile care conțin efectiv unul dintre cuvinte, într-o ordine fixă: sediul, „Anul AAAA”, apoi câmpurile în ordinea lor. Un câmp care nu a contribuit nu apare.
- **În interfață** linia de deasupra listei arată doar numărul de rezultate, textul căutat, filtrele active și comenzile de resetare. Fiecare card spune compact de ce a fost găsit, grupând etichetele `matchedOn` pe tip: „Potrivire: sediu · anul 2021 · titlu · referință · fotografii (2) · documente (2)” (`history/matchSummary.ts`; nicio etichetă adăugată). Lista completă a serverului se deschide în card cu „Detalii potrivire”, un buton cu `aria-expanded`. Starea e locală, așa că deschiderea nu schimbă adresa, căutarea sau filtrele.
- Textul nu se transformă într-un filtru: se combină prin ȘI cu filtrele explicite, iar interfața îl trimite neschimbat serverului și nu caută ea însăși.
- Lucrări (`works.ts`) citește căutarea cu aceeași funcție ca Istoricul (`matchSearchTerms`, `searchTermsOf`, `yearsBetween` din `history.ts`) — etapa 4, mai jos. Filtre: an, sediu, stare, proveniență (`WORKOS` · `HISTORICAL_RECORD` · `UPLOAD`; o valoare necunoscută este ignorată). Ordine deterministă: data evenimentului descrescător, apoi ID. Paginare cu `pageSize` ≤ 50. Fiecare rezultat dă acces direct la document (previzualizare/descărcare) sau la cerere/ofertă/fișa lucrării; `matchedOn` spune unde s-a găsit textul. Se citesc doar metadate: nicio căutare nu deschide fișiere. OCR și căutarea în conținutul PDF nu fac parte din etapă.

**Filtre combinate și numărători (GO 8).** Filtrele se combină prin ȘI. `totals` descrie colecția completă, independent de filtre și pagină: `entries` = `projects` + `historicalWorks` + `uploads`, plus `documents` (fișiere care nu sunt fotografii) și `photos`. `total` = rezultatele după text și filtre. Fiecare valoare de fațetă (`yearCounts`, `sites[].count`, `states[].count`, `provenances[].count`) numără intrările care trec textul și toate celelalte filtre active, mai puțin propria dimensiune; astfel numărul de lângă o opțiune spune câte rezultate dă alegerea ei acum. Documentele încărcate (`UPLOAD`) nu au stare: un filtru de stare nu le găsește niciodată. Proveniența este calculată de proiecție, nu de interfață.

**Contextul căutării în interfață.** Textul, anul, sediul, starea, proveniența și pagina stau în URL (`?q=…&an=…&sediu=…&stare=…&provenienta=…&pagina=…`; intrarea extinsă: `&deschis=<entryId>`; Fotografii adaugă `&etapa=…`) și se schimbă prin `navigate(…, "replace")`, ca filele secțiunilor. Refresh, link direct și Back/Forward le citesc din URL. Memoria de registru existentă, prin același modul ca Lucrările (`listContext.ts`; `registryMemory`, cheia `workos-po.client-history.v1`, separată pe client, ștearsă la schimbarea sesiunii ca celelalte registre) le restaurează la revenirea în Istoric din altă secțiune sau printr-un link fără parametri, fără a reseta pagina. O schimbare manuală de text sau filtru readuce intenționat pagina la 1. **Resetarea nu este o revenire (GO 10):** o schimbare manuală se scrie în memorie înainte ca adresa să se schimbe. Astfel, eliminarea ultimului filtru, „Golește filtrele”, ștergerea textului sau revenirea la „Toți anii / Toate sediile / Toate etapele” lasă lista fără filtre și după refresh sau Back/Forward. Restaurarea rămâne doar pentru revenirea pe secțiune (fila sau un link fără parametri) și e separată pe client și pe sesiune. Poziția și focusul la Back/Forward vin din `navigationMemory`; tastarea nu pierde focusul (înlocuirea intrării fără schimbare de secțiune nu mută derularea).

**Prezentare (GO 8 · Figma pagina 10).** Istoricul grupează intrările pe ani, în ordinea serverului. O intrare restrânsă arată miniatura reprezentativă (după montaj, altfel simulare, altfel înainte), eticheta etapei și „Ilustrativ” (citit din titlul/descrierea declarată la încărcare; nu există câmp de schemă), starea sau „Ramuri în stări diferite” cu starea fiecărei ramuri, proveniența separată de stare și numărul de oferte, fișiere atașate (fără fotografii) și fotografii. Extinsă, arată fotografiile în ordinea lucrării (înainte → simulare → după montaj, apoi data), un singur nod Cerere și câte o ramură pe ofertă (sau pe lucrare fără ofertă), cu lucrarea sau „Nicio lucrare — oferta nu este acceptată”; fișierele stau la nodul căruia îi aparțin, fotografiile numai în galerie. Fotografii: *înlocuit de „Etapa 6 · Fotografii”, mai jos* (galeria pe grupuri, filtrele deasupra galeriei, vizorul comun). Sedii: ultima fotografie documentată a unei intrări de la acel sediu, cu data ei; nu pretinde starea de azi.

**Compoziție și derulare (GO 9 · fidelitate față de pagina 10).**
- **Desktop ≥ 1100 (422:190 / 422:1008).** Bara WorkOS (56) + rândul clientului (68: înapoi, monogramă, nume cu „CLIENT ACTIV · CUI”, contactele pe un rând — sub 1440 primul contact și „Toate contactele ▾” —, cereri deschise, „Lucrare istorică”, „Cerere nouă”) + filele (44) sunt fixe. La derulare, rândul și filele se contopesc într-o linie de 56 px: identitate, file, „Cerere nouă”. Coloana laterală are 208 px, e lipită sub straturile fixe și derulează separat. Sumarul este o bandă de cinci celule pe un singur rând; textele secundare se termină cu „…” și rămân în tooltip.
- **Tabletă 768–1099 (422:3015 / 422:3305).** Rândul are 64 px: „←”, monogramă, nume, „CUI · Contacte ▾”, „⋯” (cereri deschise, „Lucrare istorică”), „Cerere nouă”. La derulare devine o linie scurtă cu „Cerere”. Filele și bara Căutare · ani · „Filtre” rămân sus. Foaia „Filtre” cuprinde sediu, stare și proveniență. Sumarul devine un rând de jetoane derulabil, cu „Necesită atenție” primul.
- **Telefon < 768 (422:4135 / 422:5018; ajustare locală autorizată în GO 10).** Rândul conține „←” (control compact de 44 × 44, numit „Clienți · …”), monograma plină, numele, „CUI · Contacte ▾ · Acțiuni ▾” (al doilea rând se poate rupe) și „Cerere” sus; nu există un al doilea buton jos. „Contacte” conține doar contactele și câmpurile necompletate. „Acțiuni” e un meniu separat: cererile deschise și, după permisiune, „Lucrare istorică”. Ambele panouri se închid cu Esc sau cu un clic în afară și redau focusul butonului. Fix este doar bara WorkOS; după ce rândul iese din ecran, rămân sus identitatea scurtă, filele și bara Căutare · An · Filtre. Proiectul restrâns: data în eticheta de sus, ofertele în rândul sediului, „N foto”. Proiectul extins arată o fotografie odată, cu „1 / 2”.
- **Înălțimi.** Sunt măsurate la rulare (`--dh-shell-h`, `--dh-band-h`, `--dh-sticky-top`, `scroll-padding-top`), astfel încât elementele fixe nu acoperă conținutul sau focusul.
- **Bara WorkOS.** Devine lipicioasă numai pe pagina clientului (`.app-shell:has(.chub)`). Celelalte pagini rămân neschimbate.
- **Fotografii.** Înlocuit de „Etapa 6 · Fotografii”, mai jos: meniul „⋯” rămâne (Descarcă, Asociază, Modifică datele); pe tabletă și telefon, căutarea și „Filtre” (An, Sediu, Etapă, Asociere).

**Vederile hubului (GO 11 · cadrele 422:2757, 422:5579, 422:5950, 422:6080, 422:6840, 422:6952).**
- **Limbaj comun:**
  - linkurile se recunosc după culoare, iconiță și poziție; sublinierea apare doar la hover și la focus de tastatură;
  - linkul e pentru navigare, butonul pentru acțiune;
  - chenarele sunt fine și continue; doar locul gol „Fără fotografie” păstrează conturul întrerupt deschis la culoare din Figma;
  - coloana de filtre (`RailGroup`, `railOption`) e comună pentru Istoric, Lucrări, Fotografii, Documente și Cereri și oferte.
- **Cereri și oferte** (`?sectiune=cereri`, `selectie=cereri|oferte`, `q`) — *înlocuit de „Etapa 3 · Cereri și oferte” de mai jos; păstrat ca istoric*:
  - toate cererile, inclusiv cele fără ofertă, și toate ofertele, inclusiv cele fără comandă sau lucrare;
  - fiecare cerere arată ce a rezultat din ea, numărat din legăturile serverului (`requestId`, `orderSnapshotId`), plus „Vezi în istoric” (`deschis=project:<requestId>`) și „Deschide cererea”;
  - fiecare ofertă arată suma și moneda (sau „Valoare indisponibilă”, niciodată 0), cererea, lucrarea făcută din comanda ei, starea și acțiunea serverului;
  - selecția și căutarea înlocuiesc intrarea din istoric; Back după un link din „Pe scurt” revine în Istoric;
  - o selecție fără rânduri are text propriu.
- **Lucrări** (*înlocuit de „Etapa 4 · Lucrări” de mai jos; păstrat ca istoric*):
  - o singură familie de carduri: fotografie, proveniență (o dată, sus), titlu, ce s-a făcut, sediu · dată · fișiere, starea și intrarea în dreapta;
  - coloana are Proveniență, An, Sediu și Stare, cu contoarele serverului; un contor pe care serverul nu îl trimite rămâne gol;
  - lucrarea istorică se deschide lângă aceeași coloană; revenirea păstrează filtrele.
- **Documente** (`tip`, `an`, `legat`, `sediu`, `q` în URL): înlocuit de „Etapa 5 · Documente”, mai jos.
- **Sedii:**
  - fotografia documentată e cea mai nouă fotografie „Înainte” sau „După montaj”; **o simulare nu este niciodată fotografia sediului**;
  - fotografia își păstrează data și etapa și spune că nu arată neapărat starea de azi;
  - ierarhia cardului: nume → adresă → contact → acces → ce s-a lucrat → linkuri spre istoric, fotografii și documentele sediului. *Înlocuit de „Etapa 7 · Sedii”, mai jos (numărători egale cu destinațiile, banda de revenire, dialogurile).*
- **Date comerciale:**
  - vederea se deschide pentru citire, în trei grupuri: Identitate și facturare, Contacte, Condiții;
  - „Modifică” (după permisiune) deschide formularul cu protecție la modificările nesalvate; după salvare revine la citire;
  - textul spune că datele sunt de referință și nu se aplică singure ofertelor sau comenzilor;
  - contractele și actele adiționale sunt listate separat, cu previzualizare.
  - *Înlocuit de „Etapa 8 · Date comerciale”, mai jos (sursele CUI și contactului principal, formularul în pagină, conflictul cu comparare și reluare, legătura spre Documente).*

**Antetul și sumarul (GO 12 · rafinare locală autorizată de Owner față de pagina 10).**
- **Ierarhie:** identitate → navigare (file) → sumarul relației și ce necesită acțiune.
- **Antet:**
  - numele e reperul principal: se rupe pe rânduri la orice lățime și nu se taie;
  - lângă nume stă starea („Client activ”);
  - pe linia secundară: CUI, apoi valorile contactelor; etichetele lor rămân pentru cititoarele de ecran;
  - „Contacte ▾” deschide lista completă și ce lipsește; „Acțiuni” e separat; „Cerere nouă” rămâne acțiunea principală;
  - pe telefon, pentru un nume lung (peste 32 de caractere), „Cerere nouă” se restrânge la „+” și își păstrează numele accesibil.
- **Sumarul „Pe scurt”** are cinci repere, fiecare un link cu nume explicit, fără linkuri imbricate:
  - cereri deschise (`selectie=cereri`, cu căutarea reținută);
  - oferte (`selectie=oferte`), cu „N cu comandă”;
  - Necesită atenție, singurul accent cald;
  - lucrări (fila Lucrări, cu contextul ei);
  - Dosar, un grup cu trei linkuri: documente, fotografii, sedii.
- **Atenția:**
  - duce la Cereri și oferte cu `atentie=1`: toate rândurile numărate, inclusiv lucrările care așteaptă;
  - formularea specifică („2 oferte · urmează acceptarea”) apare doar când tipul și motivul sunt comune tuturor rândurilor serverului; altfel e neutră („3 elemente · 1 cerere · 2 oferte”);
  - motorul acțiunii următoare nu se schimbă.
- **Căutarea** din Istoric stă sub sumar, imediat deasupra listei.
- **Contextul listelor:**
  - Documente (`q`, `tip`, `an`, `legat`, `sediu`) și Cereri și oferte (`selectie`, `q`, `atentie`) folosesc `listContext.ts`, cu memoria per client, ștearsă la schimbarea sesiunii;
  - resetarea rămâne resetare;
  - previzualizarea unei cereri (`cerere=`) nu restaurează și nu suprascrie contextul.
- **Lucrări:**
  - contoarele de an, sediu și stare vin de la server (`facets.yearCounts`, `facets.sites[].count`, `facets.states[].count`): fiecare numără ce ar arăta opțiunea, cu celelalte filtre active păstrate (inclusiv textul și proveniența), fără propria dimensiune;
  - o lucrare fără fotografie proprie primește fotografiile cererii doar ca context (`requestPhotos`); asocierile nu se schimbă;
  - dacă cererea are o singură lucrare, miniatura apare marcată „Din cerere · nu e fotografia lucrării”;
  - dacă are mai multe, nu se atribuie nimic: apare nota „N fotografii în cerere, comune mai multor lucrări”, cu link la proiect (*etapa 4: textul din 648:13594, fără link — mai jos*).
- **Sedii și Date comerciale** folosesc lățimea paginii, fără o a doua margine laterală. Cardurile de sediu umplu rândul (`auto-fit`).

## API

| Rută | Permisiune |
| --- | --- |
| `GET /api/customers/:id/dossier` (sedii, documente, lucrări istorice, ținte de asociere, vocabular, permisiuni) | `read` |
| `GET /api/customers/:id/history` | `read` |
| `GET /api/customers/:id/works` | `read` |
| `GET /api/customers/:id/documents/:docId/content?disposition=inline\|attachment` | `read` |
| `GET /api/customers/:id/sites` | `read` |
| `POST /api/customers/:id/sites`, `PATCH …/sites/:siteId`, `PUT …/site-assignments` | `editSites` |
| `POST /api/customers/:id/documents` (multipart) | `uploadDocuments` |
| `PATCH …/documents/:docId`, `POST …/documents/:docId/links`, `DELETE …/documents/:docId/links?kind=&subjectId=` | `editDocuments` |
| `POST /api/customers/:id/historical-works`, `PATCH …/historical-works/:workId` | `recordHistoricalWork` |
| `PUT /api/customers/:id/works/representative-photo` (N-021) | `editDocuments` |
| `GET /api/customers/:id/logo/content?revision=N` (N-023) | `read` |
| `PUT /api/customers/:id/logo` (multipart), `DELETE /api/customers/:id/logo?expectedRevision=N` (N-023) | `editLogo` |
| `GET /api/customers/:id/commercial-terms` | `read` |
| `PUT /api/customers/:id/commercial-terms` | `editCommercialTerms` |

Revizia unei modificări:
- **`PATCH` pe sedii, documente și lucrări istorice** cere `expectedRevision`, un întreg pozitiv; fără el răspunsul e `400 invalid_payload` cu `field: "expectedRevision"`.
  - Scrierea e atomică: `UPDATE … SET …, revision = revision + 1 WHERE … AND revision = ?`, cu verificarea rândurilor modificate, deci și între conexiuni sau instanțe pe aceeași bază.
  - O revizie depășită sau o scriere concurentă câștigată de altă cerere dă `409 stale_revision` (cu sediul sau lucrarea actuală; pentru documente doar codul). Nu se scrie nimic și nu se înregistrează niciun eveniment.
  - Două modificări simultane pe aceeași revizie: una reușește, cealaltă primește 409 (`apps/api/tests/customer-dossier-concurrency.test.ts`).
- **`PUT /commercial-terms`**: neschimbat. `expectedRevision` rămâne opțional; o salvare fără el adaugă o revizie nouă, iar istoricul append-only nu pierde nimic.

## Izolare și permisiuni

- Organizația: fiecare cerere rulează pe planul organizației active (bază + rădăcină de documente proprii). Un client, document sau ID al altei organizații nu este găsit (`404`).
- Clientul: fiecare asociere (sediu, cerere, lucrare, lucrare istorică, contract de referință) și fiecare descărcare se verifică față de clientul din cale (`422 subject_not_of_customer` / `404`).
- Roluri (modelul existent owner/member): `owner` și `member` citesc, editează sedii, încarcă și asociază documente, înregistrează lucrări istorice; numai `owner` modifică datele comerciale (termen de plată, avans, monedă), ca la prețuri. Matricea este în `apps/api/src/customerDossier/access.ts`.
- Fișiere: limita existentă de 50 MB (aceeași ca la atașamentele cererii), stocare prin `writeScopedDocumentBytes` sub `documents/customers/<clientId>/` cu cheie opacă, verificare SHA-256 la descărcare, `nosniff`; previzualizare în pagină numai pentru PNG/JPEG/GIF/WebP și PDF, restul se descarcă.
- Date înghețate: modificarea clientului, a sediului sau a condițiilor nu atinge ofertele/comenzile înghețate; istoricul păstrează sediul de la momentul asocierii; versiunile vechi ale condițiilor rămân.

## Migrare

`apps/api/src/persistence/migrations/047_customer_dossier.sql` — numai tabele și indexuri noi; nicio tabelă existentă nu se modifică. Aplicată în testele izolate, pe copia demonstrativă `demo-dosar-client-n020` și pe copiile ei restaurate de verificare/probă. Neaplicată pe originalul N-019, pe runtime-ul de referință sau pe date reale. Corecțiile review-ului nu schimbă schema.

**Design final N-020 · etapa 1: structura comună și Istoric (implementare locală, în review).** Referința vizuală este indexul `INDEX_CADRE_CURENTE.md` / Figma 795:185 (pagina 12); cadrele din afara indexului sunt arhivă. Această etapă înlocuiește, pentru antet, navigare și Istoric, descrierile GO 9–12 de mai sus; celelalte vederi rămân cum sunt descrise acolo.
- **Antet comun (574:2203):**
  - „← Toți clienții”, apoi monograma, numele, „Client activ” și „CUI · localitate”;
  - pe desktop, contactul principal are o coloană proprie, cu „Toate contactele · N”;
  - acțiunile: „+ Cerere nouă” și, dedesubt, „Alte acțiuni”.
- **Panoul contactelor (579:5369):**
  - contactul principal vine din fișa clientului; contactele comercial și de facturare vin din condițiile comerciale;
  - rolul se afișează doar când reprezentantul din condiții este aceeași persoană;
  - panoul mai cuprinde adresa și câmpurile necompletate, iar cu permisiune „Modifică în Date comerciale”.
- **„Alte acțiuni” (579:5140)** arată numai ce permite serverul: „Adaugă lucrare istorică”, „Încarcă document”, „Adaugă sediu”, „Modifică datele comerciale”. Ultimele trei deschid secțiunea cu `actiune=incarca|adauga|modifica`. Secțiunea pornește aceeași acțiune ca butonul ei, doar cu permisiunea primită de la server, apoi scoate `actiune` din adresă, astfel că refresh-ul sau Back nu redeschid formularul.
- **Navigare:**
  - desktop: șapte file, cu Cereri și oferte a doua („3 cereri · 4 oferte”, din `requestCount` și `quoteCount`);
  - tabletă (588:7090): primele trei file, cu fila curentă mereu vizibilă, iar restul sub „+ N secțiuni”;
  - telefon (649:14364): bara închisă „Secțiunea · Schimbă”, care deschide foaia secțiunilor (588:8844) cu indicii și numărători; descrierea Lucrărilor vine din `jobCount` și `historicalWorkCount`;
  - fiecare filă înlocuiește intrarea din istoric și redeschide lista cu contextul ei.
- **La derulare:**
  - desktop (579:6351): monograma, numele, filele și „+ Cerere nouă” rămân pe o linie sus, iar bara de căutare se lipește sub ea, cu „Istoric” în stânga;
  - telefon (580:4114): bara afișează „← client / Istoric · an”, unde anul este cel din vizor.
- **Istoric (604:8132):**
  - titlul și „Prima activitate documentată: AAAA”, adică cel mai vechi an din fațetele nefiltrate; nu este începutul relației comerciale;
  - un client fără nicio intrare (578:2874) primește în loc mesajul de pornire, cu acțiunile permise, fără „De urmărit” și fără căutare.
- **„De urmărit” (649:14128):**
  - un singur buton cu sumarul explicit, închis implicit și deschis doar de operator; lipsește când nu există situații; căutarea nu îl ascunde;
  - situațiile vin din rândurile serverului: ofertele marcate pentru atenție (grupate pe cerere, cu referință, sumă și sediu), cererile și lucrările marcate, lucrările în execuție și cele nefinalizate;
  - punctul este cald doar pentru ce marchează serverul; o lucrare în curs sau nefinalizată are punct neutru;
  - „nefinalizată” nu înseamnă „în curs”;
  - când Istoricul e filtrat pe un sediu (712:22460), „De urmărit” nu se afișează, pentru că situațiile lui sunt ale întregului client.
- **Căutare și filtre (588:8038):**
  - câmpul are „Șterge”; pe desktop, filtrele An · Sediu · Stare · Proveniență sunt meniuri în care „Toate …” golește doar filtrul lor;
  - lângă filtre apare „N din total”;
  - linia de rezultat spune „N rezultate pentru „q””, unde s-a găsit textul (`matchedOn`) și filtrele active, cu „Șterge căutarea”, „Șterge filtrul” sau „Golește filtrele” și, când există ambele, „Golește tot”;
  - pe tabletă și telefon: „Filtre” deschide o foaie, iar sub căutare stă rândul „Salt la an”;
  - cât se încarcă un nou rezultat, rămâne afișat cel anterior (ocupat), ca să nu se piardă focusul și poziția.
- **Ani:**
  - pe desktop, coloana „Salt la an” are toți anii clientului; un an atins de căutare și filtre arată câte intrări are acum (fațeta serverului), iar unul neatins își păstrează numărul total;
  - un an fără rezultate pentru căutarea curentă rămâne pe loc, estompat și dezactivat;
  - anul din vizor e marcat, iar „↑ Începutul” apare după derulare.
- **Carduri:**
  - restrâns (604:8170): miniatura cu etapa scrisă pe ea, ca simularea să nu pară montaj; eticheta „Proveniență · Cerere …”; titlul; „sediu · dată”; starea, sau „Ramuri în stări diferite” cu starea fiecărei ramuri; lanțul „Cerere → N oferte · … → N lucrări / fără lucrare încă”; contoarele „N oferte · N fotografii · N fișiere”;
  - în lanț, ofertele păstrează motivul de atenție al serverului numai când este comun tuturor; altfel fiecare etapă apare cu numărul ei;
  - un proiect cu o ofertă marcată de server are chenar cald;
  - documentul încărcat spune „Fără stare · fără cerere sau lucrare”.
- **Extins:**
  - proiect (813:31187 / 813:31490 / 813:31793 / 813:31918, `history/ProjectTree.tsx`): cererea o singură dată (referință, titlul pe desktop, „stare · data cererii”, „Deschide cererea →”); „Oferte și lucrările lor · N”, câte un rând pe ofertă (Rând ofertă 605:8715: sumă și referință, produs, „creată …”, eticheta ofertei, lucrarea, „Previzualizează”, „Deschide oferta →”). Eticheta ofertei este motivul de atenție al serverului (cald) sau etapa ei („Cu comandă” după comandă). Lucrarea își spune propria stare și progresul („Lucrare · Execuție în curs · 0 / 12 →”, spre fișa lucrării) sau „Fără lucrare · oferta nu are comandă”. Fiecare ofertă și fiecare lucrare apare o singură dată;
  - materialele cererii stau separat de ale lucrărilor: „Fotografiile cererii” și „Documentele cererii · N” (cu „Niciun fișier atașat” când nu există), apoi, numai pentru ramurile cu lucrare, „Documentele lucrărilor” → „Documentele lucrării · ofertă · produs · stare”, cu fotografiile și fișierele legate de acea lucrare (`links` de tip `JOB`). Vizorul unei fotografii parcurge doar setul ei;
  - „Previzualizează” deschide dosarul ofertei (același ca în Oferte, `RequestOfferPreview`) peste listă, cu `&oferta=…` (și `&foaie=comanda`) lângă căutare, filtre și `deschis=`. Prima deschidere e o intrare nouă de istoric: Back sau „Închide dosarul” o închide, iar focusul revine pe butonul care a deschis-o;
  - lucrare istorică (579:6351): fotografiile în ordinea lucrării, fișierele cu „Previzualizează” și „Descarcă”, descrierea, „Deschide fișa lucrării →” și „Istoricul sediului …”, care aplică filtrul de sediu;
  - pe telefon, o fotografie odată, cu „1 / N” și comutare.
- **Extinde/Restrânge** păstrează căutarea și filtrele (`deschis=`); după restrângere, focusul revine pe „Extinde”, iar după extinderea făcută de cititor, pe „Restrânge”. Când adresa redeschide intrarea (Back/Forward, link, refresh), focusul rămâne cel refăcut de `navigationMemory` (linkul care a dus mai departe: cererea, oferta, fișa lucrării).
- **Vizorul și previzualizarea** redau focusul elementului care le-a deschis. Focusul redat nu derulează pagina (`preventScroll`), inclusiv pentru meniurile și foile din benzile lipite.
- **Revenirea din Sedii** (712:22460) se face cu „← Sedii · sediul”, prin `originBack`, numai când originea este secțiunea Sedii a acestui client. Etapa 7 extinde aceeași bandă la Lucrări, Documente și Fotografii (`sites/originFromSites.ts`, `SitesOrigin.tsx`).
- **Stări:** în Istoric, execuția, producția și comanda sunt neutre (`--color-info` la 15 %, text principal; Stare 557:3559 în 604:8199). Culoarea caldă rămâne pentru atenție. Tokenurile comune `--dh-*` ale celorlalte vederi nu se schimbă.
- **Proiect extins:** implementat local după cadrele revizuite din secțiunea 813:31186 (GO 2026-10-25, folosire autorizată pentru implementare, nu acceptare). Numărătorile și stările din cadrul ilustrativ B nu sunt reproduse: totul vine de la server.
- **Antetul restrâns** (579:6351) pe tabletă și desktop îngust: filele afișate sunt doar cele care încap lângă nume și „Cerere nouă” (`header/fitSections.ts`, măsurate dintr-o copie ascunsă a filelor). Secțiunea curentă rămâne întotdeauna filă, celelalte sunt în „+ N secțiuni”. Dacă nici fila curentă și meniul nu încap, numele se scurtează (complet în antetul paginii). Nicio filă nu ajunge sub buton sau în afara vederii.
- **Stil:** `client-dossier-header.css`, `client-history-timeline.css` și `client-history-project.css` (proiectul extins), modulare, cu tokenurile temei pentru Light și Night; `ui.css` nu se schimbă.

## Cod

| Responsabilitate | Locație |
| --- | --- |
| Reguli și proiecții (fără I/O) | `packages/domain/src/customerDossier/{sites,documents,commercialTerms,historicalWorks,history,works,text}.ts`; numărătorile în `packages/domain/src/customers/workspace.ts` |
| Acces, permisiuni, jurnal | `apps/api/src/customerDossier/access.ts` |
| Sedii / documente / condiții / lucrări istorice / istoric | `apps/api/src/customerDossier/{sites,documents,commercialTerms,historicalWorks,history}.ts`, înregistrate de `routes.ts` |
| Seed demonstrativ | `apps/api/src/customerDossier/seed/{clientDossierSeed,alphaClimaScenario,demoFiles,clientDossierSeedCli}.ts` |
| Numărători pentru registru/sumar | `apps/api/src/customerDossier/counts.ts` (citit de runtime) |
| Interfață | `src/surfaces/clients/dossier/*` (inclusiv `header/` — `ClientContacts`, `ClientActions`, `ClientSectionNav`, `contactsModel`, `entryAction`, `sectionDetail` —, `history/` — `watchModel`, `HistoryWatch`, `HistoryTools`, `filterOptions`, `HistoryFilterGroups`, `HistoryYearRail`, `yearInView`, `HistoryEntryCard`, `branchChain`, `opened` —, `ClientBand.tsx`, `FilterSheet.tsx`, `listContext.ts`, `ClientHistorySection.tsx`, `ClientPhotosSection.tsx`, `PhotoViewer.tsx`, `historyModel.ts`, `historyParts.tsx`, `ClientWorksSection.tsx`), `src/api/customerDossier.ts`, `src/adapters/customerDossierAdapter.ts`, `src/styles/surfaces/client-dossier.css`, `src/styles/surfaces/client-history.css`, `src/styles/surfaces/client-dossier-header.css`, `src/styles/surfaces/client-history-timeline.css`; Documente (etapa 5): `src/surfaces/clients/documents/*`, `src/styles/surfaces/client-documents.css`, `client-document-viewer.css`, `client-document-dialogs.css`; Sedii (etapa 7): `src/surfaces/clients/sites/*`, `src/styles/surfaces/client-sites.css`, `client-sites-origin.css`; Fotografii (etapa 6): `src/surfaces/clients/photos/*`, `dossier/PhotoViewer.tsx`, `dossier/menuReturn.ts`, `src/styles/surfaces/client-photos.css`, `client-photo-viewer.css` |

Secțiunile clientului (design final N-020 · 574:2203): **Istoric** (implicit; „De urmărit” înlocuiește sumarul „Pe scurt”) · **Cereri și oferte** (`?sectiune=cereri`, numărat „N cereri · N oferte”) · Lucrări · Documente · Fotografii · Sedii · Date comerciale, fiecare cu numărul serverului (Istoric = `totals.entries`, Lucrări = `workCount`, Documente = `totals.documents`, Fotografii = `totals.photos`, Sedii = numărul sediilor). Cereri și oferte cuprinde toate cererile și ofertele (inclusiv fără lucrare), cu previzualizarea ofertei (etapa 3, mai jos); se deschide din filă și din „De urmărit”. Compatibilitate: `?sectiune=prezentare` deschide Istoric; un link vechi cu `?cerere=…` (fără secțiune sau cu `prezentare`) deschide Cereri și oferte la acea cerere (previzualizarea cererii nu mai există: „Deschide cererea →” duce la pagina ei). Portofoliu și Fișiere nu mai apar în file; un link direct arată „În pregătire”. Antetul se restrânge la derulare într-o linie lipită sus, împreună cu filele.

## Seed demonstrativ (versionat, idempotent)

`pnpm --filter @workos-final/api demo:client-dossier -- --root <rădăcină demo> --base-url http://127.0.0.1:<port> [--illustrative-images <dir>]`

- `--illustrative-images` (GO 9): un director cu `manifest.json` (`provenance`, care trebuie să spună „ilustrativ”, și `items: [{ key, file }]`). Fiecare cheie trebuie să fie o fotografie a scenariului și să apară o singură dată. Imaginea înlocuiește la populare fixtura schematică a acelui document. Titlul, etapa, data, asocierile și numele fișierului rămân cele din scenariu, iar descrierea primește proveniența declarată. Nu se adaugă documente; o reluare adoptă documentele existente. Folosit pentru copia vizuală `demo-dosar-client-n020-vizual`, nu pentru copia de referință.

- Versiune `N020-CLIENT-DOSSIER-V1`; numai prin rutele API; refuză producția și orice rădăcină care nu este marcată sintetic.
- Registru `client-dossier-seed-ledger.json` și manifest `client-dossier-seed-manifest.json` în rădăcina demo (în afara Git). Un pas înscris nu se reaplică; o entitate găsită după cheia naturală (nume sediu, titlu lucrare, titlu + fișier document, asociere existentă, versiune de condiții existentă) este adoptată, nu modificată. Modificările ulterioare ale operatorului rămân.
- Fișiere generate din cod, deterministe: PDF-uri reale marcate „DEMO — fără valoare comercială” pe pagină și în metadate; imagini schematice declarate „ilustrative, generate sintetic” (în descriere și în PNG). Imaginile sunt fixturi funcționale, nu fotografii realiste, și nu servesc la validarea viitorului design.
- Scenariul Alpha Clima Demo SRL: 3 sedii; cele 3 proiecte WorkOS existente (showroom finalizat 7 oct 2026, recepție cu execuție în curs, casetă depozit în ofertare cu două oferte, a doua adăugată prin motor); lucrări istorice iun–iul 2021, nov 2025 și mar 2026; 9 documente și 10 imagini coerente cu starea fiecărui caz; condiții comerciale versiunea 1 cu contract-cadru de referință; contul bancar lăsat necompletat. Cronologia motorului nu este falsificată: activitatea anterioară sistemului este înregistrare istorică.
- Cazul cu două lucrări pe aceeași cerere este demonstrat pe o copie izolată separată (`demo-dosar-client-n020-probe-ramuri`), nu în copia principală; seed-ul nu a fost refăcut.

## Limite

- Copia de referință N-020 (8895) păstrează fixturile schematice. Imaginile ilustrative Figma sunt doar în copia vizuală separată `demo-dosar-client-n020-vizual`, populată prin seed (`--illustrative-images`). Nu există o funcție generală de ștergere sau înlocuire a documentelor.
- Grupurile din Fotografii păstrează ordinea serverului (cronologic descrescător), fără reordonare pentru umplerea grilei (GO 9; etapa 6 la fel).

- Proiectele WorkOS ale scenariului sunt datate în oct. 2026 (datele demo N-019); întinderea pe aproximativ un an vine din înregistrări istorice, marcate ca atare.
- Fără OCR / căutare în conținut; fără ștergere de documente; fără legături document → document (actul adițional nu este legat formal de contract).
- Previzualizarea PDF în pagină depinde de vizualizatorul PDF al browserului. Etapa 5: vizorul afișează PDF-ul nativ din fișierul descărcat (blob, fără dependență nouă). În Chromium headless vizualizatorul PDF nu există, deci cadrul rămâne gol acolo. Completarea etapei 5 a verificat redarea în Google Chrome cu fereastră: conținut lizibil, bara vizorului (pagini, zoom), derulare, un PDF de 3 pagini până la 3 / 3, deschiderea din Documente, Lucrări și Istoric, link direct și refresh. Un driver de automatizare cu emulare de dispozitiv sau interceptarea cererilor împiedică încărcarea PDF-ului în cadru — o limită a probei, nu a aplicației. Panoul de browser integrat al aplicației desktop tratează PDF-ul ca descărcare.
- Măsurătoarea de 28 ms (mediană) este durata cererilor HTTP locale (căutare + descărcarea fotografiei, client Node pe loopback) pe setul demonstrativ (8 intrări de istoric, 19 fișiere pentru client; 11 clienți în organizație). Nu este timpul de regăsire al unui utilizator (randare, tastare, citire) și nu dovedește performanța la alte volume.
- Starea unei ramuri reflectă etapa lucrării așa cum o raportează motorul; istoricul nu calculează progres propriu.

## Etapa 3 · Cereri și oferte (implementare locală, în review)

Referința vizuală: secțiunea „Corecții GO 17” (640:11187) — 640:11188 / 640:11601 / 640:12261 / 640:11942 la 1440, 647:13268 la 1280, 647:13600 la 768, 643:12057 / 643:12385 / 643:12651 la 390, 643:12900 la 360, Noapte 648:14101 / 648:14327 — și remedierile previzualizării 668:15454 / 668:15766, telefon 668:16010 / 668:16192 (înlocuiesc 642:11970 / 642:12143 / 643:13164 / 643:13293). Stările: 608:9874; cazurile: 608:9487. Această secțiune înlocuiește descrierile GO 11–12 ale vederii.

- **Afișare** (`selectie`): „Pe cereri” (implicit) sau „Toate ofertele”, cu totaluri fixe din spațiul clientului (cereri, oferte). **„În așteptare”** (`atentie=1`) e un filtru separat, valabil în ambele moduri: schimbarea modului păstrează filtrul, iar eliminarea filtrului (✕) păstrează modul. Regula canonică e cea a serverului: oferta cu `needsAttention` (documentația 659:14083); interfața nu adaugă reguli comerciale.
- **Pe cereri:** fiecare cerere o dată (referință, „primită …”, titlu, sediul din `siteAssignments`), **„Starea cererii”** exact cum o trimite serverul („Nouă” rămâne „Nouă”) și, separat, **„Progres comercial”** — numărat din oferte (în așteptare, cu comandă, înlocuite) și din lucrările cererii, cu stadiul lor. O cerere fără ofertă rămâne vizibilă, cu „Nicio ofertă încă…”. Cu „În așteptare”, o cerere cu cel puțin o ofertă în așteptare rămâne întreagă; cererile lăsate deoparte sunt numite sub listă.
- **Toate ofertele:** fiecare ofertă o dată, sub linia cererii ei („Cerere CER-… · titlu · ⌖ sediu”); ofertele fără cerere au „Fără cerere”.
- **Rândul ofertei** (Rând ofertă 605:8715, `OfferRowView`, comun cu proiectul extins din Istoric): sumă și monedă (sau „Valoare indisponibilă”, niciodată 0), referință, produs, „creată …”, eticheta ofertei (motivul de atenție al serverului, „Înlocuită …” cu cuvintele serverului pentru o versiune înlocuită, altfel etapa), apoi — separat — lucrarea făcută din comanda ei (`orderSnapshotId`), cu stadiul ei; o comandă a cărei lucrare lipsește din listă păstrează acțiunea serverului. O versiune înlocuită e tăiată, pe fundal alternativ, cu „Nu e oferta curentă”.
- **Căutare și filtre:** text (titluri, referințe, produse), Sediu (din `siteAssignments`) și anul, care ține de mod: **„Anul cererii”** în Pe cereri (opțiuni și numărători din cereri) și **„Anul ofertei”** în Toate ofertele (opțiuni și numărători din toate ofertele, inclusiv cele fără cerere). Schimbarea modului păstrează anul ales (același număr), căutarea și celelalte filtre; un an activ fără rezultate rămâne în meniu și în foaie, cu 0, marcat ca ales, în linia filtrelor și ușor de eliminat — nu se elimină automat. În Pe cereri cererea din anul ales rămâne întreagă, cu toate ofertele ei (și cele din alt an); o ofertă fără cerere n-are an al cererii, deci nu apare acolo cu un an activ, iar o notă o numește („1 ofertă fără cerere nu are an al cererii; apare în Toate ofertele.”). În foaia de pe telefon și tabletă opțiunea aleasă are marcajul rotund din Istoric. Linia de rezultat apare doar cu text sau filtru („2 oferte în așteptare, în 1 din 3 cereri”; „2 din 4 oferte · În așteptare”). Totul e în URL și în memoria clientului (`listContext.ts`), separat pe client și sesiune; fila secțiunii redeschide **tot** contextul memorat (text, mod, filtre) — regula GO 12, care păstra doar textul, este înlocuită. Resetarea rămâne resetare după refresh și revenire.
- **Previzualizarea ofertei** (`OfferPreviewDrawer`): dosarul ofertei, nu un al doilea vizor — același dialog (`DossierDialog`, varianta `drawer`), aceleași citiri (`useQuoteDossier`, PDF prin `useQuoteDocumentDownload`) și aceeași regulă de istoric (`usePreviewHistory`, `&oferta=` lângă context). Arată doar ce dă serverul: net, TVA, total, textul și măsurătorile confirmate etichetate de server (`quoteSnapshot.truth.measurements`, prin `presentQuotePreviewDetail`), data acceptării, lucrarea și PDF-ul; costul intern și marja nu apar. Încărcarea, eroarea și reîncercarea sunt ale fiecărei părți. Focusul intră pe titlu și revine pe „Previzualizează”; Esc, „Închide” și Back o închid. Pe telefon e o foaie cu antetul scurt (referință · total · Închide) și acțiunile fixe.
- **Revenirea:** „← Istoric” apare doar la sosirea din Istoric (`originBack`). Back/Forward refac intrarea, poziția și focusul (`navigationMemory`); pagina clientului nu mai folosește ancorarea derulării a browserului (`overflow-anchor: none` pe `.chub`), care adăuga 8 px la fiecare revenire când banda se restrângea.
- **Limite de contract (documentate, nu inventate):** configurația canonică a ofertei (`projectQuoteDocument.configuration/technicalSummary`, cu etichetele și unitățile domeniului) nu e expusă ca date, ci doar în PDF — de aceea măsurătorile fără etichetă și cantitățile (care amestecă date pentru client cu date interne) nu apar; lista ofertelor nu spune dacă o sumă lipsește din lipsă de drept sau din lipsă de calcul („Sumă ascunsă” din 608:9874 nu se poate distinge) — de aceea rândul comun al ofertei (Cereri și oferte și proiectul extins din Istoric) spune **„Valoare indisponibilă”**, fără să afirme vreuna dintre cauze; lipsa nu devine 0, iar un 0 trimis explicit de server rămâne sumă; încărcarea și eroarea listei sunt cele ale paginii (spațiul clientului e o singură citire).
- **Stil:** `client-requests.css`, `client-offer-row.css`, `offer-drawer.css`, modulare, cu tokenurile temei; `ui.css` nu se schimbă.

## Etapa 4 · Lucrări (implementare locală, în review)

Referința vizuală (pagina 12, index 795:185; niciun cadru Lucrări nu e înlocuit în index): listă 644:12426, documente la cerere 644:12878, Istorice + 2021 644:13352 / 644:13543, detaliu 648:13642, document 648:13805, 1280 647:13900, 768 647:14189, telefon 644:13766 / 644:14072 / 644:14182, detaliu pe telefon 649:14469, document pe telefon 649:14540, 360 644:14328, Noapte 648:14211 / 648:14447, stări 616:12643, cazuri ilustrative 645:12978 / 648:13594, vizorul din Lucrări 677:19922. Această secțiune înlocuiește descrierea GO 11 / GO 12 a vederii Lucrări (coloana laterală 422:5579 nu mai există).

- **Lista** (`src/surfaces/clients/works/`, `client-works.css`): titlul „Lucrări” cu totalurile serverului („5 lucrări · 2 în WorkOS · 3 înregistrări istorice”; pe telefon „5 · 2 WorkOS · 3 istorice”), aceleași ca în filă (`workCount`) și în registrul Clienți. Cererile și ofertele fără lucrare nu sunt lucrări și nu cresc totalul (proiecția, neschimbată). Lucrările sunt grupate pe anul în care începe perioada lor, în ordinea serverului; fiecare lucrare apare o singură dată.
- **Cardul** (`WorkCard`): identitatea înaintea imaginii — proveniența și referințele serverului (ofertă și cerere pentru o lucrare WorkOS, referința proprie pentru o înregistrare istorică), titlul complet, produsul când titlul nu îl spune, sediul, data („comandată …” pentru WorkOS, perioada documentată pentru o înregistrare) și starea cu progresul scris de server; apoi imaginea, numită: „Imagine: după montaj”, „Imagine: simulare din cerere · nu e fotografia lucrării” (regula GO 12, neschimbată: fotografia cererii doar pentru o cerere cu o singură lucrare) sau, pentru o cerere cu mai multe lucrări, „Fotografiile cererii sunt comune mai multor lucrări: nu sunt afișate aici” (648:13594). Două lucrări cu același titlu se deosebesc prin ofertă, cerere, produs și stare. Proveniența rămâne separată de stare; o înregistrare istorică nu primește operații, pontaje, progres sau comenzi.
- **Documente la cerere** (644:12878): „N documente · N fotografii ▾” deschide sub card documentele (rândurile din Istoric: Previzualizează, Descarcă) și fotografiile lucrării; cardul deschis este `deschis=<workId>` în adresă, scris prin înlocuire (fără intrare nouă în istoric), refăcut de Back/Forward și de refresh. Fără documente și fotografii: „Fără documente încă”.
- **Căutare și filtre:** text, Proveniență (Toate · În WorkOS · Istorice, cu totalurile colecției), An, Sediu și Stare (meniuri pe desktop; „An, sediu, stare” pe tabletă și „Filtre” pe telefon deschid foaia, unde opțiunea aleasă are marcajul rotund — și una cu 0 rezultate). Numerele de lângă An, Sediu și Stare sunt fațetele serverului (fiecare cu celelalte filtre active). Linia de rezultat apare doar cu text sau filtru: „1 rezultat din 5 lucrări · Filtre active: Istorice · An 2021”; „Șterge filtrul / filtrele” păstrează căutarea, „Șterge căutarea” păstrează filtrele, iar fiecare meniu își golește doar dimensiunea. Contextul (text, proveniență, an, sediu, stare, pagină) stă în URL și în memoria clientului (`listContext.ts`, separat pe client și sesiune); resetarea rămâne resetare după refresh și revenire.
- **Paritatea căutării (corecția restrânsă din domeniu, autorizată de GO):** `projectCustomerWorks` folosește aceeași funcție de potrivire ca Istoricul — fiecare cuvânt în aceeași lucrare, iar un an de patru cifre în anii perioadei documentate (lucrare WorkOS: ziua în care comanda a devenit lucrare; înregistrare istorică: de la început la sfârșit, inclusiv). „Ghimbav 2021” găsește aceeași lucrare în Istoric și în Lucrări, cu aceeași explicație („Potrivire: sediu · anul 2021 · …”). Filtrul **An** și grupele de ani citesc anul în care începe perioada, ca în Istoric (o lucrare nov. 2025 – feb. 2026 e găsită de căutarea „2026”, dar stă la 2025 și filtrul An 2026 n-o arată). Data introducerii în sistem nu este niciodată anul lucrării. Totul se filtrează pe server, înainte de paginare.
- **Deschiderea:** lucrarea WorkOS deschide fișa existentă (`/lucrari/:jobId`), neschimbată. Lucrarea istorică deschide detaliul (`lucrare=<id>`): insigna „Înregistrare istorică”, referința, titlul, Perioada, Sediul (cu sediul la data lucrării, când diferă), Stare, nota „Lucrare dinainte de WorkOS: nu are comandă, operații sau pontaje.”, „Modifică” și „Adaugă documente sau fotografii” numai după permisiuni (aceleași formulare), „Vezi în Istoric, la AAAA →”, fotografiile (înainte → după montaj, cu etapa și data) și documentele.
- **Revenirea:** linkul din detaliu numește originea reală — „← Lucrări · Istorice · 2021” când s-a venit din listă, „← Istoric” când s-a venit din Istoric — și revine la acea intrare (poziție, intrarea extinsă, focusul pe controlul de origine); după un link direct duce la lista Lucrări cu contextul ei. Documentul și fotografia se închid (Esc, „Închide”) cu focusul pe controlul care le-a deschis.
- **Stări** (616:12643): încărcarea („Se încarcă lucrările…”), eroarea („Lucrările nu au putut fi încărcate. Filtrele rămân păstrate.” cu „Încearcă din nou”), fără rezultate („0 din 5 lucrări · Nicio lucrare nu corespunde: „…” · Istorice · An 2021.”, cu „Șterge căutarea” / „Șterge filtrele”), client fără lucrări („Nicio lucrare”).
- **360 px:** detaliul are propriul layout (o coloană, fotografiile pe două coloane `minmax(0, 1fr)`). Defectul vechi (fotografia a doua și legenda până la ~379 px) venea din refolosirea grilei cardului de listă (88 px + 1fr) pentru detaliu, care împingea coloanele în a doua coloană; nu e mascat prin tăiere sau scalare.
- **Limite de contract (documentate, nu inventate):** „Document restricționat” (616:12643, acces limitat) nu are contract — API-ul nu marchează documente restricționate; accesul limitat se vede doar prin lipsa acțiunilor Modifică / Adaugă. Vizorul de document (648:13805) rămânea dialogul comun al dosarului (`DocumentPreviewDialog`) — *înlocuit în etapa 5 de `DocumentViewer`*. Linkul din Istoric către o înregistrare istorică se numește încă „Deschide fișa lucrării” (Istoricul nu a fost atins).
- **Stil:** `client-works.css`, modular, cu tokenurile temei; regulile fostei vederi Lucrări au fost scoase din `client-hub-views.css`; `ui.css` nu se schimbă.

## Etapa 5 · Documente (implementare locală, în review)

Referința vizuală: Figma `rM71g74Ph0mkAjAtWuLahy`, pagina 12, index 795:185 — lista 670:16320 (1440), 707:22045 (1280), 673:18393 (768), 673:17004 (390), 673:17508 (360); previzualizarea 707:22391 / 739:888 / 707:22609; încărcarea 672:16509…17657; metadatele 705:22325…23746; conflictul 756:460 / 756:840 / 773:185; asocierile 758:185…2610; telefon 760:213, 786:185…872, A01–A07, B01–B08; Noapte 674:18069…18724. Această secțiune înlocuiește descrierea Documente din „Vederile clientului” și dialogul `DocumentPreviewDialog`.

- **Lista** (`documents/ClientDocumentsSection.tsx`, `documentsModel.ts`): numai fișierele care nu sunt fotografii, fiecare o dată; grupate pe ani (anul documentului; fără dată → anul încărcării, cu nota „fără dată”); data documentului e separată de data încărcării. Filtre Tip / An / Sediu / Asociere (`tip`, `an`, `sediu`, `legat`), căutare `q`; totalul colecției e separat de rezultate („X din N documente”). Opțiunea aleasă rămâne vizibilă și marcată chiar la 0 (inclusiv în foaia de pe telefon). Contextul se memorează per client și sesiune (`listContext.ts`); un link direct cu `document=` are prioritate față de contextul memorat. Desktop: tabel cu un grup pe an; tabletă și telefon: carduri.
- **Ce nu se deduce:** încărcarea nu marchează documentul semnat, aprobat sau plătit; vizorul spune explicit că o factură „nu dovedește încasarea” (contract/act adițional: semnarea; proces-verbal: recepția).
- **Vizorul comun** (`DocumentViewer.tsx`, `useDocumentFile.ts`, `useDocumentPreview.ts`): un singur dialog pentru Documente, Lucrări, Istoric și Date comerciale. Antet cu Descarcă și Închide; PDF nativ din fișierul descărcat (fără dependență nouă), imagini în pagină, „Fără previzualizare” pentru alte tipuri; stări Se încarcă / fișier lipsă sau deteriorat (410/409) / eroare cu „Încearcă din nou”. `document=<id>` în adresă prin mecanismul existent de istoric; închiderea revine la origine cu filtrele, poziția și focusul. Asocierile din vizor sunt linkuri (lucrare, cerere, lucrare istorică, sediu); Back revine la același document.
- **Încărcarea** (`dossier/DocumentUploadForm.tsx`, fluxul existent): un singur fișier, maximum 50 MB, tip, dată, titlu, număr, descriere, asocieri inițiale. Trimiterea e blocată până la răspuns (fără cerere dublă; închiderea, Esc și Back sunt reținute cu „Se așteaptă răspunsul serverului”); eroarea păstrează valorile; succesul actualizează numărătorile. Fără ștergere, înlocuire de fișier, versiuni sau încărcare multiplă.
- **Metadatele** (`DocumentEditDialog.tsx`, `metadataConflict.ts`): PATCH cu `expectedRevision`. O eroare de salvare e separată de conflict. La `409 stale_revision` ciorna rămâne; dosarul se recitește (răspunsul 409 nu conține documentul), se compară doar câmpurile care diferă, apoi „Reia editarea pe versiunea actuală” (câmpurile tale peste revizia nouă, marcate) sau „Folosește versiunea actuală”. Nu se suprascrie nimic automat; un conflict repetat păstrează ciorna. Autorul modificării concurente nu e afișat (API-ul nu îl trimite).
- **Asocierile** (`DocumentLinksDialog.tsx`, `linkTargets.ts`): salvate separat de cele nesalvate; selector cu căutare (fără diacritice). Adăugarea trimite câte o cerere per asociere (API-ul nu are operație de grup): rezultatul parțial spune „X din Y”, păstrează ce s-a salvat și reîncearcă doar ce a eșuat. Eliminarea: confirmare → în curs → eroare cu „Reîncearcă eliminarea” sau succes. Închiderea nu anulează operațiile salvate; fără atomicitate simulată și fără Undo.
- **Limite de contract:** API-ul nu marchează documente restricționate (accesul limitat se vede prin lipsa acțiunilor); nu există cheie de idempotență la încărcare (protecția e în interfață); conflictul nu numește autorul. Motorul, API-ul, schema și dependențele nu s-au schimbat.
- **Stil:** `client-documents.css`, `client-document-viewer.css`, `client-document-dialogs.css`, modulare; regulile `cdos-preview` ale vechiului dialog au fost scoase; `ui.css` nu se schimbă.
- **Încadrarea dialogurilor (completarea etapei 5, 760:213 · A02 · 673:17851):** Asociază, Modifică datele și Încarcă document (inclusiv „Documente pentru lucrare”) folosesc `CreationDialog` cu `framed` (opțional; celelalte dialoguri își păstrează compoziția). Antetul — titlul, rândul de identitate al documentului (tip · număr · dată, respectiv numele fișierului) și închiderea — rămâne sus; numai corpul derulează; `.cdos-bar` ține jos răspunsul serverului (rezultatul parțial și ce păstrează „Închide”, conflictul, eroarea, așteptarea) împreună cu acțiunile. Înălțimile antetului și ale barei devin `scroll-padding`, așa că un câmp focalizat sau ultimul element nu rămân sub ele. Pe telefon dialogul ocupă ecranul (`100dvh`), acțiunile sunt una sub alta; la înălțime mică (≤ 560 px) stau alăturate. Fără fonturi micșorate, scalare sau conținut ascuns. Regulile de salvare nu se schimbă; în timpul trimiterii închiderea rămâne blocată, iar „Închide” nu anulează nimic deja trimis. Focusul: mesajul de așteptare, apoi răspunsul (eroare / succes) îl primesc când butonul apăsat devine inactiv; pe telefon, după închidere, focusul revine la „⋯” (elementul de meniu care a deschis dialogul nu mai există). Stil: `src/styles/layout/creation-dialog-frame.css`.

## Etapa 6 · Fotografii (implementare locală, în review)

Referința vizuală: Figma `rM71g74Ph0mkAjAtWuLahy`, pagina 12, index 795:185, secțiunea 6:
- galeria 675:17860, pagina 675:18371, filtrat 675:18640;
- 1280: 707:21500; 768: 707:21048; telefon 677:18467 / 677:18746; 360: 677:18943;
- vizorul 707:22997, se încarcă 675:19198, indisponibilă 675:19286, din Lucrări 677:19922; telefon 707:23510;
- încărcarea 707:23176 → 677:19575; Noapte 679:19396 / 679:19570 / 679:19945 / 679:19805;
- stări 679:18951; colecție mare 679:18994; filtrat pe sediu 712:23047.

Nu se implementează din arhivă (675:19016, 677:19156, 677:19336, 677:20165, 677:20455). Nu se implementează nici propunerile marcate „PROPUS” (glisarea pe telefon din 677:19246 și etapa „Releveu” din 679:19570): modelul are doar Înainte / Simulare / După montaj, iar glisarea nu e implementată, deci butoanele rămân singura comandă pe telefon.

**Galeria** (`photos/ClientPhotosSection.tsx`, `photosModel.ts`):
- O fotografie este un document de tip PHOTO.
- Grupurile sunt intrările în care le pune serverul:
  - un proiect, prin cererea sau lucrările lui;
  - o lucrare istorică;
  - o intrare proprie pentru fotografia asociată doar unui sediu sau doar clientului.
- O fotografie asociată mai multor obiecte apare în fiecare grup al lor, cu „Apare și la: …”; nu i se alege un grup „principal”.
- Toate numerele numără `documentId` distincte:
  - totalul tabului;
  - „X din N fotografii · G grupuri”;
  - contoarele opțiunilor din filtre.
- Ordinea:
  - grupurile, în ordinea serverului (cronologic descrescător, fără reordonare pentru umplerea grilei);
  - în grup: Înainte → Simulare → După montaj, apoi data.
- Fiecare fotografie arată:
  - etapa și data, sau „încărcată <zi>” când nu are dată;
  - „Ilustrativ”, separat de etapă;
  - proveniența: „din cerere”, „a lucrării”, „din cerere · a lucrării”, „la sediu”, „doar în dosarul clientului”. O simulare din cerere nu devine fotografie a montajului.
- Antetul grupului duce la origine: cererea, înregistrarea istorică, lucrarea sau intrarea din Istoric.
- Lucrările și proiectele fără fotografii sunt numite sub galerie, cu precizarea că lipsa fotografiilor nu înseamnă că lucrarea n-a fost executată.

**Căutare și filtre:**
- Câmpurile în adresă: căutarea `q` și filtrele An (`an`), Sediu (`sediu`), Etapă (`etapa`) și Asociere (`legat`), combinate prin ȘI.
- Sensul fiecăruia:
  - An este anul fotografiei (data ei, altfel ziua încărcării);
  - Sediu este sediul grupului sau un sediu asociat direct fotografiei;
  - Etapă este etapa declarată;
  - Asociere este ce e legat de fotografie: lucrări WorkOS, lucrări istorice, cereri, „Asociate direct unui sediu”, „Doar dosarul clientului”.
- Opțiunea aleasă rămâne vizibilă și marcată la 0, inclusiv în foaia de pe telefon.
- Contextul se memorează per client și sesiune (`listContext.ts`); „Șterge filtrele” rămâne resetare și după refresh sau altă filă.

**Vizorul comun** (`dossier/PhotoViewer.tsx`, același pentru Fotografii, Lucrări, Istoric și Sedii):
- Desktop:
  - bara cu etapa · data, titlul · contextul · „i din n”;
  - comutatorul de etapă, legătura spre origine, Descarcă, „Închide · Esc”;
  - imaginea centrată, cu anterior / următor alături și miniaturile dedesubt.
- Telefon: „Închide” sus, apoi „← Anterioara” / „Următoarea →”, legătura spre origine și Descarcă, fără miniaturi. Gesturi de glisare nu există.
- Imaginea se citește printr-o cerere proprie, cu stări Se încarcă / indisponibilă (410 / 409) / eroare cu „Încearcă din nou”.
- Cadrul ia proporțiile imaginii (fără letterbox).
- Navigarea rămâne în setul grupului, sub filtrele active; tastele ← → și Esc funcționează.
- În Fotografii adresa poartă `fotografie=` și `grup=`, prin regula de istoric a previzualizării. Închiderea revine la galerie cu filtrele și poziția, iar focusul trece pe ultima fotografie văzută.
- Din Lucrări și Istoric, vizorul spune colecția și închiderea revine acolo.

**Încărcare, metadate, asocieri:**
- Încărcarea folosește fluxul comun în dialogul încadrat:
  - imaginea aleasă se vede înainte de trimitere;
  - Tip / Etapă (obligatorie) / Data stau pe un rând; fotografia nu are câmp de număr;
  - mesajul de succes spune grupul în care apare fotografia.
- Metadatele (etapa inclusă) și asocierile folosesc dialogurile din etapa 5, fără schimbarea regulilor.
- Deschise din „⋯”, dialogurile redau focusul butonului „⋯” (`menuReturn.ts`, aplicat și în Documente).
- „Șterge filtrele” / „Șterge căutarea” din linia de rezultat mută focusul în câmpul de căutare (și în Documente).

**Limite:** fără ștergere, înlocuire, versiuni sau încărcare multiplă; fără câmp de schemă pentru „Ilustrativ” (citit din titlu / descriere, ca înainte). Calendarul pentru „Termen” rămâne o cerință separată, nerezolvată în această etapă.

## Etapa 7 · Sedii (implementare locală, în review)

Referința vizuală: Figma `rM71g74Ph0mkAjAtWuLahy`, pagina 12, index 795:185, secțiunea 7:
- vederea 759:451, pagina întreagă 759:185, dezactivat 759:1284;
- destinații: Istoric 712:22460, Lucrări 712:22814, Documente 719:75304, Fotografii 712:23047; vizorul din sediu 712:23330;
- formulare: nou 715:432 / 715:696; modificare 715:925 → 715:1154 → 715:1383; conflict 755:374 → 755:685 → 773:829; închidere 715:1841;
- dezactivare 759:682 → 759:831 → 759:980 → 759:1284, conflict 759:1132, telefon 760:271;
- 1280: 778:730; 768: 778:537; telefon 778:185 / 778:361; formular telefon 726:1330 / 726:1549 / 747:199;
- Noapte 778:996 / 727:76818; stări 716:185 / 716:451 / 716:682 / 716:910.

Cadrul 716:910 („7 sedii”, varianta compactă cu „N documente” în linia de folosire) amestecă documentele atașate direct cu totalul; pentru mai multe sedii se folosește cardul din 759:451, fără acea numărătoare amestecată.

**Cardul** (`sites/ClientSitesSection.tsx`):
- denumirea, cu „INACTIV” pentru un sediu dezactivat;
- adresa și localitatea („Adresă necompletată” când lipsesc);
- „Contact la sediu: nume · telefon” (telefonul e link `tel:`);
- observațiile de acces;
- folosirea, din server (`usage`): cereri · lucrări WorkOS · lucrări istorice;
- „Atașate direct sediului: N documente · N fotografii”: numai fișierele legate de sediu însuși, fotografiile separat de documente, incluse în totalurile destinațiilor;
- „Ultima intrare”: cea mai nouă intrare a Istoricului la sediu, afișată numai când lista citită coincide cu numărul serverului; fără stări deduse.
- Fotografia: cea mai nouă fotografie Înainte sau După montaj din Fotografii filtrate pe sediu, niciodată o simulare, cu etapa, data și „nu arată neapărat starea de azi”. Fără fotografie eligibilă: o casetă discretă „Nicio fotografie documentată”.
- Fotografia se deschide în vizorul comun, în loc, peste setul grupului ei; închiderea revine la card.
- Sediile inactive rămân, la sfârșitul listei (ordinea serverului), pe fond distinct.
- Adresa de facturare apare separat (din Date comerciale), cu legătură spre ele; nu se copiază și nu se sincronizează cu sediile.

**Numărătorile** (`sites/sitesModel.ts`). Fiecare număr este exact ce arată destinația deschisă cu filtrul sediului, citit cu regula acelei vederi; cardul nu are o a doua definiție a apartenenței:
- Istoric: `facets.sites[].count` din `GET …/history`;
- Lucrări: `facets.sites[].count` din `GET …/works` (aceeași cerere ca lista nefiltrată);
- Documente: `buildDocumentsView` cu sediul;
- Fotografii: `buildPhotosView` cu sediul, pe `documentId` distinct.
- Un număr încă necitit apare fără cifră; 0 rămâne o legătură discretă, fără săgeată.
- Verificat în browser pe 8899: toate cele 12 numere (3 sedii × 4 destinații) sunt egale cu rezultatul destinației.

**Revenirea** (`sites/originFromSites.ts`, `SitesOrigin.tsx`):
- Banda „← Sedii · <sediu>” apare în Istoric, Lucrări, Documente și Fotografii numai când originea reală a intrării este Sedii, nu doar pentru că există un filtru pe sediu. Un link direct cu `sediu=` nu arată banda.
- Banda ține linia de rezultat a listei. Urmarea ei face `history.go` înapoi la aceeași intrare: aceeași listă, poziție și focus, fără intrări noi.
- Focusul revine pe legătura exactă din card (`data-row-id`), nu pe fila secțiunii cu același href.
- Previzualizările deschise între timp (document, fotografie) păstrează originea.

**Formularul** (`sites/SiteDialog.tsx`, dialogul încadrat din etapa 5):
- câmpurile și limitele serverului; o singură cerere odată; eroarea păstrează valorile;
- confirmare la închidere cu valori nesalvate.
- Conflictul (`409 stale_revision`, cu sediul actual în răspuns) e separat de eroare:
  - ciorna rămâne;
  - comparația arată Înainte / Ciorna ta / Versiunea actuală doar pentru câmpurile care diferă;
  - „Reia editarea pe versiunea actuală” păstrează modificările tale și ia restul din versiunea actuală;
  - „Folosește versiunea actuală” sau „Renunță la modificările mele”;
  - nimic nu se suprascrie automat; un al doilea conflict repetă pașii.
- Comparația primește focusul (corectat și în dialogul de metadate al documentelor).
- Modificarea sediului nu rescrie adresa păstrată de cereri și lucrări la data asocierii.

**Dezactivare și reactivare** (`sites/SiteStatusDialog.tsx`, `PATCH …/sites/:id` cu `status` și `expectedRevision`):
- confirmarea are numele și consecințele reale: cererile și lucrările asociate rămân la sediu cu adresa de atunci; lucrările istorice, documentele și fotografiile, cu numerele vederilor, rămân în dosar și în Istoric;
- stările: în curs, eroare cu reîncercare, conflict („… versiunea actuală”), „deja inactiv/activ”, succes cu mesaj;
- sediul dezactivat rămâne în listă. Selectorul de atribuire îl arată doar unde era deja ales (regula serverului `site_inactive`); interfața nu adaugă alte refuzuri.

**Limite:**
- Pentru Documente, un document legat de o cerere sau lucrare intră la sediu prin atribuirea acelei cereri sau lucrări (`siteAssignments`), ca în etapa 5. Istoricul folosește sediul intrării. Cele două reguli pot da, pentru același sediu, documente prezente într-o vedere și nu în cealaltă; numerele din card urmează fiecare vedere.
- Nu există ștergere de sediu (contract).

## Etapa 8 · Date comerciale (implementare locală, în review)

Referința vizuală: Figma `rM71g74Ph0mkAjAtWuLahy`, pagina 12, index 795:185, secțiunea 8:
- consultare 720:185; 1280 723:448 / 723:651; 768 726:185; 360 726:783; telefon 726:412;
- modificare 720:651, pagina întreagă 734:185; se salvează 721:185; valoare refuzată 721:412;
- eroare 754:26442 → conflict 754:26646 → comparare 754:26844 → reluare 754:27045 → rezultat 767:185;
- plecare 721:1157 / 721:1273, telefon 726:1766; stări: salvat 721:986, doar citire 721:1475, nicio versiune 721:77046;
- telefon: 783:31001 → 755:241 → 755:297 → 783:31053 → 783:31110 (pagina 783:31231), revizia păstrată 783:31352, eroare 755:185, refuz 726:889;
- Noapte 727:76983 / 727:77092.

**Contractul folosit, neschimbat:** `GET/PUT /api/customers/:id/commercial-terms`. Cele 17 câmpuri, etichetele, monedele, revizia, data salvării și `canEdit` vin din server; validarea e a serverului (`400 invalid_payload` cu `field`, `422 reference_document_not_of_customer`); `409 stale_revision` aduce versiunea actuală (`terms`). Fiecare salvare creează o revizie; serverul nu dă conținutul reviziilor anterioare, deci pagina spune doar câte sunt păstrate.

**Consultarea** (`commercial/ClientCommercialSection.tsx`, `CommercialRead.tsx`):
- titlul cu „revizia N · data” (numai dacă există) și nota serverului; „Modifică” după `canEdit` („Completează” fără nicio versiune);
- trei grupuri: Identitate și facturare · Contacte · Condiții (1440: trei coloane; 1280: două; 768: una; telefon: eticheta deasupra valorii);
- CUI-ul și contactul principal vin din fișa clientului și spun asta („din fișa clientului”); contactele comercial și de facturare vin din datele comerciale; adresa de facturare nu este un sediu;
- o valoare lipsă se citește „necompletat”; contul care a salvat nu este transformat în nume de persoană;
- contractul de referință se deschide în vizorul comun (`document=<id>` în adresă, Esc / Închide / Back revin cu focusul pe „Previzualizează documentul →”); existența documentului nu spune nimic despre semnare sau valabilitate;
- „Deschide în Documente →” duce **întotdeauna** la Documente cu Tip: Contract, Act adițional, și atunci când clientul nu are încă niciunul (atunci rezultatul este „0 din N documente”, cu filtrul vizibil și „Șterge filtrul”); nu deschide niciodată toate documentele. Filtrul Tip acceptă mai multe tipuri, separate prin virgulă; combinația este o singură alegere a filtrului Tip (prima, activă în meniu, în rândul de rezultat și în foaia de filtre de pe telefon) și se elimină întreagă. Back revine cu focusul pe legătură (`data-row-id`). *Corecție etapa 8 (2026-10-26).*
- Fără statistici financiare, solduri sau stări comerciale deduse.

**Modificarea** (`CommercialForm.tsx`, `termsModel.ts`):
- pe ecran lat, în pagină (patru panouri, ca 734:185); pe telefon, pe tot ecranul (`CreationDialog` încadrat, ca 783:31001), cu acțiunile jos;
- pornește din versiunea citită; focusul pe primul câmp;
- „Salvează” trimite o singură cerere cât timp e în curs (butonul păstrează focusul, `aria-disabled`); câmpurile devin doar citire în timpul trimiterii;
- un câmp refuzat de server e marcat, cu mesaj sub el și focus pe el; o eroare păstrează toate valorile și oferă „Reîncearcă salvarea”;
- după succes, consultarea arată valorile confirmate de server și revizia rezultată; antetul (contactele) și adresa de facturare din Sedii urmează prin `refreshCustomerDossier`;
- fără modificări, plecarea e directă; cu modificări, întrebarea comună numește destinația reală (acum și secțiunea clientului: „Dacă pleci spre Sedii”), cu „Salvează și continuă” (prevăzut în 721:1157), „Rămân pe pagină”, „Pleacă fără salvare”; pe telefon, închiderea formularului cu modificări întreabă la fel (726:1766).

**Conflictul** (aceeași regulă ca Sedii, acum într-un modul comun `dossier/draftConflict.ts`):
- ciorna și versiunea de la care s-a pornit rămân; alerta spune revizia salvată între timp;
- „Compară cu revizia N”: doar câmpurile care diferă, Revizia de pornire / Ciorna ta / Revizia N; câmpurile modificate de ambele persoane sunt marcate și apar primele; telefonul le arată în carduri;
- „Reia editarea pe revizia N cu modificările mele”: modificările proprii rămân, celelalte valori vin din versiunea actuală; câmpul modificat de ambii e marcat „Valoarea ta (…). Revizia N avea … — verifică-o”, cel preluat „Din revizia N”; nimic nu se salvează singur;
- „Folosește revizia N” arată versiunea actuală și spune ce s-a schimbat; nimic nu se salvează;
- un al doilea conflict repetă pașii fără pierderea ciornei; rezultatul spune ce s-a păstrat și de unde s-a preluat fiecare valoare, prin ambele conflicte.

**Limite:**
- Indicațiile „Număr întreg, 0–365” și „0–100” sunt textul din design; regula rămâne a serverului (interfața nu validează singură).
- Nu se adaugă câmpuri noi (banca IBAN-ului, expirarea contractului) și nu se construiește consultarea reviziilor anterioare.
- Rămân separate: calendarul „Termen”, „Adaugă fotografie” din card, importul automat al siglei, statisticile financiare.

## Prezentarea R1 (implementare locală, acceptată local de Owner, Draft PR pentru review)

Referința vizuală: Figma `rM71g74Ph0mkAjAtWuLahy`, pagina 12, secțiunea `842:31657`. Figma ilustrează direcția; adevărul rămâne al serverului. Contractul API, schema și seed-ul nu se schimbă în această etapă.

- **Antet** (`header/ClientContacts.tsx`, `ClientActions.tsx`, `ClientSectionNav.tsx`):
  - cardul de contact are inițiale, nume, rol, telefon și e-mail; „Cerere nouă” stă deasupra lui „Alte acțiuni” (40 + 6 + 40 = 86 px);
  - la ≤1379 px e-mailul rămâne în panoul „Toate contactele”;
  - navigarea are etichete scurte, fără numere; un punct apare numai unde serverul semnalează atenție;
  - „Cerere nouă” are contur teal acolo unde secțiunea are propria acțiune principală, după permisiuni.
- **Bara de rezultat** (`ResultBar.tsx`, `resultBarModel.ts`): „X din Y” sau „Toate cele Y”, filtrele active ca chip-uri eliminabile, „Arată toate cele Y” și „se actualizează…”. Este aceeași în Istoric, Cereri, Lucrări, Documente și Fotografii, pe desktop și pe telefon.
- **De urmărit** (`history/HistoryWatch.tsx`, `watchModel.ts`):
  - situațiile semnalate de server apar calde, iar activitatea obișnuită neutră;
  - fiecare situație apare o singură dată;
  - blocul lipsește când nu e nimic de urmărit.
- **Documente:**
  - acțiunile sunt Previzualizează/Deschide și Descarcă;
  - „⋯” (Asociază, Modifică datele) apare numai cu permisiune, rămâne în viewport și funcționează cu tastatura;
  - la 1100–1379 px tabelul folosește `table-layout: auto`, pentru că rândurile de an acoperă șase coloane, iar Tip și Sediu sunt ascunse.
- **Fotografii:**
  - ani în dosar, cu salt la an;
  - grilă adaptabilă, fără reordonare;
  - etapa e separată de „Ilustrativ”;
  - fotografiile sunt numărate o singură dată după ID.
- **Sedii:** trei carduri egale, cu fotografia sus și destinații cu număr; „Adaugă sediu” e acțiunea principală.
- **Date comerciale:** carduri egale, cu eticheta deasupra valorii; „Modifică datele” e acțiunea principală.
- **Formă comună** (`client-r1-shape.css`): colț de 6 px pentru controale și 8 px pentru carduri; butoane de 40 px pe desktop și 44 px pe telefon.

**Limite:**
- Sediul fiecărei cereri și lucrări nu e pliat ca în R1; poziția reviziei în Date comerciale diferă de R1.
- Clientul inactiv nu are probă în browser.
- Încărcarea cu procent sau anulare, calendarul „Termen”, importul siglei și statisticile financiare cer GO-uri separate. Fotografia reprezentativă: N-021, mai jos. Sigla administrată manual: N-023, mai jos; importul automat al siglei rămâne neimplementat.

## N-021 · Fotografia reprezentativă a lucrării (implementare locală, în review)

Înregistrare Notion: [N-021](https://app.notion.com/p/4058ea98e40f81338e9cfd7e0fc3c92b). Nu este sigla clientului, fotografia sediului, coperta cererii sau portofoliul.

- **Ce este.** Pentru o lucrare (lucrare WorkOS `JOB` sau lucrare istorică `HISTORICAL_WORK`) un utilizator autorizat alege cel mult o fotografie. O poate schimba sau poate reveni la regula automată (`representativePhoto()`: după montaj, altfel simulare, altfel înainte).
- **Eligibilitate (server).** Fotografia trebuie să fie:
  - un document `PHOTO` al aceluiași client, în planul aceleiași organizații;
  - asociată explicit acelei lucrări (`customer_document_links`).

  O fotografie a cererii nu devine a lucrării. Pentru o cerere cu două lucrări, asocierea cu lucrarea se face întâi prin „Asociază”. Aceeași fotografie poate reprezenta mai multe lucrări, ales separat pentru fiecare.
- **Persistență.** Migrația `048_work_representative_photos.sql` este aditivă: un rând per lucrare, cu `document_id` (NULL = automat), `revision` care doar crește și motivul invalidării (`UNLINKED` / `NOT_A_PHOTO`). Fișierul și asocierile nu se copiază și nu se schimbă. Etapa reală a fotografiei rămâne: o simulare aleasă e „Imagine aleasă: simulare”. Nu se schimbă starea, progresul sau rezultatele comerciale.
- **API.** `PUT …/works/representative-photo` cu `{ workKind, workId, documentId | null, expectedRevision }` (0 = niciodată aleasă).
  - Scrierea e o singură instrucțiune păzită: revizie + eligibilitate (`INSERT … WHERE EXISTS … ON CONFLICT DO NOTHING` sau `UPDATE … WHERE revision = ? AND EXISTS …`).
  - Răspunsuri: `409 stale_revision` cu `selection` actuală; `422 subject_not_of_customer` / `photo_not_eligible` cu `reason` (`NOT_FOUND`, `NOT_A_PHOTO`, `NOT_LINKED`); `400 invalid_payload` cu `field`.
  - O operație respinsă nu scrie nimic și nu înregistrează eveniment.
  - Evenimente: `WORK_REPRESENTATIVE_PHOTO_SELECTED` / `_CLEARED` / `_INVALIDATED`.
- **Invalidare.** Dezlegarea fotografiei de lucrare sau trecerea documentului la alt tip pune alegerea deoparte în aceeași tranzacție, cu eveniment. Lucrarea revine la regula automată și spune o dată de ce. „Revino la alegerea automată” confirmă nota.
- **Proiecții.** `/works` (`representativePhoto`: `revision`, `status` `AUTOMATIC` / `MANUAL` / `INVALIDATED` / `UNAVAILABLE`, `documentId`), `/dossier` (`representativePhotos` per lucrare, cu referința ofertei/cererii) și `/history` (`representativePhotoId`). În Istoric alegerea se folosește numai pentru o lucrare istorică sau un proiect cu exact o lucrare. Un proiect cu mai multe lucrări păstrează regula automată.
- **Interfață.**
  - Fotografii: „⋯” → „Setează ca reprezentativă…” (sau „Fotografie reprezentativă…” când e deja aleasă), numai cu `editDocuments`.
  - Dialogul (`photos/RepresentativePhotoDialog.tsx`) cere lucrarea exactă când sunt mai multe și arată alegerea curentă a fiecăreia.
  - Stări: se salvează, salvat, eroare cu „Reîncearcă” (lucrarea aleasă rămâne), conflict (dosarul se recitește), fotografie indisponibilă, fotografie fără lucrare (cu „Asociază unei lucrări…”).
  - Pe țiglă: un singur rând discret „Reprezentativă pentru N lucrări”.
  - Lucrări: imaginea aleasă validă, apoi regula automată, apoi contextul cererii (regula GO 12), apoi „Fără fotografie”.
  - Stil: `client-representative-photo.css`.
- **Limite.** Alegerea se face din Fotografii, nu din cardul lucrării. Autorul unei modificări concurente nu e afișat. Migrația 048 a rulat numai pe baze sintetice izolate.

## N-023 · Sigla clientului V1 (implementare locală, în review)

Înregistrare Notion: [N-023](https://app.notion.com/p/4068ea98e40f81009f27f216af919eb1). Este identitatea vizuală a clientului, administrată manual. Nu este o fotografie (`PHOTO`), fotografia unei lucrări (N-021), un document al dosarului, un produs din Catalog sau fișierul grafic de fabricație; `customer_documents.kind` nu primește un tip nou. Nu schimbă oferte, comenzi sau instantanee comerciale acceptate. Este opțională: un client fără siglă funcționează complet și afișează monograma.

- **Persistență.** Migrația `049_customer_logo.sql` este aditivă: tabelul `customer_logo_revisions`, cheia primară `(customer_id, revision)`. Fiecare modificare este o revizie nouă cu prezența siglei (`has_logo`), cheia opacă a fișierului, SHA-256, MIME validat, lățime, înălțime, octeți, numele original, proveniența `UPLOAD`, actorul și momentul. Revenirea la monogramă este o revizie fără fișier (CHECK: câmpurile fișierului sunt fie toate prezente, fie toate absente). Sigla activă este cea mai mare revizie. Nicio revizie și niciun fișier nu se șterg automat. 047 și 048 nu se schimbă.
- **Stocare.** Aceeași stocare a dosarului: `writeScopedDocumentBytes` sub `documents/customers/<clientId>/logo/`, cu cheie opacă; fișierele nu se suprascriu. Un fișier nou a cărui revizie nu poate fi înregistrată (conflict sau eșec de tranzacție) este șters imediat; un eșec la scriere nu înregistrează nimic.
- **API.**
  - `PUT /api/customers/:id/logo`: multipart `file` + `expectedRevision` (0 = clientul nu a avut nicio revizie). Răspuns `{ logo, logoRevision, alreadyApplied }`; `400 invalid_payload` cu `field`; `413 file_too_large`; `422 invalid_logo` cu `reason` (`UNSUPPORTED_FORMAT`, `TYPE_MISMATCH`, `MALFORMED`, `ANIMATED`, `DIMENSIONS`, `EMPTY`); `404`; `409 stale_revision` cu sigla actuală; `503 storage_unavailable`.
  - `DELETE /api/customers/:id/logo?expectedRevision=N`: revenire la monogramă.
  - `GET /api/customers/:id/logo/content?revision=N`: conținutul unei revizii (implicit cea activă).
  - Citire: `/workspace` poartă `logo: { revision, contentHref, width, height } | null` și `logoRevision`; registrul `/api/customers` poartă `logo` pentru fiecare client. Transportul nu conține căi fizice, chei de stocare sau SHA-256.
- **Concurență.** `INSERT … SELECT … WHERE COALESCE(MAX(revision), 0) = ? ON CONFLICT (customer_id, revision) DO NOTHING`, în aceeași tranzacție cu evenimentul: verificarea și scrierea sunt o singură instrucțiune, iar cheia primară oprește și un al doilea scriitor de pe altă conexiune. Două salvări pe aceeași revizie: una reușește, cealaltă primește 409 și nu scrie nimic. `alreadyApplied` se confirmă numai când nu se schimbă nimic real (aceeași siglă activă la revizia citită sau monograma deja activă) ori la reluarea propriei cereri (revizia imediat următoare, același actor, același conținut). Orice altă schimbare intervenită este conflict.
- **Jurnal.** `CUSTOMER_LOGO_SET` și `CUSTOMER_LOGO_CLEARED` în `customer_dossier_events`: actorul, clientul, revizia, revizia și SHA-256 anterioare, formatul și dimensiunile.
- **Formate și validare (V1).** PNG, JPEG, WebP; cel mult 2 MB și 4096 px pe latură. Formatul se recunoaște numai din octeți; tipul declarat și extensia trebuie să corespundă.
  - PNG: semnătura, fiecare chunk cu lungime și CRC, IHDR valid, PLTE pentru paletă, IDAT consecutive, IEND final fără nimic după; datele imaginii se decomprimă (zlib, în flux) și trebuie să aibă exact dimensiunea anunțată, cu un tip de filtru valid la începutul fiecărui rând.
  - JPEG: fiecare segment în limitele fișierului, un singur cadru cu dimensiuni și componente valide, tabele de cuantizare și Huffman înaintea scanării, antetul scanării, datele de entropie până la EOI, nimic după EOI.
  - WebP: containerul RIFF acoperă exact fișierul, chunk-urile se succed exact, o singură imagine statică VP8 sau VP8L (direct sau într-un VP8X cu aceeași pânză).
  - Refuzate: SVG, GIF, animații (APNG, WebP animat), fișiere goale, deteriorate, trunchiate sau cu formatul ascuns sub altă extensie ori alt tip declarat. Fără bibliotecă nouă (`packages/domain/src/customerDossier/logo.ts`, `apps/api/src/customerDossier/logo.ts`).
- **Livrare.** Sesiune obligatorie (401); organizația activă (planul ei, deci clientul altei organizații = 404); clientul din cale (revizia altui client = 404); SHA-256 verificat la fiecare citire (409 dacă fișierul s-a schimbat, 410 dacă lipsește); `X-Content-Type-Options: nosniff`; `Cache-Control: private, no-cache` cu `ETag` = SHA-256 (304 la revalidare); `Content-Security-Policy: default-src 'none'; sandbox`; `Cross-Origin-Resource-Policy: same-origin`.
- **Permisiuni.** Citire: `read` (owner, member). Administrare: acțiunea nouă `editLogo` (owner, member), verificată pe server și publicată în `dossier.permissions`; fără ea, „Sigla clientului” nu apare în „Alte acțiuni”.
- **Registru.** Toate siglele active se citesc într-o singură interogare (`listActiveCustomerLogos`), fără o cerere per client. Imaginea are URL per revizie, revalidat prin ETag.
- **Interfață.**
  - `ClientMark` (`src/surfaces/clients/ClientMark.tsx`, `client-mark.css`) înlocuiește monograma în registrul Clienți (tabel și carduri), cartela clientului, antetul fișei și banda compactă. Arată sigla când există și se încarcă, altfel monograma (și la o eroare de încărcare; o revizie nouă primește din nou o șansă). Sigla este decorativă (numele rămâne vizibil), conținută (`object-fit: contain`), nedecupată și neîntinsă, pe o placă neutră deschisă cu margine de protecție, în Lumină și în Noapte: o siglă neagră pe fundal transparent rămâne lizibilă. Avatarurile contactelor nu se schimbă.
  - Dialogul (`dossier/CustomerLogoDialog.tsx`, `client-logo-dialog.css`): „Acum” (sigla sau monograma) lângă „Previzualizare” (mărime mare și mică); „Alege fișier” (câmp nativ, accesibil din tastatură); verificare înainte de trimitere (format, mărime, decodare în browser, dimensiuni); „Confirmă sigla”, „Anulează”, „Folosește monograma”, „Închide”; salvare în curs, succes, refuz explicat, eroare cu „Reîncearcă”, conflict cu sigla actuală și fișierul ales păstrat.
  - Nimic nu se trimite înainte de confirmare. Selecția nesalvată este protejată (închidere, Escape, navigare), iar URL-urile temporare se eliberează. După salvare se recitesc fișa, registrul și dosarul, fără refresh manual. La închidere focusul revine pe „Alte acțiuni”. Interfața nu folosește termeni tehnici.
- **Probe (2026-10-27).** Teste: domeniu 4, API 9 (ciclu, livrare, reluare, concurență între conexiuni, eșec la scriere și la tranzacție, formate, izolare client/organizație, 401/403/404), plus migrația 049; frontend 13 (`ClientMark`, adaptor, registru și cartelă, dialog, model). Browser pe runtime sintetic izolat (rădăcină `%TEMP%\workos-n023-logo-synthetic`, API 8853, UI 5253; porturile 5173, 8895 și 8899 neatinse): fără siglă, încărcare, salvare, afișare, refresh, înlocuire, conflict real și reconfirmare, monogramă, refuz SVG / fișier stricat, eșec de rețea simulat în tab și reîncercare; 1440, 1280, 768, 390, 360 px, Lumină și Noapte, siglă neagră pe fundal transparent în Noapte; sigle sintetice generate în browser.
- **Limite.**
  - Importul automat de pe website: NEIMPLEMENTAT (etapă viitoare, GO separat).
  - JPEG și WebP sunt verificate structural pe server, nu decodate complet. Browserul decodează imaginea înainte de confirmare, iar `ClientMark` revine la monogramă dacă o imagine nu se poate afișa.
  - Placa este deschisă în ambele teme: o siglă albă pe fundal transparent nu are contrast pe ea.
  - Istoricul reviziilor nu are încă o vedere în interfață; reviziile anterioare rămân în bază și se pot citi prin `?revision=N`.
  - Clientul inactiv: acoperit de teste (registru), fără probă separată în browser.
  - Migrația 049 a rulat numai pe baze sintetice izolate.
