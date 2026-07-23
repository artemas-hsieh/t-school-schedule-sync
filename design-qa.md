# Hero design QA

**Source visual truth**

- Desktop: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-df5f0965-d6f7-4c45-9526-7d42d2fccbc8.png`
- Mobile: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-e9e9234e-15c5-4890-80df-e571c90ba1cc.png`

**Implementation evidence**

- Local route: `http://127.0.0.1:8766/configurator/`
- Desktop screenshot: `/private/tmp/tschool-hero-desktop-implementation.png`
- Mobile screenshot: `/private/tmp/tschool-hero-mobile-implementation.png`
- Desktop comparison: `/private/tmp/tschool-hero-desktop-comparison.png`
- Mobile comparison: `/private/tmp/tschool-hero-mobile-comparison.png`

**Viewport and normalization**

- Desktop implementation: 1440 × 900 CSS px, screenshot 1440 × 900 px.
- Desktop source: 3024 × 1768 px; normalized to 900 px high and center-cropped to 1440 × 900 before side-by-side comparison.
- Mobile implementation: 390 × 844 CSS px, screenshot 390 × 844 px.
- Mobile source: 1590 × 3324 px; normalized to 844 px high and center-cropped to 390 × 844 before side-by-side comparison.
- The source screenshots include different device-density/browser-chrome assumptions, so comparison focuses on content composition and hierarchy rather than raw pixel size.

**State**

- Hero initial scroll position (`scrollY = 0`) for desktop and mobile.
- Mobile scroll motion was separately checked after 360 px of user scrolling.
- Step 3 current state was checked after completing step 2 to inspect the preceding progressive blur.

**Full-view comparison evidence**

- Desktop preserves the source hierarchy: large two-line title and supporting labels on the left, overlapping schedule/calendar papers on the right, and a centered bottom CTA.
- Mobile preserves the source sequence: header, two-line title, supporting copy and labels, clipped wide paper scene, and bottom CTA.
- The existing color tokens, square paper treatment, line weights and shadows remain consistent with the source and the established configurator.
- Copy matches the approved Hero text exactly.

**Focused comparison evidence**

- Separate focused crops were not required: both references keep the Hero typography, labels, paper edges, tiles and CTA legible in the full-view comparison.
- The progressive fog was checked in the rendered page: five Hero layers move with the paper track; five independent preceding-section layers cover the used button and clear toward the current-card connector.

**Interaction and technical checks**

- Mobile paper track moves left while the transfer tiles move right in viewport coordinates.
- Desktop paper track remains fixed while transfer tiles retain their scroll-driven motion.
- CTA remains clickable and above the Hero fog.
- Page width stays within the viewport at 1440 px, 390 px and 320 px.
- The grade-selection flow, schedule loading, two-stage step-2 confirmation and transition to step 3 completed without a browser error.

**Comparison history**

1. Initial mobile pass: the Hero fog covered almost the entire schedule paper and the second title line was clipped.
2. Fix: reduced the mobile Hero fog width, raised the copy stacking level above the fog, enforced the intended two-line title and tightened the narrow-screen title size.
3. Post-fix evidence: the schedule paper retains a clear right edge, CTA remains clear, the title stays on two lines, and no horizontal page overflow remains at 390 px or 320 px.

**Findings**

- No actionable P0, P1 or P2 mismatch remains.
- P3: final perceived scale, blur density and motion pacing remain subjective and are intentionally left for the product owner's visual review.

**Final result**

final result: passed
