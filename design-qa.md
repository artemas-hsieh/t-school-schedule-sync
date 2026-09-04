# Email Design QA

## Evidence

- Source visual truth: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-fbe410fa-8b2d-4d4e-a9a7-5dcc9d1d457e.png`
- Source dimensions: 1428 × 1582 px
- Normalized source: 714 × 791 px, downsampled to 50%
- Implementation: `outputs/email-template-copies/03-schedule-changes.html`
- Implementation screenshot: `outputs/email-template-copies/design-qa-schedule-changes-final.png`
- Comparison image: `outputs/email-template-copies/design-qa-schedule-changes-comparison-final.png`
- Desktop CSS viewport: 714 × 791 px
- Implementation full-page capture: 714 × 801 px
- Density normalization: source downsampled from 2×; implementation captured at 1× CSS pixel density
- State: three schedule changes with time, location, and new-item examples

## Full-view comparison

- The 640 px email frame, orange-red border, pale green page background, header metadata, status label, headline, three comparison cards, and footer match the reference structure.
- The first implementation pass was 860 px tall because the card padding and empty lede occupied extra space.
- The second pass restored the reference card density and hid empty lede/omitted-note regions. The final capture is 801 px tall, 10 px taller than the normalized reference; this is a minor rendering-rhythm difference and does not alter the composition.

## Required fidelity surfaces

- Fonts and typography: system Traditional Chinese font stack, weights, hierarchy, line height, and wrapping remain consistent with the reference.
- Spacing and layout rhythm: frame width and card alignment match; the final total height differs by 10 px and is classified as P3.
- Colors and visual tokens: page, border, ink, muted text, green new-arrangement label, and orange-red status colors match the existing email palette and reference.
- Image quality and asset fidelity: the reference contains no raster or icon assets that need reproduction.
- Copy and content: headline, three course examples, change tags, old/new labels, and footer match the requested state.

## Focused region comparison

No separate crop was required because the normalized 714 px full-view comparison keeps all typography, tags, dividers, and card copy legible.

## Responsive and interaction checks

- At 390 px viewport width, `body.scrollWidth` equals `body.clientWidth`; no horizontal overflow was detected.
- The HTML-template index exposes ten unique links.
- Clicking the setup-complete card opened the expected subject page and browser title.
- Browser console reported no errors or warnings.

## Comparison history

1. Initial pass: P2 vertical-density mismatch from enlarged card padding and an empty lede.
2. Fix: restored the reference card spacing and hid empty lede content.
3. Second pass: remaining empty omitted-note margin added extra height.
4. Fix: hid the omitted-note paragraph when there are no omitted changes.
5. Final pass: no actionable P0, P1, or P2 differences remain.

## Follow-up polish

- P3: The implementation is 10 px taller than the normalized reference because of browser/email table rendering. No change is required unless exact total-height matching is preferred.

final result: passed

---

# Tall Mobile Hero Design QA

## Evidence

- Source visual truth: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-610dbbe7-3c48-4a0e-b7fc-829948aee7a6.png`
- Source dimensions: 1474 × 1790 px
- Target crop: right-hand 672 × 1696 px frame, normalized to `outputs/design-qa/hero-mobile-reference-right-390x984.png`
- Implementation screenshot: `outputs/design-qa/hero-mobile-390x984-final.png`
- Comparison image: `outputs/design-qa/hero-mobile-390x984-comparison.png`
- CSS viewport: 390 × 984 px
- Density normalization: the target crop and browser capture were both normalized to 390 × 984 px before comparison
- State: Hero start position on a narrow, tall mobile viewport

## Full-view comparison

- The final title, paper animation, benefit labels, and CTA follow the same four-group vertical rhythm as the target frame
- The paper group and benefit labels align closely with the target, while the CTA retains the same bottom safe-area relationship
- The shorter 390 × 700 regression viewport keeps the original compact layout instead of forcing the tall-screen spacing model

## Required fidelity surfaces

- Fonts and typography: existing Noto Sans TC family, weights, sizing, wrapping, and hierarchy were preserved
- Spacing and layout rhythm: extra tall-screen height is distributed through weighted spacer tracks instead of accumulating inside the animation row
- Colors and visual tokens: no palette, border, shadow, or semantic color changes were introduced
- Image quality and asset fidelity: the Hero remains code-native UI with no new raster assets or substitutions; existing lines and text remain sharp
- Copy and content: all Hero labels and action copy remain unchanged

## Focused region comparison

No separate focused crop was required because the full-height 390 px comparison keeps the title, papers, labels, and CTA legible, and the requested change is their overall vertical relationship

## Responsive and interaction checks

- At 390 × 984, the tall-screen rule is active, horizontal overflow is 0 px, and the mobile Hero fog remains hidden
- At 390 × 700, the tall-screen rule is inactive, horizontal overflow is 0 px, and the CTA remains inside the viewport
- The 「開始設定」 action still advances to the first step
- Browser console reported no errors or warnings

## Comparison history

1. Initial pass: P2 spacing mismatch because the flexible animation row stored all spare height, visually separating the top and bottom groups
2. Fix: changed the tall-screen layout to a fixed-height animation row with distributed spacer tracks
3. Intermediate pass: P2 lower-group drift because equal spacing moved the benefit labels and CTA too high relative to the target
4. Fix: weighted the spacer tracks to match the target's larger visual-to-benefit interval while retaining bottom safe-area spacing
5. Final pass: no actionable P0, P1, or P2 differences remain

## Follow-up polish

- P3: final title placement differs by roughly 15 px from the normalized reference crop; this is acceptable because the source frame and browser viewport include slightly different outer framing

final result: passed
