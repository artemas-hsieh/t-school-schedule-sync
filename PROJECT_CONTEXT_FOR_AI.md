# PROJECT_CONTEXT_FOR_AI

## Project Overview

This repository contains a static configurator for generating a Google Apps Script `Code.gs` that syncs T-SCHOOL schedule data from Google Sheets to Google Calendar.

The user-facing app is a static page:

- Root `index.html` redirects to `configurator/`.
- `configurator/index.html` defines the UI.
- `configurator/styles.css` defines layout and visual styling.
- `configurator/app.js` handles form state, course selection, validation, and generated-code updates.
- `configurator/code-template.js` generates the final Apps Script code copied by users.
- `configurator/gemini-code-1778375297203.js` provides course dictionaries and non-elective event dictionaries.

The project is deployed through GitHub Pages at:

```text
https://artemas-hsieh.github.io/t-school-schedule-sync/
```

## Current Product Behavior

The configurator lets users choose:

- Google Sheets URL and sheet name
- Google Calendar ID
- grade
- notification email and notification hour
- auto-sync hours
- selected courses
- whether to include non-elective / whole-school events

It then generates a complete Apps Script `Code.gs`. Users paste that into their own Google Apps Script project and run functions there.

Important generated Apps Script public functions include:

- `previewParsedEvents()`
- `syncMyScheduleToCalendar()`
- `syncMyScheduleToCalendarWithNotification()`
- `forceFullSyncMyScheduleToCalendar()`
- `setupAutoSyncTriggers()`
- `deleteAutoSyncTriggers()`
- `quickDeleteAllCalendarEvents()`
- `quickDeleteSyncedCalendarEvents()`
- `resetSyncState()`

Do not rename these casually. They are user-facing entry points in Apps Script.

## Recent Performance Work

The generated Apps Script was optimized for sync performance and Google Calendar quota safety.

Key changes already implemented:

- `buildSheetContext_(sheet)` reads the sheet data once per sync/preview and shares:
  - `range`
  - `values`
  - `displays`
  - `grade`
  - `weekRows`
  - `matchContext`
- `parseMyGradeEvents_()` and reschedule notice parsing consume the shared sheet context.
- `buildMergedRangeMap_()` uses the existing range instead of calling `sheet.getDataRange()` again.
- `buildMatchContext_()` precomputes normalized course/event candidates so every cell does not repeatedly scan and normalize dictionaries.
- `updateCalendarEvent_()` only calls Calendar setters when the field actually differs.
- Unchanged events use `syncSignature` to skip Calendar event API calls entirely.
- `forceFullSyncMyScheduleToCalendar()` bypasses the unchanged-event fast path when a user needs to repair manually edited/deleted calendar events.

This was done because a second sync shortly after the first can hit Google Calendar short-window throttling, even when it is not a daily quota limit.

## Calendar Sync Tradeoff

Normal sync now prioritizes quota safety:

- If the parsed schedule event has the same `syncSignature` as the stored state, the script reuses the stored `calendarEventId`.
- It does not call `calendar.getEventById()` for unchanged events.
- This avoids repeated Calendar event reads/writes and reduces throttling risk.

Tradeoff:

- Manual edits or deletions made directly in Google Calendar are not repaired by normal sync if the source schedule did not change.
- Users should run `forceFullSyncMyScheduleToCalendar()` when they want a repair pass against Calendar.

`syncSignature` intentionally excludes `description` because the description is derived from other fields. Including it would cause a future description-format-only change to trigger mass Calendar updates.

There is compatibility logic for:

- old state without `syncSignature`
- legacy signatures that included `description`

Preserve that compatibility unless there is a deliberate state migration.

## Security / Safety Notes

Generated Apps Script runs in the user's Google account, so destructive Calendar behavior must be guarded carefully.

Current safety decisions:

