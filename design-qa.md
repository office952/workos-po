# Follow-up: explicit receipt selection and image delivery, 2026-10-07

Owner GO authorizes using the physical receipt as a selected-request preview and optimizing its image delivery. Default receipt remains the latest dated request. Hover only highlights; clicking non-link row content selects; Enter/Space on the row selects; identity, next-action and paper links retain navigation. Selection is presentation state independent of filter/sort/page and falls back to latest when its request is removed. Phone layouts omit both the hardware DOM and row-preview interaction.

Responsive WebP assets reuse the existing hardware pixels: 760 × 324 (20,352 bytes), 1520 × 648 (87,122 bytes). The matching drafting surface remains 2172 × 724 and is recompressed to 22,792 bytes. Maximum image payload is 43,144 bytes at 1× desktop and 109,914 bytes at 2× desktop, versus 227,652 bytes previously. The original 1920px source is retained in Git but is no longer imported into the runtime build. Text updates do not change image URLs or replay the hardware animation. Async decoding is used; visible imagery is not lazy-loaded. CSS limits the texture URL to non-phone viewports.

The canonical static frontend server now supplies correct image MIME types and one-year immutable caching only for existing versioned public images under /assets. HTML, missing-asset SPA fallback and unversioned assets revalidate. API responses are unaffected. These are transport/cache changes only; no persistence or business changes.

Focused verification: 16 Requests + 5 AppShell tests and 8 API origin/static tests passed locally; production build passed. Seventeen production-frontend Chromium captures and image resource evidence are pending GitHub Actions. The earlier comparison below remains historical until this follow-up is visually checked.

final result: blocked

Pending follow-up capture inspection. Interactive Work Mode cloud preview also remains blocked by ERR_BLOCKED_BY_CLIENT, as previously observed.

---

# Cereri — original intake concept and surface refinement, 2026-10-07

**Scope and visual truth**

The Owner selected the first original “Fanta de intrare” demo, with the physical intake slightly smaller and working pagination below the register. This follow-up brings the header texture and technical grid closer to that exact reference. It does not select a later design variation.

- Reference: `generated_images/exec-dafc90b2-0512-4156-aef7-25c22b4a2109.png` in the review workspace, 1672 × 941.
- Browser evidence: `review/requests-intake-v4/REQUESTS_V4__01_DESKTOP_DARK_1920x1080.png`, `/cereri`, newest first, comfortable rows, four synthetic requests, 1920 × 1080 CSS viewport, deviceScaleFactor 1.
- Comparison: `COMPARISON_FINAL.png`, reference left and implementation right; `COMPARISON_HEADER_FINAL.png`, reference above and implementation below. Reference normalization is solely for visual comparison.
- Fourteen captures cover desktop dark/light, laptop, tablet, phone, sort, attention, compact density, pagination pages 1/2, phone pagination, empty/error and a middle page of a 200-request phone dataset.
- Chromium runs in GitHub Actions. The local browser executable is unavailable in the current workspace; its download failed. No real Cloud data or writes are used.

**What changed**

1. The earlier routing-grid treatment was too different from the demo. A generated matte, warm-black drafting surface now supplies fine square grid lines, restrained larger divisions, light material grain and sparse bronze calibration marks. The left title area is quiet; technical detail concentrates around the intake.
2. Initial surface opacity 0.72 was too strong. Final opacity is 0.52 in dark. Light uses an inverted neutral surface with multiply blending at 0.46. The asset is 2172 × 724, compressed WebP, 47,652 bytes; it is decorative and does not carry business data.
3. The hardware remains 760px at desktop, about 16% smaller than the normalized reference. Its responsive grid track, aspect ratio and explicit image/text layers preserve the live receipt area.
4. A delayed opacity entrance left the live receipt text absent from laptop/tablet full-page captures despite valid text, computed opacity and geometry. Receipt text now displays immediately. Only the physical paper image retains its short reveal; reduced motion disables that reveal.

Latest fourteen Chromium captures were inspected after the receipt fix. Laptop and tablet paper text is visible; no actionable P0/P1/P2 visual issue remains in the captured states. The cloud-preview blocker below remains.

**Fidelity review**

- Hierarchy and rhythm: open title/counts on the left, physical intake on the right, restrained divider, toolbar, unframed register and functional pager. Hardware size and pagination are deliberate Owner changes.
- Typography: existing Geist Sans headings, IBM Plex Sans interface text and IBM Plex Mono technical labels/counters. Warm display ink and clear live paper text maintain the reference hierarchy. Long receipt titles clamp to two lines.
- Material and contrast: bronze hardware and cream paper are preserved. The new grid and grain supply the requested background material while the worklist remains visually quiet. Both themes retain semantic mint actions and amber attention.
- Content: latest receipt, request states, commercial progress and actions use the existing adapter and routes. Receipt remains independent of list filtering/page selection. Empty/error content remains neutral. Review timestamps use Europe/Bucharest; the demo's illustrative times are not fixed application content.
- Remaining P3 differences: native WorkOS font glyphs, exact raster paper geometry and grid contrast vary slightly from the generated demo. This is a faithful implementation of the selected composition, not a pixel-identical reproduction.

**Verification**

- The previous implementation passed 20 targeted Requests/AppShell/navigation tests and 1,571 full CI tests: 401 frontend, 621 domain, 549 API.
- The follow-up workflow repeats Requests tests, production build, browser interaction assertions and all fourteen captures. Full WorkOS Verify repeats frontend and engine lint/typecheck/tests/build.
- Browser assertions cover filtering, search/reset, sort before pagination, compact rows, page sizes 10/20/50, pager boundaries, keyboard activation, bounded phone links, reduced motion and no horizontal overflow. Receipt geometry and texture decoding are explicitly checked on visible layouts.
- Existing unrelated lint warnings and the existing bundle-size warning remain.
- Cloud interactive-preview verification is still blocked by the previously observed `net::ERR_BLOCKED_BY_CLIENT` at `http://terminal.local:4173/cereri`. Successful CI captures do not certify an interactive Work Mode cloud preview.

**Delivery boundary**

The authorized delivery is the existing GitHub review branch/PR, with synthetic browser screenshots and comparisons. No merge, production deployment, real Cloud mutation or business database change is included. Other design ideas remain preserved in the separate design-ideas archive.

final result: blocked

The cloud interactive-preview requirement remains blocked. GitHub review evidence is supplied with that explicit limitation; this is not a certified cloud prototype handoff.
