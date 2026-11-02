# N-019 — Mediu demonstrativ persistent: atelier cu 10 lucrători

Înregistrare Notion: [N-019](https://app.notion.com/p/4028ea98e40f81309b27e25b039e80c3), legată de N-018. Date exclusiv sintetice. Nu modifică regulile de business, schema sau contractele API. Mediul nu este acceptare de produs sau acceptare vizuală.

## Ce este și unde stă

| Element | Locație | În Git |
| --- | --- | --- |
| Date sintetice persistente | `%LOCALAPPDATA%\WorkOS\demo-atelier-n019` (suprascriere: `WORKOS_DEMO_ATELIER_ROOT`) | Nu |
| Credențiale generate local (parola contului, PIN-uri per persoană) | `.reference-identity.json` și `demo-atelier-secrets.json` în rădăcina de mai sus | Nu |
| Cheia locală de sigilare a credențialelor din pachetele de backup | `%LOCALAPPDATA%\WorkOS\demo-atelier-keys` (`WORKOS_DEMO_ATELIER_KEY_ROOT`) | Nu |
| Registrul pregătirii (pași aplicați, ID-uri server) | `demo-atelier-ledger.json` în rădăcină | Nu |
| Starea ciclului demonstrativ | `demo-atelier-cycle.json` în rădăcină | Nu |
| Backup-uri (date `bkp-*` + pachet demo pereche `bkp-*.demo-n019`) | `%LOCALAPPDATA%\WorkOS\demo-atelier-n019-backups` | Nu |
| Scenariul, fișierele demonstrative (generate din cod), mecanismul | `apps/api/src/cloud/demoAtelier*.ts`, `scripts/demo-atelier.mjs` | Da |
| Teste | `apps/api/tests/demo-atelier.test.ts` (rădăcini temporare izolate) | Da |

Scriptul refuză o rădăcină din `%TEMP%`, din repo sau dintr-un worktree. URL implicit: `http://127.0.0.1:8891` (frontend servit de API; `WORKOS_DEMO_ATELIER_PORT`). Portul de verificare a restaurării: 8892. Runtime-ul de referință (8787) și runtime-urile altor sesiuni nu sunt atinse.

## Comenzi

```text
pnpm demo:init -- --as-of 2026-09-28T06:00:00.000Z   # o singură dată, director gol; organizația datată la onboarding
pnpm demo:setup -- --as-of 2026-09-28T06:01:00.000Z  # registrul (persoane, calificări, utilaje, clienți) datat la onboarding; API oprit
pnpm demo:start           # pornește API-ul propriu (fără reset, fără reprovizionare)
pnpm demo:prepare         # pregătire repetabilă prin rutele HTTP canonice
pnpm demo:verify          # matricea eligibilității citită de la server + verificări
pnpm demo:cycle           # ciclul demonstrativ C1 în timp real (≈ 4 h 10 min), detașat
pnpm demo:status          # starea ciclului, sesiuni deschise, rulări de utilaj active
pnpm demo:stop-cycle      # închide sesiunile și rulările deschise ale persoanelor demo
pnpm demo:manifest        # scrie demo-atelier-manifest.json în rădăcină
pnpm demo:credentials-init # o singură dată pe o rădăcină existentă: PIN-uri locale per persoană (înlocuiește PIN-ul comun vechi)
pnpm demo:backup          # oprește API-ul propriu, backup consistent al datelor + pachetul de metadate demo pereche, repornește
pnpm demo:history         # aplică o singură dată istoricul sintetic H1 (API oprit, ceas simulat doar în proces); refuză dacă registrul e mai nou decât H1
pnpm demo:chronology-plan # read-only: rândurile ferestrei de configurare și verificarea coliziunilor
pnpm demo:chronology      # o singură dată: corecția cronologiei de configurare (allowlist, tranzacție, API oprit)
pnpm demo:report          # raportul intervalelor C1 din datele serverului (demo-atelier-c1-report.json)
node scripts/demo-atelier.mjs restore --target <țintă goală> --data-backup <bkp-*> [--bundle <bkp-*.demo-n019>] [--key-root <dir>]   # restaurare autonomă; nu cere și nu citește rădăcina configurată
pnpm demo:restore-verify  # restaurează ultimul backup într-o rădăcină nouă și o verifică prin comenzile documentate pe 8892 (vezi „Backup și restaurare”)
pnpm demo:stop            # oprește numai procesul identificat pozitiv (PID + marker în linia de comandă)
```

Un proces necunoscut pe port nu este oprit; scriptul se oprește cu `demo_port_occupied_by_unknown_process`.

## Reluare fără duplicate

`prepare` recunoaște entitățile după chei stabile (nume, titluri de cerere, secvența operației în plan) și după ID-urile din registru. Fiecare pas aplicat se înscrie o singură dată; un pas înscris nu se mai reaplică. Consecințe verificate de teste:

- a doua rulare aplică 0 pași și nu creează duplicate;
- un câmp de client modificat sau golit după pregătire rămâne cum l-a lăsat Ownerul;
- o calificare retrasă după pregătire nu este readăugată;
- o persoană sau un client șters/redenumit după pregătire nu este recreat;
- PIN-urile operatorilor sunt generate local, câte unul pe persoană (8 cifre), la `init` sau o singură dată prin `credentials-init` pe o rădăcină existentă; stau numai în `demo-atelier-secrets.json` din rădăcină, nu în Git. Pregătirea le setează o singură dată și nu le regenerează; ciclul și istoricul doar se identifică.

`prepare` nu pornește și nu încheie nicio operație. Participarea măsurată vine numai din ciclul demonstrativ.

## Inventarul mediilor anterioare (verificat pe copii, 2026-10-23)

Fiecare rădăcină a fost copiată prin API-ul de backup SQLite într-un director separat și citită doar acolo. Nicio rădăcină veche nu a fost ștearsă, resetată sau migrată.

| Mediu | Locație | Versiune schemă | Disponibil | Conținut | Compatibilitate |
| --- | --- | --- | --- | --- | --- |
| Referință Owner | `%LOCALAPPDATA%\WorkOS\reference-runtime` | 042 | Oprit, date prezente | OWNER_REVIEW_V1: 2 persoane, 10 clienți, 12 cereri | Neatins; 043–046 lipsă |
| N-014 integrare | `%TEMP%\workos-n014-integrare-20261022` | 046 | Oprit, date prezente | OWNER_REVIEW_V1 + „Ana CNC Sintetic N-014” (adăugată manual prin API); 3 sesiuni: 2 deschise din 22.10, una de 0 s | Persoana Ana recuperată ca nume și rol |
| Review main | `%TEMP%\workos-review-main-20261023` | 046 | Oprit, date prezente | Identic N-014 | Idem |
| N-018 (activ) | scratchpad-ul sesiunii job-sheet-sections, `n018-root-2`, API 8797 | 046 | Activ (8797) | OWNER_REVIEW_V1, 2 persoane, 1 sesiune deschisă | Neatins |
| N-018 anterior | același scratchpad, `n018-root` | 046 | Oprit | OWNER_REVIEW_V1 | — |
| V3 coerență | `%LOCALAPPDATA%\WorkOS\v3-coherence-synthetic-8797` | 040 | Oprit | 2 clienți, fără persoane | — |

Concluzii: nu a existat niciun mecanism anterior pentru intervale simulate; toate sesiunile istorice au durate reale de milisecunde sau au rămas deschise (acumulând nopți). Scenariile utile (cei 10 clienți OWNER_REVIEW, Ion, Maria, Ana, ansamblul Nord) sunt reconstruite reproductibil prin noul mecanism, nu copiate din baze temporare.

## Cei 10 lucrători și eligibilitatea (citită de la server)

| # | Persoană | Rol demonstrativ | Calificări cerute | Capabilități eligibile (server) |
| --- | --- | --- | --- | --- |
| 1 | Ion CNC Demo | CNC router, exclusiv | SK_CNC_OPERATOR | CNC_ROUTING |
| 2 | Ana CNC Sintetic N-014 | CNC router | SK_CNC_OPERATOR | CNC_ROUTING |
| 3 | Radu Cant Demo | Formare cant / profil aluminiu | SK_LETTER_CANT_OPERATOR | PROFILE_FORMING |
| 4 | Sorin Sudură Oțel Demo | Sudură oțel, debitare metale | Sudură oțel (organizație), SK_METAL_CUTTING_OPERATOR | METAL_CUTTING; sudura: CAPABILITY_UNMAPPED |
| 5 | Dan Sudură Aluminiu Demo | Sudură aluminiu, modelare cant | Sudură aluminiu (organizație), SK_LETTER_MODELING | PROFILE_FORMING; sudura: CAPABILITY_UNMAPPED |
| 6 | Elena Electric Demo | Electrică și iluminare | SK_ELECTRICIAN | ELECTRICAL_ASSEMBLY |
| 7 | Maria Ansamblu Demo | Asamblare | SK_ASSEMBLY | MANUAL_ASSEMBLY, PACKAGING, QUALITY_CONTROL |
| 8 | Vlad Ansamblu Demo | Asamblare și operații manuale | SK_ASSEMBLY | MANUAL_ASSEMBLY, PACKAGING, QUALITY_CONTROL |
| 9 | Irina Finisaj Demo | Vopsire și aplicare folie | SK_PAINTING, SK_VINYL_APPLICATOR | PAINTING, VINYL_APPLICATION |
| 10 | Paul Calitate Demo | Control calitate (desemnat) | SK_ASSEMBLY | MANUAL_ASSEMBLY, PACKAGING, QUALITY_CONTROL |

Refuzul operatorului exclusiv CNC este verificat pe server: `POST /api/execution-tasks/:id/executor` cu Ion pe formarea profilului → `422 ineligible_executor`. A doua sesiune simultană a aceleiași persoane → `409 active_work_elsewhere`; o persoană fără calificare care se alătură unei operații CNC → `422 ineligible_executor`.

Aceste roluri sunt configurații demonstrative, nu reguli pentru toate organizațiile.

## Conflicte precise (nedeclarate îndeplinite)

1. **Controlul calității nu poate fi exclusiv.** Fundația operațională (`apps/api/src/people/operationalSkillFoundation.ts`) mapează `QUALITY_CONTROL` numai la `SK_ASSEMBLY`, aceeași calificare care acordă `MANUAL_ASSEMBLY` și `PACKAGING`. Orice asamblor devine eligibil QC; serverul raportează 3 eligibili (Maria, Vlad, Paul). Nu există API pentru maparea capabilitate → calificare. În scenariu, operațiile QC sunt executate numai de Paul, dar aceasta este disciplina scenariului, nu o regulă a serverului: pe o rădăcină izolată, cu Paul executant planificat, Maria s-a alăturat (200) și, după ieșirea lui Paul, a înregistrat rezultatul QC (200, PASS). Diagnostic complet: `docs/N019_DIAGNOSTIC_QC_SUDURA.md`. Soluție necesară (GO separat, modificare de motor): o calificare dedicată, de ex. `SK_QUALITY_CONTROL`, mapată la `QUALITY_CONTROL`, eliminarea mapării `SK_ASSEMBLY → QUALITY_CONTROL` pentru organizațiile noi și reconcilierea organizațiilor existente, eventual o administrare per organizație a mapărilor.
2. **Sudura nu este acoperită de server.** În planurile `SYNTHETIC_TEST`/`NEW_ORGANIZATION`, `WELD_STEEL` și `WELD_ALUMINIUM` nu au nicio calificare mapată (maparea la `SK_LOCKSMITH` există numai în forța de muncă istorică HUB MEDIA, nefolosită aici). Diagnosticul serverului pentru toți: `CAPABILITY_UNMAPPED`. Calificările „Sudură oțel/aluminiu” au fost create prin `POST /api/people/skills` ca etichete reale ale persoanelor, dar nu acordă eligibilitate. În plus, niciun produs actual nu generează operații de sudură, deci aparatele de sudură există ca resurse, fără lucrări. Soluție necesară: maparea WELD_* într-o fundație operațională (GO motor) și un produs/proces care folosește sudura.
3. **Sediile clientului nu sunt suportate.** Modelul are o singură adresă și localitate; nu s-au inventat sedii.
4. **Timpul istoric în runtime-ul normal.** Serverul stampilează fiecare sesiune la sosirea comenzii (`new Date()`); runtime-ul normal nu are ceas controlabil. Istoricul de mai multe zile este reprodus de scriptul H1, care rulează motorul neschimbat în propriul proces cu un ceas simulat izolat (vezi „Istoric sintetic H1”). Nu există un ceas controlabil în API-ul care rulează pe 8891.
5. **Corectarea sesiunilor uitate nu există** (contract viitor, conform canonului fluxului de producție). O sesiune închisă târziu rămâne cu lungimea ei reală.

## Atelier și utilaje

Zone: Zonă CNC, Zonă formare cant, Stație debitare metale, Stație sudură, Masă asamblare 1 și 2, Montaj LED / electric, Zonă aplicare folie, Cabină vopsire. Utilaje: CNC 4020 (CNC_ROUTING), **CNC Cant Litere (PROFILE_FORMING, proces FORM_ALUMINIUM_PROFILE)**, Debitator metale, Aparat sudură oțel, Aparat sudură aluminiu. Denumirile urmează catalogul canonic din `packages/domain/src/workcenters/catalog.ts`. Pregătirea creează doar resursele lipsă și nu schimbă ciclul de viață al unei resurse existente.

Toate operațiile care cer furnizor au furnizor alocat de pregătire (sau unic eligibil); fiecare operație are executant eligibil planificat, acceptat de server. Scenariul principal nu conține „Lipsă utilaj dedicat”. Cazuri negative separate: clienții incompleți „Meadow Café Demo SRL” (fără CUI/adresă/email) și „Lumen Studio Demo SRL” (doar nume), cererea „Logo luminos studio — de clarificat”.

## Fluxuri comerciale și de producție

| Client | Flux | Stare după pregătire |
| --- | --- | --- |
| Nord Market | 2 cereri; ansamblu ACM + litere; brief PDF (3 pagini) și fotografie atașate cererii | Lucrare eliberată, 17 operații |
| Alpha Clima | 2 cereri; litere acceptate; casetă ACM ofertată | Lucrare eliberată, 12 operații; a doua ofertă deschisă |
| Meadow Café (incomplet) | Litere cu față colantată și volum vopsit | Lucrare eliberată, 14 operații (folie + vopsire) |
| Orbit Auto | Casetă ACM | Lucrare eliberată, 5 operații |
| Urban Pharma | Litere acceptate | Comandă creată, neeliberată |
| Helix, Pine, Quartz | Oferte trimise, neacceptate; Pine și Quartz au și cereri fără ofertă | — |
| Delta Retail | Ofertă v1 + a doua ofertă pe aceeași cerere (revizie) | Neacceptate |
| Sign Pro, Lumen | Cereri fără ofertă | — |

Fișiere de lucrare (generate din cod): Alpha — desen PDF v1 și v2 (revizie cu `supersedesArtifactId`), contur DXF, instrucțiuni TXT, machetă PNG, cu asocieri la operații distincte; Nord — desen ACM PDF; Meadow — specificație culori PDF; Orbit — desen casetă PDF. Utilizarea declarată (artifact-use) este înregistrată de operatori în ciclu.

## Ciclul demonstrativ C1

Definit în `apps/api/src/cloud/demoAtelierCycle.ts`: 76 de comenzi operator la minute fixe de la pornire, pe 4 h 10 min. Toate comenzile trec prin rutele operatorului (`start`, `leave`, `complete`, `quality-pass`, `machine-runs`, `artifact-use`); nu se modifică ceasul, baza de date sau câmpul de durată declarată. Testul automat rulează aceeași ordine comprimat (fără așteptare) și confirmă 0 refuzuri; duratele din test nu sunt reprezentative.

Conținut: Ion și Ana simultan pe CNC; Ion iese în pauză și revine, Ana continuă; Radu și Dan simultan pe CNC Cant Litere (Alpha și Meadow); Maria și Vlad pe lipire și pe caseta Nord; lanțul electric al Elenei; folia Irinei; debitările lui Sorin; Paul face cele două controale de calitate. La final: Alpha finalizată; Nord, Meadow și Orbit în etape diferite (inclusiv operații „în lucru fără sesiuni active” după ieșirea de la final de tură); Urban neeliberată. Rulările de utilaj sunt exclusive (o rulare activă per utilaj în orar).

Ciclul de viață:

- pornire: `pnpm demo:cycle` (proces detașat; starea în `demo-atelier-cycle.json`, cu PID și pas cu pas rezultatul serverului);
- încheiere: ultimii pași închid fiecare sesiune deschisă de ciclu; starea devine COMPLETED; un ciclu încheiat nu se mai rulează (un ciclu nou cere o definiție versionată nouă);
- întrerupere: la relansare, pașii deja executați se sar; pașii restanți se execută imediat (intervalele pot deveni mai lungi, niciodată mai scurte);
- protecție împotriva nopților de „muncă”: dacă relansarea are loc la peste 60 de minute după sfârșitul planificat, ciclul nu se reia, ci închide sesiunile și rulările (`stop-cycle`). `pnpm demo:status` arată sesiunile deschise. Dacă runnerul moare și nimeni nu rulează `stop-cycle`, sesiunile rămân deschise și cresc; nu există corecție retroactivă.
- calculatorul nu trebuie să intre în repaus în timpul ciclului (repausul lungește intervalele).

Separarea timpilor (calculată de server, `GET /api/jobs/:id/record`): calendaristic (de la prima pornire la ultima finalizare), timp activ (reuniunea intervalelor, suprapunerile o dată), suma contribuțiilor (fiecare persoană separat), timpul utilajului (rulări închise).

## Pregătirea review-ului ecran cu ecran: hub-ul clientului

| Tab (rută) | Client recomandat | Date disponibile | Acțiuni testabile | Nesuportat |
| --- | --- | --- | --- | --- |
| Prezentare (`/clienti/:id`; „Relație” în N-018) | Nord Market, Alpha | Identitate completă, cereri, oferte, lucrări, acțiuni cerute de server | Deschidere cerere/ofertă/lucrare, editare profil | Jurnalul relației (fără contract de evenimente) |
| Lucrări | Alpha (finalizată), Nord (în execuție), Urban (comandă) | Lucrări în etape diferite | Deschiderea fișei, operații, fișiere, oameni, ore | — |
| Cereri și oferte | Delta (revizie), Alpha (acceptată + deschisă), Quartz (2 cereri) | Cereri multiple, oferte acceptate/neacceptate | Acceptare (cu atenție: mutație), previzualizare ofertă | Starea „Continuă aici” per cerere (P1, N-018) |
| Documente | — | — | — | Placeholder declarat; facturi/contracte nu există |
| Fotografii | — | Fotografia fațadei Nord există doar ca atașament de cerere | — | Placeholder declarat |
| Portofoliu | — | — | — | Placeholder declarat |
| Fișiere | Nord, Alpha | Atașamente de cerere și fișiere de lucrare există pe server | — | Placeholder declarat; tabul nu agregă fișierele existente |
| Clienți incompleți | Meadow, Lumen | Câmpuri lipsă | Completarea profilului | — |

Pentru Cereri, Oferte și Lucrări: Delta pentru revizii, Helix/Pine pentru oferte în așteptare, Urban pentru trimiterea în producție, Alpha pentru arhivă completă (ore, fișiere, utilizări, QC), Nord/Meadow pentru producție în curs și Atelier.

## Backup și restaurare

**Două părți, separate intenționat.**

- Datele aplicației: `createCloudBackup` neschimbat (snapshot SQLite consistent cu API-ul oprit și lease exclusiv, manifest cu SHA-256, verificarea migrațiilor), în `bkp-*`.
- Metadatele demo: pachetul `bkp-*.demo-n019` alături, creat de `apps/api/src/cloud/demoAtelierRecovery.ts`. Conține marcajele rădăcinii, `demo-atelier-ledger.json` (pașii aplicați și ID-urile), starea ciclului fără PID/heartbeat și `scenario.json` (tipul scenariului, organizația, H1 și corecția de cronologie aplicate, starea C1, versiunea codului). Are și credențialele (`.reference-identity.json` + `demo-atelier-secrets.json`) sigilate AES-256-GCM.
- `demo-bundle-manifest.json` are versiune, SHA-256 per fișier și SHA-256-ul manifestului backup-ului de date cu care formează pereche. Un pachet modificat sau împerecheat cu alt backup este refuzat. Un ciclu în desfășurare nu poate fi împachetat.
- Mecanismul general de backup nu depinde de N-019.

**Cheia locală:** `%LOCALAPPDATA%\WorkOS\demo-atelier-keys\demo-atelier-n019.key` (`WORKOS_DEMO_ATELIER_KEY_ROOT`), 32 de octeți aleatori, creată la primul pachet, în afara rădăcinii, a backup-urilor și a Git. Fără ea, credențialele din pachet nu pot fi recuperate. Datele se pot restaura, dar parola și PIN-urile trebuie apoi resetate prin instrumentele de administrare.

**Restaurare autonomă:** `node scripts/demo-atelier.mjs restore --target <țintă goală> --data-backup <bkp-*> [--bundle <dir>] [--key-root <dir>]`. Implicit, pachetul este `<bkp-*>.demo-n019`, iar cheia este în `WORKOS_DEMO_ATELIER_KEY_ROOT` sau în directorul per utilizator.

Comanda primește doar intrări explicite (backup de date, pachet, cheie, țintă goală). Nu cere, nu verifică și nu citește rădăcina configurată (`WORKOS_DEMO_ATELIER_ROOT` sau implicită). Funcționează deci și când originalul lipsește.

După restaurare: `WORKOS_DEMO_ATELIER_ROOT=<țintă>` (și `WORKOS_DEMO_ATELIER_PORT` dacă e nevoie), apoi `node scripts/demo-atelier.mjs start`.

Comenzile care operează pe un mediu existent (`start`, `status`, `prepare`, `history`, `backup` etc.) păstrează protecțiile: rădăcina trebuie inițializată și situată în afara `%TEMP%`, a worktree-urilor și a repo-ului. `WORKOS_DEMO_ATELIER_ALLOW_TEMP=1` relaxează doar verificarea `%TEMP%`, explicit, pentru rădăcini de test de unică folosință.

Regresia `apps/api/tests/demo-atelier-script.test.ts` rulează chiar comanda documentată cu originalul șters, apoi `start` și autentificarea din ținta restaurată. Verifică pachetul, restaurează datele, apoi scrie marcajele, registrul, starea ciclului și credențialele desigilate numai în țintă. Nu restaurează PID-uri, lease-uri sau starea runner-ului și nu pornește nimic. Pornirea, verificările, H1 și ciclurile rămân comenzi separate, iar H1 și corecția de cronologie sunt refuzate de registrul restaurat.

**Probă (`pnpm demo:restore-verify`):** restaurează într-o rădăcină nouă și rulează comenzile documentate cu `WORKOS_DEMO_ATELIER_ROOT` și `WORKOS_DEMO_ATELIER_PORT=8892` îndreptate spre copia restaurată:
- `start`, `verify`, `manifest`, `prepare` (așteptat: 0 pași aplicați);
- `history` și `chronology` (așteptat: refuz);
- autentificarea cu credențialele recuperate din pachet.

Rădăcina originală este citită numai ca termen de comparație, prin propriul API.

**Ce înseamnă „IDENTICAL”:**

- `RESTORED_DB_FILES`: fișierele SQLite și documentele restaurate sunt identice octet cu octet cu artefactele backup-ului (SHA-256 verificat de restaurarea generală).
- `API_SNAPSHOT_COMPARE_LIVE_VS_RESTORED = IDENTICAL` acoperă doar domeniul citit prin API:
  - persoane (stare, disponibilitate, rol, calificări, PIN configurat), calificări, zone, utilaje, profilurile clienților;
  - cereri cu SHA-256 al atașamentelor descărcate; oferte cu legăturile spre cerere/comandă; lucrări cu legăturile cerere/client/comandă/plan;
  - fiecare operație (stare, furnizor, executant, efort planificat, pornire, finalizare, sesiuni personale, rulări de utilaj, încercări QC);
  - fișierele de lucrare (metadate, revizii, asocieri, utilizări, SHA-256 al octeților descărcați).
- Nu sunt comparate: datele de creare ale registrului, fișierele de registru/runtime și tabelele pe care API-ul nu le expune.
- Nu este o egalitate integrală a bazelor de date între mediul viu și cel restaurat.

**Dovezi la predare:**

| Backup | Ce dovedește |
| --- | --- |
| `bkp-2026-10-23T15-06-56-227Z-11913cdb` + `.demo-n019` | Restaurare autonomă în `demo-atelier-n019-restore-check-2026-10-23T15-07-13-483Z`: comenzile documentate OK, `prepare` aplicat 0, H1 și cronologia refuzate, fișiere de baze identice cu backup-ul, SHA-256 ale fișierelor descărcate corecte, comparație API IDENTICAL (domeniul de mai sus) |
| Backup-uri anterioare, fără pachet demo | Restaurează datele, dar nu și contextul demo; păstrate ca istoric |

## Preview frontend N-018 pe datele demonstrative

N-019 pornește din `main`; runtime-ul 8891 servește frontendul din `main` (9f0b178), nu N-018. Pentru N-018 există un preview separat, cu acordul sesiunii N-018:

- copie read-only: directorul `workos-po-n018-preview-n019` (alături de worktree-uri) = `git archive 9f0b178` + cele 76 de fișiere modificate/noi ale candidatului, fiecare verificat cu SHA-256 față de `git-manifest.txt` din `N018-re-review-2026-10-23.zip` (ZIP SHA-256 `A1601A89…64B0F9`); worktree-ul N-018 nu a fost scris;
- build propriu în copie; servit cu `vite preview` pe http://127.0.0.1:4191, `/api` → http://127.0.0.1:8891 (`WORKOS_API_PROXY_TARGET`);
- un singur API scrie în rădăcina demonstrativă; preview-ul nu are bază de date proprie;
- autentificarea prin preview și citirea acelorași date sunt verificate (aceleași persoane, clienți, lucrări și progres ca direct pe 8891), fără reset sau reseed;
- pornire: `$env:WORKOS_API_PROXY_TARGET="http://127.0.0.1:8891"; node node_modules/vite/bin/vite.js preview --port 4191 --strictPort` din directorul copiei; oprire: procesul din `preview.pid.json`.

Preview-ul nu este acceptare N-018; nu s-a făcut merge.

## Rezultatul C1 (oprit la decizia Ownerului)

C1 a rulat în timp real de la 13:46:44Z. La 14:10Z Ownerul a schimbat abordarea, iar ciclul a fost oprit controlat la pasul 8/76 (ultimul acceptat: Ana se alătură la Alpha 01). Toate cele 8 comenzi au fost acceptate, fără întârzieri peste 2 minute. Cele 4 sesiuni și 3 rulări de utilaj deschise au fost închise prin API la 14:11:00Z (`stop-cycle`); sesiunile închise atunci au lungimea lor reală (de ex. Ion 24 min, Ana 16 min pe Alpha 01). Lucrările curente Alpha și Orbit rămân „În lucru" fără sesiuni active; Nord, Meadow și Urban sunt neîncepute. Nu s-au corectat ore retroactiv.

## Istoric sintetic H1 — ceas simulat (GO Owner 2026-10-23)

**Ce este construit sintetic:** 6 cereri noi pentru clienți existenți (Alpha, Quartz, Helix, Pine, Sign Pro, Orbit), 6 oferte, 5 acceptări și comenzi, 5 eliberări cu plan, 5 fișiere de lucrare (o revizie), 175 de evenimente, 62 de sesiuni personale și 14 rulări de utilaj, între 1 și 22 octombrie 2026, în zile lucrătoare, 08:00–16:30 ora României. Toate textele poartă „Istoric sintetic N-019 H1".

**Cum:** `apps/api/src/cloud/demoAtelierHistory.ts` (scenariul H1, versionat) și `pnpm demo:history`. Scriptul oprește API-ul propriu, ține lease-ul de runtime `api` (nu poate rula în paralel cu un API), pornește motorul neschimbat în același proces și trimite fiecare comandă prin rutele HTTP, cu un ceas simulat care înlocuiește `Date` numai în procesul scriptului. Ceasul calculatorului, regulile motorului și runtime-ul normal nu sunt atinse; ceasul este restaurat la final (verificat în test). Hash-urile, ID-urile, dependențele, eligibilitatea, sesiunile unice pe persoană și exclusivitatea rulărilor sunt calculate și impuse de motor; orice refuz oprește rularea. Nu s-a scris SQL și nu s-au recalculat hash-uri sau ID-uri.

**Protecții:** validare statică înainte de scriere (fără suprapuneri personale, fără sesiuni sub un minut, zile lucrătoare, toate evenimentele înaintea primei cereri preexistente și înaintea timpului real); fiecare eveniment acceptat se înscrie în registru; o reluare sare evenimentele înscrise; după aplicare (`history:H1`) comanda refuză reaplicarea, deci nu suprascrie activitatea de review ulterioară. Rulare de probă completă pe o copie restaurată înainte de rădăcina principală (175/175 acceptate).

**Rezultat verificat prin API-ul repornit cu timpul real:**

| Lucrare (sintetic H1) | Stare | Calendaristic | Timp activ | Suma contribuțiilor | Utilaj |
| --- | --- | --- | --- | --- | --- |
| Alpha — showroom (6–7 oct) | Finalizată, 12/12 | 31 h | 13 h 50 min | 25 h 40 min | 9 h 42 min |
| Quartz — intrare (9 oct) | Finalizată, 5/5 | 8 h 10 min | 7 h 5 min | 9 h 15 min | 2 h 48 min |
| Helix — logo (13–15 oct) | Finalizată, 14/14 | 50 h 50 min | 15 h 10 min | 25 h 54 min | 7 h 22 min |
| Pine — restaurant (19–22 oct) | În lucru, 8/12 | crește până la finalizare | 10 h 30 min | 19 h 50 min | 9 h 57 min |
| Sign Pro — recepție (eliberată 22 oct) | Plan, neîncepută | — | — | — | — |
| Orbit — panou direcțional | Ofertă neacceptată | — | — | — | — |

Valorile serverului coincid cu recalcularea independentă din `pnpm demo:report`. 62 de sesiuni, 0 deschise, 0 în viitor. Demonstrate în date: doi oameni simultan (Ion+Ana CNC, Radu+Dan cant, Maria+Vlad lipire/casetă, Dan+Radu, Ion+Ana pe Helix), ieșire cu continuare (Ion iese, Ana continuă), pauze de prânz și reintrare, operații peste noapte (lipire), operații succesive pe dependențe, rulări de utilaj în interiorul sesiunilor, QC numai de Paul (disciplina scenariului; serverul permite și asamblorilor).

**Ce este demonstrat prin API în timp real (nu sintetic):** eligibilitatea și refuzurile (`422 ineligible_executor`, `409 active_work_elsewhere`), pregătirea N-019, pașii C1, închiderea prin API, backup și restaurare, autentificarea prin preview-ul N-018.

## Corectarea cronologiei de configurare (GO Owner 2026-10-23)

**Problema:** organizația, utilizatorii, persoanele, calificările, utilajele și clienții fuseseră creați pe 23 oct, după istoricul H1 (1–22 oct). În backup-ul dinaintea corecției, 6 clienți aveau o cerere mai veche decât clientul, iar 10 persoane lucrau înainte de a exista.

**Analiza (read-only, pe copia backup-ului `bkp-2026-10-23T14-36-51-398Z-3394846b`):** au fost listate toate câmpurile cu timestampuri din fereastra de configurare (`history:H1:setup-window`, 13:41:53–13:46:01Z, 23 oct) și căutate aceleași valori în orice alt câmp text din ambele baze (payload-uri, ID-uri, JSON, evenimente). Rezultat: valorile versiunilor de formulă/setări tehnice (13:41:53.755/.756) apar în documentele înghețate (oferte, comenzi, snapshot-uri de producție, produse confirmate, comenzi de ansamblu), deci nu se mută. Hash-ul configurației furnizorilor acoperă doar id/etichetă/descriere/stare/capabilități; hash-ul PIN-ului e `scrypt(pin, sare)`; niciun ID nu conține timestampuri; niciun eveniment imuabil nu cade în fereastră.

**Aplicat (`apps/api/src/cloud/demoAtelierChronology.ts`, `pnpm demo:chronology`):** o singură deplasare uniformă (−25,32 zile) ancorată la crearea organizației → 28 sep 2026 06:00:00Z (09:00 ora României), numai pentru 23 de câmpuri dintr-o listă explicită: organizație, utilizatori, membership-uri, plan, identitatea planului, vânzător, calificări de organizație, zone, utilaje, configurația furnizorilor, persoane, atribuiri de calificări, credențiale operator, clienți. 132 de rânduri, într-o singură tranzacție peste ambele baze (`ATTACH`), cu API-ul oprit și lease-ul de runtime ținut; coliziuni verificate 0 înainte de scriere; înregistrat în registru (`chronology:SETUP-ONBOARDING-1`), reaplicarea refuzată. Ordinea originală se păstrează: organizație → utilizatori → plan → vânzător → calificări → zone → utilaje → persoane → atribuiri → credențiale → clienți. Doar valorile din fereastră; modificările ulterioare (C1, H1, lucrările de azi) rămân pe datele lor.

**Neatins intenționat:** versiunile de formule și setări tehnice și dovezile de cost (copiate în documentele înghețate), migrațiile, marcajele de bootstrap, metadatele de afișare, sesiunile de autentificare, tot istoricul H1 și C1, hash-urile, ID-urile, payload-urile.

**Verificat prin API după repornire:** `pnpm demo:verify` — clienți înaintea cererilor, persoane înaintea primei sesiuni, utilaje înaintea primei rulări, atribuiri înaintea primei sesiuni, organizația prima, 0 sesiuni în viitor: toate PASS. Comparația prin API, live vs backup-ul dinaintea corecției: IDENTICAL în domeniul API descris la „Backup și restaurare” (legături, operații, sesiuni, rulări, QC, fișiere și SHA-256). Nu e o egalitate integrală a bazelor: câmpurile de creare mutate nu fac parte din domeniu. Totalurile H1 neschimbate. Backup-ul `bkp-2026-10-23T14-43-42-885Z-681231cd` s-a restaurat cu comparația API IDENTICAL și cronologia corectă în rădăcina restaurată.

**Reziduu documentat:** ofertele H1 (1–22 oct) citează în copia înghețată versiuni de formulă/setări cu `effectiveFrom` 23 oct 13:41. Nu poate fi schimbat fără a altera documente înghețate. Motorul nu folosește aceste date la selecție.

**Prevenire:** un mediu nou se pregătește în ordinea `init --as-of` → `setup --as-of` → `start` → `prepare` → `history` (→ ciclu live opțional). Registrul este atunci creat de motor deja datat la onboarding, deci nu mai e nevoie de corecție. `history` refuză să ruleze dacă vreo entitate de registru e mai nouă decât primul eveniment H1. Ambele comportamente sunt acoperite de teste.

## Ce nu se afirmă

Nu este acceptare de produs, acceptare vizuală sau pregătire pentru pilot. Calificările de sudură nu dau eligibilitate. QC exclusiv nu este impus de server. Duratele testelor automate nu sunt reprezentative. Mediul conține numai date sintetice. Istoricul H1 este construit sintetic cu ceas simulat; nu este o măsurătoare reală.

Testele „records the precise configuration conflicts” și verificările `FAIL … CONFLICT` din `pnpm demo:verify` confirmă că QC exclusiv și sudura **nu** sunt îndeplinite. Nu sunt dovezi de îndeplinire. Reziduul formulelor rămâne: ofertele H1 citează, în copia înghețată, versiuni de formulă și setări cu `effectiveFrom` 23 oct. Documentele înghețate nu se rescriu.
