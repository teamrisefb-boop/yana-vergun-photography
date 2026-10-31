# Performance and UI verification

Updated: 2026-10-31. Baseline source: `bc3cbc0`.

## Changes

- Same photographs and monochrome branding; original image files remain unchanged.
- AVIF, WebP and JPEG alternatives at 240/480/800/1200/1600 px where the source
  supports them. Larger originals additionally have a 2400 px lightbox version.
  Small originals are never enlarged. All variants retain the original aspect ratio;
  existing card cropping is implemented by the same `object-fit: cover` frames.
- Responsive `picture`, `srcset` and grid-specific `sizes`; eager/high-priority hero,
  lazy/async lower photographs, intrinsic dimensions, stable neutral backgrounds and
  translated image-error states. Full lightbox files load only when opened.
- No blocking introduction, GSAP/ScrollTrigger/CDN dependency, Lenis, parallax,
  animated blur, image curtain or magnetic pointer handlers. Natural scrolling,
  optional 320 ms reveals for already-loaded content, reduced-motion support and
  a CSS marquee paused while the tab is hidden. Content remains visible without JS.
- Montserrat hosted locally with its SIL license and optional font display.
- One measured header offset for native anchors, reload and browser history.
  Visible booking heading and persistent field labels. International validation
  metadata is loaded on form interaction, not on the initial screen.
- Native modal photo viewer with keyboard navigation, explicit focus containment
  and return, zoom, Escape, large touch controls and locked background scrolling.
- UA/EN field labels, image descriptions, navigation labels, city/availability,
  contact text and privacy information. Footer placeholder phone and empty social
  links removed. Unverified testimonial quotes removed; accompanying photos kept.
- Privacy text describes the actual GitHub Pages -> Cloudflare Worker -> Telegram
  booking group flow, with no invented legal identity or retention period.
- Worker, secrets, group destination and public endpoint unchanged by this update.

## Photo weight

14 unique displayed photographs; repeated uses count once. Decimal units.

| Set | Bytes | Size |
| --- | ---: | ---: |
| Original photographs | 60,711,641 | 60.71 MB |
| AVIF at 800 px (720 for smaller originals) | 580,519 | 0.581 MB |
| WebP at the same widths | 859,890 | 0.860 MB |
| JPEG fallbacks at the same widths | 1,234,718 | 1.235 MB |

The AVIF comparison is a 99.04% reduction. It is not the size of every
responsive variant combined: all sizes/formats occupy about 21.97 MB on disk,
in addition to the retained originals. A browser selects a single format/size.
Exact per-image dimensions and bytes: `assets/optimized/manifest.json`.

## Lighthouse Mobile: Same Local Conditions

Lighthouse 13.6.0, bundled Chromium 156, cold storage/cache, mobile 390x844,
standard simulated mobile network/CPU throttling. Both baseline and updated
pages use the same loopback server with gzip for text. The baseline serves
its HTML and JS from the pinned Git commit, not the modified working tree.
One paired laboratory run, not field/CrUX data and not a median over devices.

| Metric | Before | After |
| --- | ---: | ---: |
| Performance | 73 | 97 |
| Accessibility | 93 | 100 |
| Best Practices / SEO | 100 / 100 | 100 / 100 |
| FCP | 1.85 s | 1.05 s |
| LCP | 187.32 s | 2.25 s |
| CLS | 0.0014 | 0 |
| Total Blocking Time | 118 ms | 140 ms |
| Speed Index | 1.89 s | 1.05 s |
| Transfer in the initial audit | 60,988,609 bytes | 301,382 bytes |

The extreme baseline LCP is Lighthouse's *simulated* result for the large
original gallery and load-dependent intro, not a measured 187-second wait on
the user's phone. TBT did not improve in this individual run; no claim is made
that every metric improved. Measurements vary with host scheduling and network.

Reports/traces, excluded from Git: `test-results/performance/before.html`,
`after.html`, matching JSON and `*-defaultPass.trace.json` files.

## Published Version

App commits: `d695b75` and `0a6d456`. A first published audit exposed CLS 0.15
when the deferred script switched a static no-JS header to fixed positioning.
This was reproduced with a 700 ms script delay, then fixed by setting the
enhancement class before first paint. A regression test covers the delayed script.

The final published audit (`?v=0a6d456`, same Lighthouse mobile configuration):
Performance **99**, Accessibility/Best Practices/SEO **100**, FCP **1.05 s**,
LCP **1.67 s**, CLS **0**, TBT **70 ms**, Speed Index **1.46 s**, transfer
**302,245 bytes**. This is a separate laboratory deployment check, not a paired
before/after measurement of the old public URL and not field Core Web Vitals.
Artifacts: `test-results/performance/published.html`, matching JSON and trace.

## Slow Network Scroll Trace

Observed CDP run, separate from Lighthouse's model: 390x844, 1.6 Mbps down,
0.75 Mbps up, 150 ms latency, CPU slowdown 4x, browser cache disabled.
First-screen LCP: 1,088 ms; CLS: 0. Fast down/up scroll sampled 169 rAF gaps:
95th percentile 16.8 ms, maximum 33.3 ms, no gaps above 50 ms and no observed
long tasks during the scroll interval. These are laboratory frame intervals,
not a guarantee of 60 fps on every physical device.

Artifacts: `test-results/performance/mobile-scroll.trace.json`,
`mobile-scroll.json`, `slow-mobile-first-screen.png`.

## Checks and Limits

- Passed: 30 Worker/form mock checks and 36 UI checks (66 total). The full
  36-check UI suite passed again against the final published version, including
  Google Chrome 156.0.8078.74, bundled Chromium and Windows WebKit.
- Widths 360, 390, 430, 768, 1366 and 1440 in browser automation.
- Direct `#form`, reload, booking links, Back/Forward and delayed photos; no
  overlap with header, horizontal overflow or image-induced anchor movement.
- Lightbox lazy full files, navigation, Escape, Tab loop, zoom, focus return;
  mobile menu and privacy dialog; UA/EN; no-JS and failed-image/CDN fallbacks.
- Existing Worker security and phone/entity unit tests, plus mock form success,
  Telegram error, timeout, rate limit, double submit and validation-module failure.
- No real booking request was sent during this performance/UI update.
- Published screenshots: `test-results/published/chrome-hero-1440.png`,
  `chrome-hero-390.png`, form captures for each width and `chrome-gallery-390.png`.
  These local artifacts are intentionally ignored by Git.
- Windows WebKit is an engine check, not real Safari/iOS. Physical iPhone Safari,
  VoiceOver/TalkBack and field Core Web Vitals remain unverified.

## Reproduce

`pnpm install --frozen-lockfile`, then `pnpm build:fonts` and `pnpm build:images`.
Image originals are not overwritten. Changed originals rebuild automatically.
After editing image encoding settings, run `node scripts/build-images.mjs --force`
followed by `node scripts/update-image-markup.mjs` to refresh generated variants.

Start `pnpm preview` (default `http://127.0.0.1:4173/`). Set `BASELINE_REF=bc3cbc0`
before starting to retain this audit's baseline at `/baseline/`.

Run `pnpm test`, `pnpm test:browser`, `pnpm test:ui` (requires Playwright Chromium,
WebKit and installed Google Chrome), `node scripts/measure-performance.mjs URL LABEL`, and
`node scripts/check-scroll-performance.mjs URL`.

Published UI checks support `SITE_URL=https://teamrisefb-boop.github.io/yana-vergun-photography/`.
They block the production booking endpoint and never send a real request.
