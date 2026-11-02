# N-019 — Diagnostic: controlul calității exclusiv și sudura

Stare: diagnostic pentru review. Nu modifică regulile de eligibilitate, fundația operațională sau produsele. Referințele de cod sunt la `main` 9f0b178. Comportamentul serverului este observat pe rădăcini sintetice izolate (log: `probe5.log` în pachetul de predare) și pe mediul demonstrativ 8891.

## 1. Controlul calității

### Cauza

| Sursă | Fapt |
| --- | --- |
| `apps/api/src/people/operationalSkillFoundation.ts:93` | `{ capabilityId: "QUALITY_CONTROL", skillCode: "SK_ASSEMBLY" }` — singura mapare QC. Aceeași calificare acordă `MANUAL_ASSEMBLY` (r. 91) și `PACKAGING` (r. 94). |
| `apps/api/src/cloud/bootstrapPolicy.ts:80,87` | `applyOperationalSkillFoundation` se aplică planurilor `ADOPT_EXISTING`, `NEW_ORGANIZATION` și `SYNTHETIC_TEST`; maparea vine identic tuturor. |
| `apps/api/src/people/store.ts` `materializeSkillSeeds` | Mapările se inserează cu `INSERT OR IGNORE` în `capability_skill_requirements`; nu există API care să le citească pentru editare sau să le modifice. |
| `packages/domain/src/people/eligibility.ts` `diagnosePerson` | Eligibil = oricare dintre calificările mapate capabilității este activă la persoană (SAU). Nu există condiție de excludere. |
| `packages/domain/src/execution/lifecycle.ts:589` `readyQualityMutation` | Rezultatul QC cere numai ca actorul să lucreze pe operație (`isWorkingOnTask`), nu să fie executantul planificat. |
| `lifecycle.ts` `claimAndStartExecutionTask` | Executantul planificat limitează doar cine pornește operația; alăturarea ulterioară rămâne deschisă oricărui eligibil. |

### Comportament observat

- Mediul 8891: `GET /api/people/eligibility?capabilityId=QUALITY_CONTROL` → eligibili Maria Ansamblu Demo, Vlad Ansamblu Demo, Paul Calitate Demo.
- Rădăcină izolată, operația Alpha 10 „Probă uniformitate”, Paul executant planificat și pornit: Maria se alătură → `200`; Maria `quality-pass` cât Paul e activ → `409 active_participants`; Paul iese → `200`; Maria `quality-pass` → `200`, rezultat `PASS`. Desemnarea pe operație nu este exclusivitate.

### Ce se poate configura acum (fără motor)

- Planificarea lui Paul ca executant al fiecărei operații QC (făcut în N-019) și disciplina scenariului. Nu este o garanție a serverului.
- Nimic altceva: Maria și Vlad au nevoie de `SK_ASSEMBLY` pentru asamblare și ambalare, iar maparea QC nu poate fi schimbată prin API.

### Remediere minimă propusă (cere GO de motor separat)

1. Calificare nouă în fundație: `SK_QUALITY_CONTROL` („Control calitate”), mapată la `QUALITY_CONTROL`.
2. Pentru planurile noi și sintetice: fără maparea `SK_ASSEMBLY → QUALITY_CONTROL`. Precedent existent: `removeDeprecatedPaintingAssemblyMapping` (`store.ts:533`) a eliminat deja `SK_ASSEMBLY → PAINTING`.
3. Pentru planurile existente (`ADOPT_EXISTING`, pilot): nicio eliminare automată. Decizie Owner separată: fie se atribuie întâi `SK_QUALITY_CONTROL` persoanelor care fac azi QC, apoi se elimină maparea veche, fie maparea veche rămâne până la reconciliere. Altfel o persoană care azi face QC ar pierde eligibilitatea fără avertisment.
4. Variantă mai largă, nerecomandată pentru primul pas: administrarea per organizație a mapărilor capabilitate → calificare (API + UI + audit).

Teste necesare: fundația mapează QC numai la `SK_QUALITY_CONTROL` pe un plan nou; un asamblor fără `SK_QUALITY_CONTROL` este `MISSING_SKILL` pentru QC și rămâne eligibil pentru asamblare/ambalare; alăturarea unui neeligibil la o operație QC → `422 ineligible_executor`; reconcilierea unui plan existent nu retrage QC fără atribuirea prealabilă; testul N-019 „exactly_one_quality_person” trece (azi documentează conflictul); regresii pentru PAINTING (precedentul) și pentru operațiile QC existente.

