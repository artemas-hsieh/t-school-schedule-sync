# PROJECT_CONTEXT_FOR_AI

## Project overview

This repository contains a static configurator that generates one user-owned
Google Apps Script `Code.gs`. The generated script reads T-SCHOOL schedule data
from the current API, syncs selected events to a dedicated Google Calendar, and
adds a graphical settings sidebar to a bound Google Sheet.

The public app remains build-free:

- Root `index.html` redirects to `configurator/`.
- `configurator/index.html` defines the installer UI.
- `configurator/styles.css` implements the project design system.
- `configurator/schedule-data.js` fetches and parses the live schedule API for
  installer course selection.
- `configurator/sidebar-template.js` contains the post-install HTML Service
  sidebar embedded into generated code.
- `configurator/code-template.js` generates the complete Apps Script backend.
- `configurator/app.js` coordinates installer state, validation, API loading,
  course selection, and code generation.

The project is deployed through GitHub Pages at:

```text
https://artemas-hsieh.github.io/t-school-schedule-sync/
```

## Runtime source

The stopped Google Sheet is not a runtime source. Both installer and generated
Apps Script use this stable deployment URL:

```text
https://script.google.com/macros/s/AKfycbxoTgVMnLevp0OPZQEFOYscUrXD1iMagasz2WPArXpkG-w6jRygVMS8kOwcywhnQW_i/exec
```

Grade query values are `一年級`, `二年級`, and `三年級`. Never persist redirected
`script.googleusercontent.com` URLs or `user_content_key` values.

## Product flow

1. The installer loads the selected grade from the API and derives a deduplicated
   course catalog.
2. The user chooses courses, activity inclusion, notification hours, description
   format, and reminder behavior.
3. The installer generates one `Code.gs`.
4. The user creates a blank Google Sheet, opens its bound Apps Script project,
   pastes the code, saves, and reloads the Sheet.
5. The `課表同步` custom menu opens the settings sidebar.
6. `儲存並首次同步` creates or selects a dedicated non-primary Calendar,
   performs the first sync, starts triggers only after success, and sends one
   setup-complete email.

Ordinary settings changes happen in the Sheet sidebar. No Web App deployment or
external settings account is required.

## Parsing and classification

- Course options are derived directly from API cells. Do not restore the old
  large alias/course dictionaries.
- Split parallel cell entries on the source separator line.
- Strip trailing bracketed locations from titles and keep them as event location.
- Normalize whitespace/punctuation and deduplicate exact normalized titles.
- `MANUAL_MERGE_EXCEPTIONS` is intentionally small and currently empty.
- Grade/school activities are identified only by explicit activity rules. Never
  infer that an unknown title is an activity merely because it is absent from a
  course dictionary.
- Explicit activities found in weekly note rows become all-day Calendar events;
  do not invent a time when the source gives none.
- Newly discovered source titles are included once as pending review. A rejected
  title is excluded and all future managed events with the same normalized title
  are removed on the next sync.

## Generated Apps Script surface

Keep these public functions stable unless a deliberate migration is planned:

- `syncMyScheduleToCalendar()`
- `syncMyScheduleToCalendarWithNotification()`
- `forceFullSyncMyScheduleToCalendar()`
- `setupAutoSyncTriggers()`
- `deleteAutoSyncTriggers()`
- `quickDeleteAllCalendarEvents()`
- `quickDeleteSyncedCalendarEvents()`
- `resetSyncState()`
- `previewParsedEvents()`

The bound Sheet also exposes `onOpen()`, `showSettingsSidebar()`, status/menu
actions, and private `google.script.run` handlers used by the sidebar.

## Calendar sync behavior

- Only today and future events are actively reconciled; past state is preserved.
- Exact unchanged source events skip Calendar API reads and writes.
- Normal sync preserves direct manual Calendar edits when the source signature is
  unchanged. Force repair reapplies source fields.
