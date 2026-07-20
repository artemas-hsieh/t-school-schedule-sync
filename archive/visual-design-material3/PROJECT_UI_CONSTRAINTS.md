# Archived project UI constraints

以下內容原本位於 `PROJECT_CONTEXT_FOR_AI.md`，於 2026-07-20 為自由視覺探索階段封存。

## UI and design system

`DESIGN_SYSTEM.md` is the UI/UX source of truth.

- Read it before UI changes and reuse its tokens/components first.
- Material Design 3 provides semantic roles and interaction behavior, implemented
  with native HTML/CSS/JavaScript; do not add a frontend framework or build step.
- `1Campus/` is data/reverse-engineering evidence only and must never be used as a
  visual or interaction reference.
- The installer is a task-focused control surface, not a marketing page.
- Desktop uses independent settings/output panes. Tablet/mobile return to normal
  document scrolling, and 320px width must remain usable.
- Support keyboard operation, visible focus, meaningful empty/error/loading states,
  and `prefers-reduced-motion`.
- The visual signature is the timetable/sync rail. Motion must communicate state
  and remain subtle.
