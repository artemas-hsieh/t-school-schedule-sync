# T-SCHOOL Schedule Sync MVP Plan

## Product decision

The next MVP remains user-owned. The public configurator generates one `Code.gs`
file that users paste into an Apps Script project bound to their own blank Google
Sheet, used as the "課表同步控制台".

After installation, users operate the tool through a custom spreadsheet menu and
an HTML Service sidebar. They do not need to reopen the Apps Script editor for
ordinary settings changes.

## Source of truth

- Schedule API deployment:
  `https://script.google.com/macros/s/AKfycbxoTgVMnLevp0OPZQEFOYscUrXD1iMagasz2WPArXpkG-w6jRygVMS8kOwcywhnQW_i/exec`
- Grade query values: `一年級`, `二年級`, `三年級`.
- Never persist a redirected `script.googleusercontent.com` URL or
  `user_content_key`.
- The stopped Google Sheet is no longer a runtime source.
- Source failures, malformed data, ambiguous years, and suspicious mass deletion
  stop the sync without deleting calendar events.

## Data model

### Settings

Versioned settings are stored in Script Properties and contain:

- one grade, dedicated calendar, and notification email;
- selected course titles;
- whether grade/school activities are included;
- excluded titles and pending newly discovered titles;
- automatic sync hours and daily success-summary hour;
- calendar description preset/custom template;
- event reminder mode and lead time;
- active semester key and known source titles;
- paused/active state.

### Runtime state

- Managed Calendar event IDs and event signatures.
- Last successful source snapshot for change detection.
- Last sync status and source update time.
- One-time notification state for new terms and newly discovered titles.

Large JSON state is chunked across Properties because a single property value is
size-limited.

## Parsing rules

- Derive course options directly from API cells.
- Split parallel entries on the source separator line.
- Remove trailing bracketed location information from titles and retain it as
  event location.
- Normalize whitespace and punctuation, then deduplicate exact titles.
- Keep only a small manual merge-exception map; it may start empty.
- Classify grade/school activities through explicit activity rules. Never infer
  activity status merely because a title is absent from a course dictionary.
- Explicitly classified activities in weekly note rows are synced as all-day
  events; the app does not invent a clock time when the source provides none.
- A previously unseen runtime title is included once as pending review. Rejecting
  it removes all future managed events with the same normalized title on the next
  sync.

## Sync behavior

- First sync creates a dedicated calendar when none is selected.
- Only today and future events are managed; past events remain untouched.
- Exact unchanged events make no Calendar API calls.
- Clear one-to-one changes are reported as moves or edits. Ambiguous changes are
  reported as separate additions and cancellations.
- Source changes generate one digest per run. No-change runs stay silent except
  for the configured daily success summary. Failures notify immediately.
- Change digests provide compact, standard, detailed, and custom-variable formats.
- Manual Calendar edits are preserved during normal unchanged syncs; a separate
  repair action re-applies source data.
- Event reminders default to none but remain configurable.

## Semester transition

The API has no explicit school-year or semester field. The app infers a term key
from the grade and schedule date range.

When a new term is detected:

1. Pause automatic writes.
2. Preserve existing Calendar events.
3. Clear course selections.
4. Send one review-required notification.
5. Resume only after the user selects courses for the new term.

## Post-deployment control surface

The bound spreadsheet provides a `課表同步` menu with:

- 開啟設定
- 立即同步
- 暫停／恢復自動同步
- 查看同步狀態
- 強制修復
- 移除受管理事件

The sidebar supports settings, source health, live course options, Calendar
selection/creation, reminders, notification formats, save, save-and-sync, and
status feedback. Calendar-changing actions require confirmation.

## Design direction

The functional MVP is complete. The next installer concept follows
`UI_EXPLORATION_BRIEF.md`: one vertical narrative flow, progressive disclosure,
step progress, a compact code preview, and optional contextual cursor motion.
Static architecture, validation, data loading, code generation, accessibility
fallbacks, safety rules, and the Apps Script public surface remain unchanged.

The previous strict Material Design 3 rules are archived under
`archive/visual-design-material3/`. They are reference material for a later
accessibility and system-consistency pass, not the active visual source of truth.

## Delivery phases

1. API parser and dynamic course catalog.
2. Versioned settings and generated Apps Script backend.
3. Calendar diff, notification, safety, and trigger behavior.
4. Spreadsheet menu and settings sidebar.
5. Configurator and documentation migration.
6. Parser fixtures, generated-code syntax tests, accessibility checks, and
   desktop/mobile screenshot verification.
