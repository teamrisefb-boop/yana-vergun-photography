# Motion restoration preview

Status: user-approved for GitHub Pages publication after local review on
`preview/restore-motion`. Review videos and traces remain local, not deployed.
Reference: `e260bb8`, compared with the optimized `0a6d456` version.

## Restored choreography

- Original `assets/logo.png`, unchanged bytes; black full-screen intro, centered
  360px/66vw logo, original 1.45s left-to-right reveal and delayed caption.
- Original GSAP 3.12.5 easing and timeline: inner fade starts at 1.95s; two 0.9s
  rising curtains overlap; hero starts at 3.15s with 1.1s reveals / 0.12s stagger.
- Text reveals: 1.2s / 46px / 9px soft-focus; grouped card stagger: 0.13s;
  photo uncover: 1.35s. Hero text retains the same soft-focus effect.
- Marquee: approximately 30px/s (historical 0.5px/frame at 60Hz).
- Desktop image parallax (-40px hero, -30px about/contact), magnetic buttons,
  1.06x photo hover, 0.6s captions, and scrubbed process-line drawing.

## Deliberate differences

- Native scrolling is retained; Lenis is not reintroduced. Mobile keeps the
  intro and reveals, without desktop pointer effects/parallax.
- Blur is limited to text, not full photographs or photo cards. The longer
  uncover/reveal choreography is retained without rasterizing large photos.
- Reveal, hover, parallax and magnetic movement use separate elements.
- The booking form container stays untransformed, preserving its anchor position
  and focus behavior while surrounding text/photos reveal.
- Intro starts with deferred scripts, not `window.load` / all photographs.
  The eager, high-priority responsive hero downloads during the intro.
- A six-second head-script watchdog removes overlays and inert state; CSS has
  its own visibility/overflow fallback. Escape/Tab also release the intro.
  Library/runtime failure reverts hidden content to a readable static state.
- Every ordinary visit/reload runs the intro; no sessionStorage. Direct section
  hashes (including contact/form) and reduced motion skip it. Hash clicks do not
  restart it. Hiding the tab releases the intro and pauses background motion.
- GSAP/ScrollTrigger are local pinned assets, not a CDN dependency. Rebuild them
  using `node scripts/build-motion.mjs`; vendor license headers are preserved.

## Retained functionality

AVIF/WebP/JPEG responsive sources, sizes, lazy loading, image dimensions, native
lightbox, labels, anchors, translations, accessibility, booking endpoint and
Telegram Worker are retained. No placeholder contacts/testimonials restored.
No actual Telegram booking is sent by any review/test script.

## Review and reproduce

Local site: `http://127.0.0.1:4173/`.
Video comparison: `http://127.0.0.1:4173/test-results/motion-review/index.html`.
Historical site: `http://127.0.0.1:4173/baseline/` (read-only historical source).

Start a local server with `BASELINE_REF=e260bb8` and `node scripts/preview.mjs`.
Record videos with `node scripts/record-motion-review.mjs`. Both versions use
the same 1440x900 / 390x844 viewport and GSAP version. For the historical capture,
only CDN delivery of GSAP and the original Montserrat family is substituted
with local copies; historical Lenis and choreography remain active.

Run all tests with:

```sh
node --test tests/worker.test.mjs tests/telegram-group.test.mjs tests/booking.browser.test.mjs tests/ui.browser.test.mjs tests/motion.browser.test.mjs
```

Motion tests cover actual intermediate logo/curtain/card/hover frames, reload,
down/back scrolling, process line, marquee, anchor bypass, reduced motion,
pending photos, missing vendors, missing motion script and runtime recovery.
Chrome, Chromium and WebKit desktop/mobile contexts are included. Existing UI
tests also cover widths 360, 390, 430, 768, 1366 and 1440. WebKit on Windows is
not a substitute for a physical iPhone/Safari check.

First restoration review: 90 tests passed, 0 failed. Recordings of both versions play
successfully; historical GSAP and Lenis are active, restored GSAP is active.
No horizontal overflow or runtime errors in the four recorded viewports.

