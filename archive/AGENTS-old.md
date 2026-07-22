# T-SCHOOL Schedule Sync Agent Guide

## Working language

- Use Traditional Chinese for user-facing communication unless requested otherwise.
- Keep updates concise, concrete, and outcome-first.

## Source of truth

- Treat the current implementation in `configurator/` as the UI source of truth.
- Do not read or apply archived visual guidance under `archive/` unless the user explicitly requests it.

## Visual review boundary

- Leave purely visual judgment and screenshot comparison to the user by default.
- For visual-only changes, state the dimensions the user should inspect, such as hierarchy, spacing, alignment, contrast, motion rhythm, responsive composition, and brand consistency.
- Do not spend substantial time or compute on browser-driven screenshots, repeated viewport comparisons, or pixel-level visual iteration unless the user explicitly asks for automated visual review.
- Lightweight checks are still appropriate when cheap and necessary, including syntax, horizontal overflow, missing elements, browser errors, and obvious responsive breakage.
- Continue to test behavior that affects usability or correctness, including navigation, focus, keyboard access, state transitions, form behavior, reduced-motion fallbacks, generated code, and data flow. Do not classify these as purely visual.

## Implementation constraints

- Keep the public configurator static, build-free, and dependency-free unless the user approves an architectural change.
- Preserve existing data parsing, Calendar safety rules, generated Apps Script behavior, settings migrations, and public Apps Script functions.
- Use the fixed Apps Script `/exec` schedule endpoint documented in `PROJECT_CONTEXT_FOR_AI.md`; never persist redirected `script.googleusercontent.com` URLs or tokens.
- Keep course options API-derived. Do not restore the old large course alias dictionary or infer activities merely from missing course names.
- Update shared 4 px spacing and type tokens before adding isolated visual values where practical.
- Keep Traditional Chinese UI copy concise and understandable without programming knowledge.
- Preserve unrelated uncommitted work and never revert user changes without explicit instruction.

## Validation

- Scale validation to the change. For JavaScript edits, run `node --check` on affected files and `git diff --check`.
- Run `node tests/smoke-test.js` when changes could affect parsing, settings, generated code, or shared application behavior.
- For UI behavior changes, test the changed interaction and relevant accessibility state; report any visual dimensions left for user review.
- Do not commit or push unless explicitly requested.