- `CONFIG.syncIdPrefix` is a real managed-event marker. New events include it in the Calendar event description.
- Calendar deletion helpers must only delete events that can be recognized as this tool's managed events.
- `quickDeleteSyncedCalendarEvents()` should delete by stored `SYNC_STATE` event IDs plus managed-event checks, not by scanning and deleting every future event in the target calendar.
- Legacy synced events may not have `CONFIG.syncIdPrefix`; keep the legacy fallback strict and require a source-cell marker that looks like an A1-style cell reference.
- `quickDeleteAllCalendarEvents()` is intentionally destructive and must remain behind an explicit config flag (`allowQuickDeleteAllCalendarEvents`).
- User-provided strings inserted into generated Apps Script must be serialized as data, not concatenated as code. Keep `JSON.stringify`-based string/object formatting and the U+2028/U+2029 escaping.
- Notification email is intentionally limited to a single plain address in both the frontend and generated Apps Script.
- Failed notification sending must not mask the original sync failure.
- The default Google Sheets URL is intentionally retained for user experience because the school Sheet is expected to be restricted to school accounts. Treat that access-control setting as an operational assumption.
- `configurator/index.html` includes a CSP meta tag. If new external assets are added, update the CSP deliberately rather than loosening it broadly.
- Reschedule notice date fallback handles cross-year notices by moving dates more than 30 days in the past to the next year.

## Current UI / UX Notes

Desktop layout intentionally uses independent panes:

- The left configurator pane scrolls independently.
- The right "Generated Apps Script / Code.gs" pane stays fixed within the desktop viewport and scrolls internally only if needed.
- Tablet and mobile layouts return to normal document scrolling.

Sync time selector behavior:

- The four preset sync hours are visually styled like the full 24-hour grid, not like pill chips, because they represent the same kind of selectable time.
- The full 24-hour selector is expanded via the small "自訂時段" control beside the "每日同步時段" label, matching the selected-courses expand/collapse pattern.

Usage steps copy:

- The right pane's "使用步驟" section is written for non-technical users who may not know Google Apps Script.
- Keep the steps concise and action-oriented, using `→` to connect actions and minimizing punctuation.
- `script.google.com` is a clickable external link that opens in a new tab.
- The inline `Code.gs` text in step 1 is a copy button wired to the same generated-code copy behavior as the main "複製" button.
- The primary setup flow intentionally skips `previewParsedEvents()` because checking Apps Script logs is too technical for most users. Users are guided to run `syncMyScheduleToCalendar()`, then compare the dedicated Google Calendar against the source Google Sheet.
- The visible flow currently ends at `setupAutoSyncTriggers()` and includes checking trigger setup within that same step rather than as a separate step.

## Deployment / Cache Notes

GitHub Pages can deploy a new HTML file while browsers still reuse cached CSS or JS. The configurator now avoids manual query-string maintenance by assigning `window.TSCHOOL_ASSET_VERSION = String(Date.now())` on each page load and loading these assets with that version:

- `styles.css`
- `gemini-code-1778375297203.js`
- `code-template.js`
- `app.js`

This trades a little browser cache efficiency for deployment correctness: after a page refresh, users should receive the latest generator logic without needing a manually updated version string.

## Validation Commands

Useful local checks:

```bash
node --check configurator/code-template.js
node --check configurator/app.js
git diff --check
```

For generated Apps Script syntax, use Node to load the dictionary and template, call `window.buildAppsScriptCode(...)`, and pass the result to `new Function(code)`.

When changing matching logic, compare old and new classification behavior for representative course/event titles.

## Important Constraints

- Keep the configurator static. There is no build step.
- Do not add dependencies unless there is a strong reason.
- Avoid changing the frontend workflow unless explicitly requested.
- Prefer correctness over maximum performance for calendar mutations.
- Be careful with Google Calendar quota behavior: repeated `getEventById()`, setters, creates, and deletes can all contribute to throttling.
- Do not mix unrelated UI wording changes with sync logic commits unless the user asks.

## Current Known Local State Note

The current working tree may contain uncommitted UI polish. Do not overwrite or revert user-made UI wording changes unless explicitly requested.
