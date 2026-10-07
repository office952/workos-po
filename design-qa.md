# Cereri — pilot refinement, 2026-10-07

The Owner-approved physical intake composition is preserved. This refinement stabilizes the header when filters shorten the page, standardizes row actions, and makes the receipt a useful printed preview of the selected request.

## Changes and purpose

- Reserve the classic scrollbar gutter so removing vertical overflow does not shift the menu, route or account area.
- Keep the register summary strip and table heading in place. A filtered list with no results shows its message inside the same table, without a separate boxed panel. Reset restores the list and focuses search.
- Give every row action the same dimensions: 160 × 44 CSS pixels on desktop/tablet and 148 × 44 on phone. Labels and arrows keep consistent alignment.
- Use existing IBM Plex Mono with warm dark ink for the receipt. Print reference/date, request title, client, canonical state and commercial progress onto the existing paper. The selected receipt is an actual request link.
- Reduce secondary printed fields according to the hardware container width so the paper remains readable. Long titles clamp to two lines. Phone layouts continue to omit the hardware and texture.
- Make the account trigger 44px high, retain the readable “Cont” label on phone, and constrain organization text at narrower desktop widths. The menu stays within the viewport; Escape returns focus to its trigger.

These are presentation changes using existing request adapters. No business states, dependencies, fonts, imagery, API contracts or persistence behavior were added.

## Browser evidence

The production frontend build is served through Vite preview in CI Chromium, with intercepted synthetic API fixtures. This is real frontend execution, not a generated mockup or a real Cloud session. Twenty-seven captures include desktop dark/light, laptop, tablet, phone, selection, sort, attention, density, pagination, empty/error, account menus and long-content stress cases. Tested widths include 1920, 1366, 1280, 1152, 1024, 768, 390 and 320 CSS pixels, plus desktop DPR2.

Verified implementation/proof head: `e5ea58cd20be04c03aef28222b5b7423f3237125`.

- Visual proof: https://github.com/office952/workos-po/actions/runs/37583404387
- Full verification: https://github.com/office952/workos-po/actions/runs/37583407684
- Artifact: `requests-intake-v6`, including `GEOMETRY_EVIDENCE.json` and `IMAGE_LOADING_EVIDENCE.json`.

The scrollbar test starts with 23 synthetic requests and an overflowing document, then selects an attention filter that produces no results and removes document overflow. Brand, menu, route, account, hero, toolbar and table heading have identical x/y/width/height before and after filtering; measured deltas are zero. Reset restores the original geometry. This proves the tested Chromium layout, not every browser configuration.

All measured row actions are 160 × 44 or 148 × 44 as specified. Account controls are 44px high. Visible printed receipt lines fit the paper at every non-phone test width; the paper uses IBM Plex Mono. Long request/client/organization strings remain bounded without horizontal document overflow.

## Receipt and keyboard contracts

- Initial preview is the newest request with a valid creation timestamp.
- Hover does not change the preview. Clicking non-link row content, Enter or Space selects the request while retaining table semantics.
- Existing request/quote links retain their destinations. The paper opens the displayed request. Link clicks and text selection are not swallowed by the row handler.
- Explicit selection survives search, reset, sort and pagination. Removed requests fall back to the latest valid entry.
- Selection preserves the same image DOM node and currentSrc, adds no decorative image response and does not restart the entrance animation. These assertions run before full-page screenshots.
- Reset returns focus to search. Account Escape returns focus to “Cont”. Existing pagination and keyboard navigation remain available.
- Phone has no hidden receipt action or decorative image request.

## Image delivery

Existing optimized WebP assets and canonical server cache policy are unchanged by this refinement.

| Asset | Dimensions | Bytes |
| --- | --- | ---: |
| Standard hardware | 760 × 324 | 20,352 |
| High-density hardware | 1520 × 648 | 87,122 |
| Drafting surface | 2172 × 724 | 22,792 |

Fresh CI sessions receive two decorative assets: 43,144 bytes at DPR1 and 109,914 bytes at DPR2; phone receives zero. Measurement uses response bodies already received by Chromium and does not initiate extra fetches. These are image-payload measurements, not total page-load timing. Canonical server tests cover WebP MIME, immutable content-hashed assets and no-cache HTML/SPA fallback.

## Verification and limits

- Local frontend suite: 404 tests across 97 files passed. Targeted Requests/AppShell/AccountArea checks, typecheck, focused ESLint and build passed. The existing bundle-size warning remains.
- Full implementation CI passed: 404 frontend, 621 domain and 550 API tests, 1,575 total.
- Browser assertions cover geometry, target dimensions, clipping, overflow, mouse/keyboard selection, actual links, selection persistence, account focus, responsive image choice, decorative network counts and existing table flows.
- Full-page screenshots can temporarily resize Chromium's viewport and perturb composited animation/image capture. Selection/network assertions run before capture. Final static screenshots disable animations only during capture to show the settled paper; normal and reduced-motion runtime behavior remain separately checked.
- No actionable blocking issue was observed in inspected captures. At 320px and with extreme text lengths, secondary metadata wraps and rows become taller; content remains readable and actions remain consistent.
- No local browser executable is available in this workspace. Interactive Work Mode cloud preview remains unverified because of the previously observed ERR_BLOCKED_BY_CLIENT. CI proof does not certify that preview or the Owner's Windows runtime.

## Delivery boundary

PR #48 only. No merge or production deployment; no real Cloud/DB access or reset. The Owner's protected dirty Windows checkout is outside this workspace and has not been touched. Updating the detached Windows review worktree and restarting its synthetic reference runtime is a separate explicit handoff. Preserve its existing dataset.

The original approved intake demo remains the visual authority for this experiment. Earlier alternatives remain in their separate archive. This refinement changes printed content and layout behavior, not the underlying physical artwork.