Synthetic scroll trace, 1.6 Mbps down / 150ms latency / CPU x4 / disabled cache:

| Viewport | Motion / intro | CLS | p95 frame gap | Max frame gap | >50ms gaps / scroll long tasks |
| --- | --- | --- | --- | --- | --- |
| 390x844 | ready / done | 0 | 16.7ms | 33.3ms | 0 / 0 |
| 1440x900 | ready / done | 0 | 16.8ms | 33.4ms | 0 / 0 |

These are bounded headless Chromium samples, not physical-device guarantees.
Local form previews do not send real bookings: the Worker still accepts only
the existing production origin. All automated booking checks mock Telegram.

## Adaptive reveal follow-up

The approved intro timeline, logo and curtain CSS are unchanged.

Diagnosis: the visible grey planes in the reproduced scroll were loaded images
covered by the reveal mask, not missing files. The old 88% trigger plus batch
wait and up to 0.52s cascade delay let scroll outrun a bottom-up 1.35s reveal.
Measured non-hero decode work was about 10-32ms; the hero decoded during intro.

- An IntersectionObserver promotes only frames within 1.6 viewport heights of
  the screen, both ahead and behind. It observes the unmasked frame, not a child
  clipped by the reveal. Existing picture/srcset/sizes choose responsive files.
  Remote originals and lightbox-size files are not eagerly fetched.
- Loaded images decode ahead of their reveal. Completion schedules a check,
  so a stopped visitor need not scroll again to make a newly loaded photo show.
- One passive-scroll/rAF coordinator reads pending geometry before writes.
  Lead distance is 100px at rest, growing with velocity up to 0.8 viewport.
  Normal uncover remains 1.35s, text 1.2s, cascade 0.13s.
- Above 1200px/s, pending delays disappear and reveals finish in 0.32s from
  their current progress. Late arrivals already substantially visible use this
  shorter path too. Skipped content above the viewport is finalized offscreen.
- Photo completion is monotonic: load, decode, return, resize and responsive
  source changes cannot arm a completed mask again. Service cards use the same
  coordinator and cannot stay hidden after an entire section is skipped.

Before/after diagnostic (`scripts/check-reveal-availability.mjs`), counting
visible photo samples with less than 10% exposed image at 50ms intervals:

| Context | Before: loaded but masked | After: loaded but masked | Waiting for file |
| --- | --- | --- | --- |
| Desktop | 82 / 340 samples | 7 / 329 samples | 0 in both runs |
| Mobile | 32 / 182 samples | 2 / 182 samples | 0 in both runs |

Remaining after-samples were isolated entry observations, not sustained grey
planes. This is a controlled local reproduction, not a promise of instant
photos on an arbitrarily slow/offline network. Network delay still cannot be
eliminated for an uncached jump beyond the prefetch window.

New recordings: `adaptive-desktop.webm` and `adaptive-mobile.webm` in the review
page. Flow: intro, slow scroll, fast pass through services, return to portfolio.
Generate with `node scripts/record-motion-review.mjs adaptive`. Earlier videos
are retained separately. No real booking submissions were made during review;
publication was held until explicit user approval.

Follow-up verification: 97 tests passed, 0 failed, including fast-pass/return
checks in Chrome, Chromium and WebKit desktop/mobile, prefetch bounds, responsive
source changes, retained slow cadence, and delayed images with no further scroll.
New throttled traces in `test-results/motion-review/adaptive-performance` show
CLS 0 in both contexts, p95 frame gaps 16.8ms, maximum gaps 33.3ms mobile / 33.4ms
desktop, no >50ms gaps and no scroll long tasks (same CPU/network conditions).
No physical iPhone test is implied by the WebKit emulation.

Throttled traces can be reproduced using `scripts/check-scroll-performance.mjs`
with `PERF_OUTPUT=test-results/motion-review/performance`; add
`PERF_DEVICE=desktop` for desktop. The script waits for the intro/hero before
sampling scroll. Reports and videos stay in ignored `test-results/`.
The earlier `PERFORMANCE.md` describes the earlier optimization, not new motion
measurements. Field performance and subjective approval are not inferred from
headless traces.
