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
