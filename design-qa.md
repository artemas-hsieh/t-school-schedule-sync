# Hero and fifth-card design QA

## Visual truth

- Desktop Hero target: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-49fa659b-ea21-4d12-bcfe-8f54acba992d.png`
- Mobile Hero target: `/Users/ooxie/Screenshots/新版.png`
- Fifth-card target: `/Users/ooxie/Screenshots/第五張卡片.png`
- Copy-success target: `/var/folders/p5/xwqc4kjd1477j__yr7rlp_4c0000gn/T/codex-clipboard-efdd9326-33bf-43d5-884b-2731194ea8ba.png`
- Cursor-label shape target: `/Users/ooxie/Screenshots/Screenshot 122.png`
- Fifth-card implementation capture: `/private/tmp/t-school-fifth-card-implementation.png`
- Side-by-side comparison: `/private/tmp/t-school-fifth-card-comparison.png`
- Final initial-state capture: `/private/tmp/t-school-copy-initial-final.png`
- Final hover captures: `/private/tmp/t-school-copy-hover-final-a.png`, `/private/tmp/t-school-copy-hover-final-b.png`
- Final cursor-success capture: `/private/tmp/t-school-copy-success-cursor-final.png`
- Focused cursor comparison: `/private/tmp/t-school-copy-cursor-comparison.png`
- Local route: `http://127.0.0.1:8766/configurator/`

## Root causes and fixes

- Desktop and mobile shared one benefit label, so shortening the mobile copy also changed desktop. The first benefit now has explicit desktop and mobile variants.
- Mobile tiles previously combined responsive percentage offsets with independent transforms. That created a vertical-looking trajectory and let the final position drift away from the rendered papers.
- Mobile tile anchors are now calculated from the schedule paper's current rendered box. Their animation changes only horizontal translation; the start and end Y coordinates are identical.
- The fifth-card copy button used the same `transform` property for centering and interaction feedback. Shared hover rules could therefore move the element that defined its own hit area, while the more-specific copied hover state overrode later `:active` feedback.
- The button now uses a Grid overlay for centering and no transform in default, hover, active or copied states. A restartable, non-positional brightness and inset-border animation runs on every copy press.
- Copy success no longer opens the fixed bottom-right toast. The active copy trigger instead updates the existing cursor caption to the success token (`#00885f`, white text, no shadow) while preserving the caption shape.

## Browser checks

- `375 × 812`, Hero start/middle/end: all three tile Y coordinates stayed unchanged; the tiles moved left-to-right and ended inside the calendar paper. No horizontal overflow.
- `1440 × 900`: the desktop-only full label is visible; the compact mobile label is hidden.
- Fifth card at a 1200 px viewport: card capture is `1000 × 787`, matching the reference dimensions and state. A side-by-side comparison confirmed the heading, copy, code window, three operation rows and borders align with the supplied target.
- `598 × 971`, initial copy-button hover: two delayed captures retained the same centered button position and pointer hit area.
- Repeated copy: the restart class was present on successive clicks, text remained `複製完成！`, and the button remained enabled.
- Copy feedback: `#toast` remained hidden; the cursor had `has-success-label`, read `複製完成！`, and used the green success caption without a shadow.
- Template link DOM: exact requested `/copy` URL, `_blank`, and `rel="noopener"`.
- Focused comparison: the pre-copy cursor-caption silhouette from `Screenshot 122.png` is preserved; only the requested success color and text change.
- Browser console: no errors.

## Comparison history

- Earlier P1: the initial hover appeared to jump because transform handled both centering and hover movement. Fixed by removing transform-based centering; post-fix delayed hover captures remain aligned.
- Earlier P2: copied-state specificity suppressed subsequent press feedback. Fixed with a restartable `is-copy-pressing` animation independent of copied/hover state; repeated clicks retain the class and enabled state.
- Earlier P2: fixed toast duplicated copy feedback away from the action. Fixed by routing success to the contextual cursor label; post-fix capture shows no visible toast.

## Fidelity surfaces

- Typography: existing fifth-card and cursor-caption families, weights, sizes and line heights are unchanged.
- Spacing and layout: Grid centering preserves the button's original visual center and hit area at the reported viewport.
- Colors and tokens: success caption uses the existing green system color with white text and no added shadow.
- Image quality: no raster or icon assets were added or replaced.
- Copy: cursor label is exactly `複製完成！`; template copy uses the requested Google Sheets URL.

## Remaining visual judgment

- Safari's real translucent toolbar behavior still requires final confirmation on an iPhone.
- Motion pacing, antialiasing and overall visual feel remain subject to the user's final visual review.

final result: passed
