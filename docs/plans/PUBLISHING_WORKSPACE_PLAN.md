# Publishing Workspace Implementation Plan

## Summary

Replace the publishing modal with a routed workspace beneath the existing title bar. Include **Publish** and **Artifact History** tabs, preserve editor state when switching workspaces, and keep publishing jobs running during navigation.

## Routes and Presentation

- Keep the existing application shell and title bar mounted across navigation. Use `/projects/:projectName` for Editor and `/projects/:projectName/publish` for Publish.
- Use `?tab=artifacts` for Artifact History; absence of the parameter selects Publish. Tab changes create ordinary history entries so Back/Forward works naturally.
- Refactor the project route into a shared project layout containing `ProjectProvider`. Keep that provider mounted when switching between Editor and Publish; key it by project identity to prevent state leaking between projects.
- Keep the logo, Home, Back/Forward, project name, and window controls visible on Publish. Hide editor search, word count, backup status, and editor metadata.
- Replace the title-bar **🚀 Publish** control with **Editor**, using `FiEdit3`. Editor navigates explicitly to the project's editor route rather than relying on the previous history entry. It remains available during loading, errors, and running jobs.
- Give Publish a compact tab bar and a scrolling content area filling the space below the title bar. Reuse current theme variables, field groupings, and responsive layouts; remove modal sizing and backdrop behavior.
- Keep the in-page **Publish PDF/DOCX/EPUB** action. Replace modal-only Cancel/Done controls with page-appropriate actions: the completed result offers **New Publish**, **Artifact History**, and existing preview/open actions.
- Change Home's existing Artifact History shortcut to open the new history tab.

## Loading, Saving, and Editor Preservation

- Navigate immediately to the Publish route and display the existing centered three-dot `Loader` in the page body. The title bar remains interactive.
- During preparation, wait for project initialization and any active document load, flush the active document, and persist pending tree and project metadata. Only then request data for the selected tab.
- Keep the preparation loader visible for **at least 1,000 ms**, including fast failures. Run that timer alongside preparation; do not add a separate delay to each stage. Switching tabs does not repeat the entry delay.
- Make `flushProjectSnapshot(): Promise<void>` a reliable completion boundary: resolve only after document and metadata writes finish, and reject on either failure. Consolidate competing metadata-save effects behind the existing queue so an older delayed write cannot overwrite the final snapshot.
- Update the live buffer reference synchronously when editor content changes. Associate save completions with document identity and revision so a late completion cannot replace newer edits or another document's content.
- Keep the editor instance mounted but hidden and inactive while Publish is visible. Preserve the selected file, cursor/selection, scroll position, and undo history.
- Disable inactive editor keyboard, wheel, dictionary, find, and autosave handlers. Close editor search overlays and restore normal fullscreen/modal-container state when leaving Editor.
- On preparation failure, stop loading and show an inline error with **Retry** and **Editor** actions. Retain the buffer and pending state; do not open a usable publishing form or start an export after a failed save.
- Deduplicate preparation under React StrictMode. Ignore stale setup results after navigation or project changes; already-started writes may finish without altering a newer editor revision.

## Publishing State, Jobs, and Artifact History

- Extract the modal into a page, focused form sections, a typed publishing client, and publishing state/job hooks. Separate native calls and event subscriptions from presentation.
- Introduce app-level publishing state, keyed by canonical project identity, containing `PublishingDraft` and `PublishingJob` records. This state survives routed page unmounts.
- Retain unsaved form choices throughout the app session. Refresh the source outline when returning from Editor without overwriting the draft. Remove overrides for deleted nodes, clear selections whose target disappeared, and require outline reconfirmation after structural or project-type changes.
- Track jobs by export ID, retaining their request, progress, cancellation state, result, and diagnostics. Register progress listeners before invoking Rust; page unmounting must not cancel jobs or discard their results.
- Allow one active publish or regeneration per project. Keep navigation available, and restore progress or the completed result when the user returns. Cancellation occurs only through **Cancel Publish**.
- Use the same save boundary for publishing and regeneration. Hold a brief editing guard until Rust has captured the source snapshot; release it on the subsequent compile phase or a terminal result. Ordinary writing can then resume during rendering.
- While a project has an active job, disable project deletion/restoration/type changes and replacement/removal of assets that the renderer may still read.
- Move existing history behavior into the Artifact History tab: Preview, Reveal, Copy, Regenerate, Delete, diagnostics, and legacy-artifact handling. Refresh history after successful publishing, regeneration, or deletion.
- Load history independently of publishing setup after the save boundary. A malformed manuscript that prevents compilation must not prevent viewing existing artifacts.
- Store background job failures for display on return rather than opening an unrelated error modal over Editor or Home.
- Reuse existing Rust commands, progress events, schemas, output profiles, and artifact formats. No backend API or storage migration is planned.

## Verification and Defaults

- Add Jest tests for preparation ordering, minimum loader duration on success/failure, rejected saves preventing setup/export, stale completions, and duplicate initialization.
- Add DOM-backed React integration tests for route transitions, title-bar visibility, both tabs, Home's history shortcut, direct publishing entry, encoded project names, and Back/Forward behavior. Mock Tauri and Quill; retain the existing Node environment for utility tests.
- Test draft retention, refreshed outlines, background publishing/regeneration, progress isolation between projects, cancellation races, and history refresh.
- Manually verify native Editor → Publish → Editor transitions preserve actual Quill content, cursor, scroll, and undo history. Confirm editor shortcuts remain inactive on Publish and errors allow recovery without losing text.
- Run `npm test -- --runInBand` and `npm run build`. Report the known lint dependency issue separately. Run native tests and artifact QA if implementation changes Rust behavior or serialized publishing contracts.
- Scope editor-instance preservation to switching workspaces within the same project. Publishing drafts and jobs persist for the current app session; continuation after app shutdown is outside this change.
