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

## Deployment / Cache Notes

GitHub Pages can deploy a new HTML file while browsers still reuse cached CSS or JS. When changing frontend-loaded assets, update the query string in `configurator/index.html`.

Current examples:

```html
<link rel="stylesheet" href="styles.css?v=20260510-preview-height">
<script src="code-template.js?v=20260510-sync-performance-quota-v2"></script>
```

Use a meaningful version string when changing:

- `styles.css`
- `app.js`
- `code-template.js`
- dictionary files

This avoids the situation where GitHub Pages says "Last deployed" but the browser still runs an old script or stylesheet.

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

At the time this context file was created, `configurator/index.html` had unrelated uncommitted wording changes made outside the sync-performance work. Do not overwrite or revert those unless explicitly requested.