- Source update labels are not part of the sync signature, preventing harmless
  source refresh timestamps from causing mass Calendar writes.
- Clear same-title date/time changes are paired as updates within a 21-day window;
  ambiguous cases remain separate additions and cancellations.
- Suspicious mass deletion stops automatic/source sync. User-confirmed settings,
  setup, and repair operations may apply the previewed plan.
- Calendar switching first rebuilds events in the new dedicated Calendar, then
  removes managed events from the old Calendar.
- Legacy `SYNC_STATE` is migrated to chunked storage. Legacy managed-event fallback
  requires the managed marker, an A1-style source cell, and original-content text.

## Notifications and term transitions

- Source changes send one digest covering additions, cancellations, date/period/
  time/location/title changes. The digest supports compact, standard, detailed,
  and custom-variable formats.
- Failures notify immediately.
- No-change runs are silent except for the configured daily success-summary run.
- Event reminders default to none and are configurable.
- A new inferred term pauses triggers, preserves Calendar events, clears selected
  courses, sends one action-required email, and requires course reselection before
  writes resume.

## State and safety

- Settings, status, notice state, and managed-event state live in Script
  Properties. Large JSON values are chunked below per-property limits.
- One generated script supports one grade, one notification address, and one
  dedicated Calendar. The primary Calendar is rejected.
- Deletion helpers operate only on stored event IDs and verify managed markers.
- `quickDeleteAllCalendarEvents()` remains disabled behind
  `ALLOW_QUICK_DELETE_ALL = false`.
- User-provided values are serialized with `JSON.stringify` and U+2028/U+2029
  escaping. Do not concatenate user strings into executable code.
- The notification recipient is one plain email address. Mail failures must not
  mask the original sync failure.
- Keep the installer CSP narrow. Add explicit origins only when required.

## UI visual exploration phase

`UI_EXPLORATION_BRIEF.md` is the active source of truth for the next installer UI
concept. Read it before UI changes.

- Prior strict Material Design 3 visual rules are archived under
  `archive/visual-design-material3/` and are inactive during this concept pass.
- Prioritize aesthetic quality, innovation, T-SCHOOL brand distinctiveness,
  motion direction, and first-time-user focus before strict visual-system cleanup.
- Only visual constraints are relaxed. Keep interface copy concise, Traditional
  Chinese, action-oriented, and understandable without programming knowledge.
- Preserve the static architecture and all current installer behavior, validation,
  data loading, code generation, safety rules, and public Apps Script functions.
- `1Campus/` must never be used as a visual or interaction reference.
- The concept should use one vertical narrative flow, progressive disclosure,
  step progress, a compact code preview, and optional contextual cursor motion.
- Motion must not block the task. Keep touch and reduced-motion fallbacks usable.

## Deployment and cache

`configurator/index.html` assigns a fresh `TSCHOOL_ASSET_VERSION` on each load and
loads these files with that query value:

- `styles.css`
- `schedule-data.js`
- `sidebar-template.js`
- `code-template.js`
- `app.js`

This favors deployment correctness over browser cache efficiency.

## Validation

Run at minimum:

```bash
node --check configurator/schedule-data.js
node --check configurator/sidebar-template.js
node --check configurator/code-template.js
node --check configurator/app.js
git diff --check
```

Also load `sidebar-template.js` and `code-template.js` in Node, call
`window.buildAppsScriptCode(settings)`, and pass the result to `new Function()`.
This catches escaping errors that source-file syntax checks cannot detect.

For parser changes, test all three live grade payloads. For UI changes, verify real
course names at desktop, tablet, mobile, 320px, keyboard, and reduced-motion
conditions.

## Constraints

- Keep the public configurator static and dependency-free.
- Prefer Calendar quota safety and recoverability over maximum write speed.
- Preserve uncommitted user UI work and do not revert unrelated files.
- Manual code upgrades are acceptable, but stored user settings and managed-event
  state should migrate when practical.
