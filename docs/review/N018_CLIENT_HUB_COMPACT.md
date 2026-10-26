# N-018 · Client page compact refinement — review note

Status: published in a draft PR for independent review (2026-10-23). Journal: [N-018](https://app.notion.com/p/4018ea98e40f81cebde3e6366a79ccd2).
Frontend only. No engine, API, schema, seed, data, credential or Figma change.

This client page is an intermediate implementation. The Owner has not accepted its visual result as final. The next
direction is the complete client dossier with a vertical history, after the functions and data it needs exist; that
extension is not part of this change. The four sections under "Mai multe · în pregătire" and the relation journal are
placeholders, not delivered functions.

Verified independently: the first client page candidate (its review produced the finishing pass below). Verified only in
the implementing session: the finishing pass and the final checks of the published commit.

Evidence (outside Git): `C:\Users\offic\workspace\workos-audit-evidence\2026-10-23-n018-client-hub-compact\`
(`README.md`, `index.html` side by side, before/after/Figma captures, check logs, `stage.patch`, `candidate.json`).
Finishing pass after the independent review: `C:\Users\offic\workspace\workos-audit-evidence\2026-10-23-n018-client-hub-compact-r2\` (the first package is kept).

## Reference frames (Figma `rM71g74Ph0mkAjAtWuLahy`, page 07)

| Frame | Use |
| --- | --- |
| `138:748` V2 · Client · Relație · 1440 | header and section bar reference |
| `183:4345` V2.2 · Relație · meniul „Mai multe” deschis | "Mai multe · în pregătire" |
| `183:3928` V2.2 · Cereri și oferte · Quartz | section reference (the flat list stays a proposal; the tab counts requests and offers apart) |
| `183:4546` V2.2 · Relație · 768 | tablet header |
| `244:7033` V2.4 · Client · Meadow Café · 390 | phone header, fixed "Cerere nouă" |
| `141:20647` V2 · Client · Relație · Noapte | Noapte |
| `291:13453` V4 · Cartela — date complete / parțiale / lipsă | missing data grouped in one line |

## Kept

Registry, card (docked, 768 overlay, 390 sheet), compact registry at 360/390, Noapte, Relație content, request
preview, Cerere nouă guard, job sheet return, Cereri și oferte as two tables, every server label and state.

## Changed, and why

| Area | Change | Why |
| --- | --- | --- |
| Header | Monogram + name + CUI + present contacts (tel/mailto) + one "Necompletat" line; open requests next to "Cerere nouă" (still gated by `canCreateRequest`) | Content was at 561 px of 900; now 304 (1440), 327 (1280×720), 380 (360) |
| Sections | Relație · Cereri n · Oferte n · Lucrări n (accessible name "Cereri 3, Oferte 3"); Documente, Fotografii, Portofoliu, Fișiere listed under "Mai multe · în pregătire" (not links) | Four empty tabs looked functional; counters were repeated |
| Phone | One sideways-scrolling section row; "Cerere nouă" fixed at the bottom | Tabs used four rows; content started at 691 px |
| Continuity | Section change replaces the entry; Back/Forward restore focus; `data-arrival-target` revealed after a push; origins accepted only as internal paths | Back replayed tabs; focus fell on `body` |
| Way back | "← Clienți" = the registry entry it came from (selection, search, filters, scroll, focus), else the registry on this client's row; request page "← Fișa clientului" to the same tab | The registry lost selection and scroll; the request page lost its client origin |
| Registry keyboard | Enter moves focus into the card, Escape returns to the row; Clienți hints say "Enter deschide cartela" | The hint promised something Enter did not do |
| Labels | Frontend label to the job sheet: "Fișa lucrării" (client page only) | Destination-label uniformization; server labels untouched. Not P1 |
| Relație width | No reserved journal column; threads use the width up to 64rem; the journal is one quiet note after the content | Deviation from 138:748, whose side column holds a populated journal: here it has no source, so a reserved 260–340 px column held only a sentence |
| Acum on phone | The action has its own full-width row (44 px, whole label) | "Deschide oferta" broke over two lines at 390 |

## Fișiere contract check

No contract lists files per client. Files exist per job (`GET /api/jobs/:jobId/files`, job record) and per request
(`GET /api/requests/:requestId/attachments`); `GET /api/customers/:id/workspace` has neither files nor counts.
A list would need one request per job and per request (cascade) or a new endpoint; both are outside this stage.
Fișiere stays "În pregătire" and says where files are today (the job sheet, Fișiere).

## Accessibility check

Chromium's computed tree (DevTools `Accessibility.getFullAXTree`) names the nav links, the four filters, every row
link, the client rows and "Denumire". The audit's suspicion came from a simplified tree; nothing changed there.

## Limits

- Focus after Back matches a link by `href`: when two links in a row share it (title and action), the first gets focus.
- The "Mai multe" list is informational; there is no per-section page beyond the existing "În pregătire" panel.
- "Deschide comanda" leads to the job sheet. It is a server label, unchanged here; whether its wording or its destination changes belongs to a separate label-to-destination inventory with the engine owner.
- P1 is only the computation of the request's next action (server). Neither this stage nor the label uniformization touches it.