## 2. Sudura

### Cauza

| Sursă | Fapt |
| --- | --- |
| `packages/domain/src/processes/catalog.ts:38-39, 171-184` | Capabilitățile `WELD_STEEL`, `WELD_ALUMINIUM` există. |
| `catalog.ts:458-485` | Procesele `WELD_STEEL_JOIN`, `WELD_ALUMINIUM_JOIN` există cu `applicableTypeIds: []`, `resourceIds: []`, nota „Nu este cerută de Letters. Fără rețetă de cost.” |
| `packages/domain/src/processes/requirements.ts` | Nicio cerință de componentă nu emite procese de sudură. ACM: `CUT_SHEET_CNC`, `FORM_SHEET_CASSETTE`; cadrul de oțel (r. 79): numai `CUT_METAL_STOCK`; prinderea cadrului este `ATTACH_INTERNAL_FRAME` (asamblare manuală). |
| `apps/api/src/people/operationalSkillFoundation.ts:84-99` | Fundația nu mapează nicio calificare la `WELD_*`. |
| `apps/api/src/people/trustedWorkforce.ts:122-123` | Singura mapare `WELD_* → SK_LOCKSMITH` există în forța de muncă istorică, aplicată numai pe calea `SINGLE_PLANE` (`bootstrapPolicy.ts:94`); nu ajunge în planurile `SYNTHETIC_TEST`, `NEW_ORGANIZATION` sau `ADOPT_EXISTING`. |
| `packages/domain/src/people/eligibility.ts` | Capabilitate fără mapare → `CAPABILITY_UNMAPPED` pentru toată lumea. |

### Comportament observat

- Mediul 8891: `WELD_STEEL` și `WELD_ALUMINIUM` → toți cei 10: `CAPABILITY_UNMAPPED`, inclusiv Sorin și Dan, care au calificările de organizație „Sudură oțel” / „Sudură aluminiu” create prin `POST /api/people/skills`.
- Cele 4 lucrări eliberate (letters × 2, ACM, ansamblu ACM + litere) nu conțin nicio operație de sudură.

### Ce se poate configura acum (fără motor)

- Resursele: „Stație sudură”, „Aparat sudură oțel” (`WELD_STEEL`), „Aparat sudură aluminiu” (`WELD_ALUMINIUM`) — create și active în N-019.
- Calificări de organizație cu etichetă și atribuirea lor persoanelor — făcut, dar fără efect de eligibilitate.
- Nu se poate: maparea capabilitate → calificare și apariția unei operații de sudură într-o lucrare.

### Remediere minimă propusă (două GO-uri distincte)

1. Motor — eligibilitate: calificări de fundație `SK_WELD_STEEL` și `SK_WELD_ALUMINIUM`, mapate la `WELD_STEEL` / `WELD_ALUMINIUM` în `OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS`, aplicate idempotent planurilor noi și existente (doar adăugare; nimeni nu pierde eligibilitate). Decizie Owner: calificări separate oțel/aluminiu (recomandat, oglindește utilajele) sau o singură calificare „Lăcătuș/sudor” ca în forța de muncă istorică.
2. Definiții de produs — operații: o componentă sau un produs care cere efectiv sudura (de ex. cadru sudat din oțel pentru casetă/totem), cu `applicableTypeIds`, resurse și rețetă de cost. Atinge Product Truth și prețul; cere decizie Owner pe produs, nu doar configurare.

Teste necesare: eligibilitatea `WELD_*` pentru o persoană cu calificarea mapată (și `MISSING_SKILL` fără ea); aplicarea idempotentă a fundației pe un plan existent fără a retrage alte mapări; furnizor unic eligibil pentru `WELD_STEEL` / `WELD_ALUMINIUM` cu aparatele respective; pentru pasul 2: compoziția produsului emite procesul de sudură cu dependențele corecte, previzualizarea și prețul rămân deterministe, planul de execuție conține operația cu capabilitatea și furnizorul potrivite; scenariul N-019 adaugă o lucrare cu sudură în ciclul următor.

## Ce rămâne neîndeplinit în N-019

- QC exclusiv: NEÎNDEPLINIT (serverul: 3 eligibili).
- Sudură acoperită de server: NEÎNDEPLINIT (`CAPABILITY_UNMAPPED`; niciun produs nu generează sudură).
- Sedii multiple ale clientului: NESUPORTAT de model.
