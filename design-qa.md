# Cereri — selected receipt and optimized image delivery, 2026-10-07

**Outcome and boundary**

The Owner-approved original physical intake composition is preserved. Its live receipt now previews an explicitly selected request, and decorative image delivery is reduced. Production-frontend Chromium captures and interaction checks passed in GitHub Actions; no actionable P0/P1/P2 visual issue remains in the inspected captures. Interactive Work Mode cloud preview remains blocked by the previously observed ERR_BLOCKED_BY_CLIENT. CI proof does not certify that cloud preview.

**Visual truth and evidence**

- Target: the first original “Fanta de intrare” demo, `generated_images/exec-dafc90b2-0512-4156-aef7-25c22b4a2109.png` in the review workspace, 1672 × 941. Later design alternatives are not the target and remain in the separate design-ideas archive.
- Current baseline: `review/requests-intake-v5/REQUESTS_V5__01_DESKTOP_DARK_1920x1080.png`, `/cereri`, all requests, newest first, comfortable rows, four synthetic fixtures, CSS viewport 1920 × 1080, deviceScaleFactor 1.
- `COMPARISON_DEMO.png`: normalized reference left, current implementation right. Normalization is solely for comparison.
- `COMPARISON_OPTIMIZATION.png`: previous accepted v4 implementation left, current implementation right, same viewport and state.
- `COMPARISON_HEADER.png`: previous header above, current below, same crop.
- Seventeen captures cover desktop dark/light, laptop, tablet, phone, sort, attention, compact density, pagination pages 1/2, phone pagination, empty/error, many-page phone pagination, explicit selection in both themes and desktop at deviceScaleFactor 2.
- Captures use the actual production frontend build through Vite preview, not a generated mockup. API responses are intercepted synthetic review fixtures. No real Cloud data is used.
- Verified evidence run: https://github.com/office952/workos-po/actions/runs/37578104254, code/proof commit `6f48b876e3adbb836749198a6a8128f558266bc6`, artifact `requests-intake-v5`.

**Receipt behavior**

- Initial receipt is the latest request with a valid creation timestamp.
- Hover only highlights the row. Clicking non-link row content selects that request. Enter/Space on the focused row selects it while retaining table semantics.
- Identity and next-action links preserve their original navigation. Clicking the paper opens the displayed request. The row handler does not swallow link clicks or text selection.
- Explicit selection is independent of search, sort, filtering and pagination. Removing the selected request from refreshed data forgets the selection and falls back to latest; a later refresh does not revive it.
- Selection changes text/link only: the image URL remains unchanged, no additional image is fetched and the entrance animation does not replay.
- Phone layouts do not mount the hardware, fetch the header texture or expose an invisible row-preview action. Existing links and pagination remain available. Media-query changes update the DOM.

**Image delivery and cache**

| Asset | Dimensions | Bytes |
| --- | --- | ---: |
| Standard hardware WebP | 760 × 324 | 20,352 |
| High-density hardware WebP | 1520 × 648 | 87,122 |
| Drafting surface WebP | 2172 × 724 | 22,792 |

The original hardware pixels are reused through resizing/encoding; no replacement art was generated. The original 1920px source remains in Git but is not imported into the runtime build. Native responsive srcset/sizes selects one hardware variant; correct intrinsic dimensions and async decoding are supplied. Visible imagery is not lazy-loaded. The texture URL applies only to non-phone media.

`IMAGE_LOADING_EVIDENCE.json` records actual image response body bytes already received by Chromium. Measurement does not initiate extra image requests. Browser assertions confirm exactly two assets on visible layouts: 43,144 bytes at 1× and 109,914 bytes at 2×, versus the previous 227,652-byte image payload. These are approximately 81% and 52% reductions in decorative image bytes, not measured reductions in total page-load time. Phone proof records zero decorative image requests. No slow-network/field benchmark is claimed.

The canonical same-origin static server supplies proper image MIME types. Only existing content-hashed public image assets under /assets receive `public, max-age=31536000, immutable`. HTML, missing-asset SPA fallback and unversioned assets revalidate with `no-cache`. API responses are unaffected. Cache policy is tested through the canonical server; the screenshot preview server is not the production cache-policy proof.

**Fidelity review**

- Typography: existing Geist Sans headings, IBM Plex Sans interface text and IBM Plex Mono technical labels/counters; warm display ink and live paper typography preserve hierarchy. Long paper titles clamp to two lines.
- Rhythm: title/counts left, 760px hardware right (about 16% smaller than the normalized original, as requested), quiet divider, aligned toolbar, unframed register and working 10/20/50 pager.
- Material/contrast: fine square grid, restrained grain, bronze calibration marks and warm metal/paper remain. Dark opacity 0.52 and neutral inverted/multiply light opacity 0.46 preserve both themes. Explicit selection adds a quiet mint lower edge while keeping canonical amber attention marking.
- Functional content: existing adapters determine request identity, state, commercial progress and next action. Presentation selection invents no business state. Empty/error receipts remain neutral.
- Remaining P3: optimized grain is slightly smoother, and native font glyphs/raster geometry differ slightly from the generated demo. Composition and function are preserved; this is not a pixel-identical reproduction.

**Verification and capture corrections**

- Local checks passed: 16 Requests + 5 AppShell tests; 8 API origin/static tests; frontend lint/build; engine lint/typecheck. Eleven unrelated lint warnings and the existing bundle-size warning remain.
- Full CI on the implementation passed frontend and engine checks. Suite totals are 404 frontend, 621 domain and 550 API tests (1,575).
- Browser assertions cover hover, row click, Enter/Space, selection persistence through filters, actual request/paper link navigation, no image reload/replayed entrance, responsive variant choice and zero phone decoration requests, alongside existing search/sort/density/pagination/empty/error checks.
- An initial offscreen keyboard-pagination full-page capture omitted composited header layers. Restoring scroll to the reference viewport and waiting two paint frames produced the correct full-page capture; the final page-2 image was inspected.
- Earlier resource instrumentation explicitly decoded a second image and distorted the loading report; using response bodies already received by Chromium removed that extra request. Resource Timing was insufficient for the CSS background in this environment; actual response evidence verifies the byte totals.
- No actionable P0/P1/P2 issue remains in the final inspected CI captures. No local browser executable is available in this workspace; visual verification is through CI Chromium.

**Delivery**

Existing PR #48 and review branch only. No merge, production deployment, persistence/domain change or real Cloud/DB access. Other design ideas remain preserved separately.

final result: blocked

Blocker is limited to interactive Work Mode cloud-preview verification. The authorized GitHub review delivery includes verified synthetic Chromium captures and interactions with that explicit limitation.
