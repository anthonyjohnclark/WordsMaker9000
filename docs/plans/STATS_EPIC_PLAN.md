# Epic: Stats and Writing Process History

## Summary

Build a local writing-process record that supports project research, statistics, historical comparisons, and sharing.

Deliver two experiences:

- **Global Stats on Home:** cached summaries across projects, refreshed on a schedule.
- **Project Stats:** a dedicated title-bar destination with activity, vocabulary, file rankings, and historical drafts and trees.

Each phase is one branch. Each numbered slice is one commit, including its relevant tests. Complete and merge phases in order, preserving the slice commits. Begin from the completed publishing-workspace changes already underway; keep those changes separate from this epic.

## Agreed behavior and architecture

- Automatically record every project, with per-project pause, resume, and disable controls.
- Retain detailed history, including deleted text, until explicitly deleted. Compression must preserve recorded events.
- Project deletion removes the project and its live history after explicit confirmation. Existing backup copies and previously exported packages remain independently managed; explain this in the deletion dialog.
- Recording failures must not prevent otherwise successful manuscript saves. Show a persistent warning, retry, and identify missing coverage.
- Count project time while the project is open and the window is not minimized; exclude sleep and screen lock. Changing application focus alone does not stop time.
- Historical drafts and trees support browsing, comparison, copying, and export. Dedicated restoration from Stats is deferred.
- Refresh Global Stats hourly by default, with configurable intervals and manual refresh. Use cached results immediately and perform overdue catch-up in the background.
- Deliver self-contained HTML reports, CSV statistics, and optional evidence ZIPs with a verification tool.
- Describe the evidence as recorded writing history and integrity checks. Do not claim certification of human authorship or absence of AI.

**Storage and interfaces:** Add a permanent `projectId`; retain existing file UUIDs. Rust owns coordinated persistent project mutations and a background history recorder. Store versioned SQLite history databases and compressed historical content separately from manuscripts, keyed by project ID. Store Global results separately as rebuildable caches, preserving development/production separation.

Introduce typed interfaces for event ingestion and acknowledgment, history flushing, recording status, project summaries, paginated history queries, Global refresh, report export, and package verification. Distinguish editor changes, saved checkpoints, sessions, and coverage gaps.

## Phases and commit slices

### Phase 1 — Establish identity and reliable persistence

**Branch:** `codex/stats-01-foundation`

| Slice | Commit purpose |
|---|---|
| **1.1 — Permanent identity** | Add project IDs, validate/backfill node UUIDs, and migrate existing metadata without counting migration as writing activity. Preserve names and current project routes. |
| **1.2 — History storage** | Create versioned project databases, compressed content storage, and the Global catalog. Establish event IDs, ordering, revisions, and hash-linked records from the outset. |
| **1.3 — Document persistence** | Route document saves through coordinated Rust commands. Preserve live-buffer flushing, save ordering, error reporting, and protection against stale completions. |
| **1.4 — Structural persistence** | Coordinate create, rename, move, reorder, delete, and bulk replacement through the same mutation boundary. Preserve recoverable state across interrupted operations. |
| **1.5 — Project lifecycle** | Make backup and restore include consistent history snapshots. Restore appends history rather than rolling it back. Delete live project/history together and invalidate affected Global caches. |

**Exit gate:** Existing projects migrate safely; interrupted saves and structural changes recover predictably; publishing still receives the correct document/tree snapshot.

### Phase 2 — Record edits, sessions, and coverage

**Branch:** `codex/stats-02-recording`

| Slice | Commit purpose |
|---|---|
| **2.1 — Editor event capture** | Capture ordered Quill changes, including formatting and embeds. Preserve individual changes inside short transport batches; exclude document loading from edit counts. |
| **2.2 — Durable delivery** | Add a bounded queue, acknowledgments, retry/deduplication, and explicit flush boundaries for saves, navigation, backup, publishing, and normal shutdown. |
| **2.3 — Historical checkpoints** | Record the initial baseline and periodic full checkpoints. Preserve referenced asset versions and label paste, bulk replacement, undo/redo, and application transformations where observable; retain “unknown” where attribution is unavailable. |
| **2.4 — Working time** | Record project/file sessions using native window and system state. Checkpoint elapsed time and handle minimization, sleep, lock, switching projects, and crashes without double counting. |
| **2.5 — Recording controls** | Add pause/resume/disable, storage usage, and explicit history clearing. Surface recording failures and coverage gaps; resume from a new baseline without inventing intervening edits. |

**Exit gate:** A recorded writing session reconstructs correctly through acknowledged changes. Retries do not duplicate activity, and recording failures leave manuscript editing usable.

### Phase 3 — Calculate project statistics

**Branch:** `codex/stats-03-project-calculations`

| Slice | Commit purpose |
|---|---|
| **3.1 — Text normalization** | Establish shared manuscript text extraction and word counting, excluding markup and implementation metadata. Define treatment of footnotes, captions, punctuation, and common-word filters consistently. |
| **3.2 — Activity summaries** | Calculate working time, session counts/durations, writing days, words added/removed, net growth, and manuscript length over time. Keep formatting activity separate from text changes. |
| **3.3 — Vocabulary and file rankings** | Maintain full word-frequency maps, repeated phrases, and file rankings by time, editing sessions, and amount of text changed. Include revision density relative to file length. |
| **3.4 — Incremental calculation** | Update only affected files and summaries. Add date filtering, calculation versions, freshness/coverage metadata, and rebuilding derived statistics from retained history. |

**Exit gate:** Incremental results match a full rebuild, and autosaves, retries, document loads, and metadata migrations do not inflate activity.

### Phase 4 — Deliver Project Stats and historical browsing

**Branch:** `codex/stats-04-project-workspace`

| Slice | Commit purpose |
|---|---|
| **4.1 — Stats workspace** | Add `/projects/:projectName/stats` and its title-bar button. Preserve editor content, selection, scroll, and undo state when switching project workspaces. |
| **4.2 — Overview and activity** | Add summary cards, growth charts, activity heatmaps, time allocation, and sortable file rankings with date/file filters. |
| **4.3 — Words** | Add a word cloud, frequency table, repeated phrases, and links to matching manuscript passages. Use deterministic layouts and existing theme variables. |
| **4.4 — History explorer** | Add a paginated event timeline, historical draft/tree views, revision comparisons, named checkpoints, copying, and publication milestones linked to their recorded source checkpoints. |

**Exit gate:** Charts lead to supporting files or revisions; historical content is read-only; keyboard navigation and accessible table alternatives work across themes and window sizes.

### Phase 5 — Deliver scheduled Global Stats on Home

**Branch:** `codex/stats-05-global-dashboard`

| Slice | Commit purpose |
|---|---|
| **5.1 — Persistent schedule** | Add hourly/daily refresh settings, persisted scheduling state, a single background refresh job, overdue catch-up, and manual refresh. No operating-system background service. |
| **5.2 — Global aggregation** | Combine changed-project summaries and complete frequency maps. Calculate correct totals and weighted averages; retain coverage and freshness information. |
| **5.3 — Home dashboard** | Add total time, recent activity, top projects, growth/activity charts, and a Global word cloud. Show cached results immediately with “Updated…” and refresh status. |

**Exit gate:** Reopening the app or visiting Home does not trigger a full manuscript scan. Unchanged projects are skipped, failed refreshes preserve the last valid cache, and deleted project data is not displayed from stale caches.

### Phase 6 — Share reports and verifiable history packages

**Branch:** `codex/stats-06-sharing`

| Slice | Commit purpose |
|---|---|
| **6.1 — Export selection** | Add date/file selection and a review step for including manuscript text, deleted passages, checkpoints, and available publication artifacts. Default to a summary report without full manuscript text. |
| **6.2 — HTML and CSV** | Generate self-contained, offline HTML reports with charts and tables, plus CSV exports of statistics. Include measurement definitions, freshness, and recording coverage. |
| **6.3 — Evidence packages** | Export selected events, checkpoints, historical assets, artifact checksums, and a versioned manifest in a ZIP. Explicitly identify omitted content and unavailable artifacts. |
| **6.4 — Independent verification** | Supply a standalone local verification tool that checks package contents, hashes, event ordering, and checkpoint reconstruction. Report integrity results separately from authorship claims. |

**Exit gate:** Reports open without WordsMaker9000 or internet access. Verification detects altered or missing required content; intentionally selective packages clearly declare their limits.

### Phase 7 — Qualify and release

**Branch:** `codex/stats-07-release`

| Slice | Commit purpose |
|---|---|
| **7.1 — Recovery qualification** | Exercise forced termination, failed writes, corrupted history, duplicate delivery, external file changes, legacy backups, and backup restoration. Verify that gaps and uncertainty remain visible. |
| **7.2 — Performance qualification** | Exercise long manuscripts, large event histories, extended typing sessions, history pagination, and scheduled aggregation. Measure input responsiveness, queue behavior, memory use, and storage growth. |
| **7.3 — Release integration** | Complete native/UI and publishing regression checks, user documentation, migration notes, and the release checklist. Enable automatic recording for the completed feature. |

**Exit gate:** All epic acceptance checks pass, with automated results and native/manual evidence reported separately.

## Test plan and completion criteria

Tests belong in the slice introducing the behavior; the final phase adds integrated qualification.

- **Identity and compatibility:** existing/new projects, encoded names, rename, duplicate identities, development data separation, and old backups.
- **History accuracy:** typing, deletion, paste, undo/redo, formatting, images, footnotes, bulk replacement, nested tree changes, and checkpoint reconstruction.
- **Durability:** duplicate/out-of-order batches, interrupted writes, bounded queue exhaustion, normal close, forced termination, and recording failure while manuscript saving succeeds.
- **Time accounting:** minimize/restore, focus changes, sleep/wake, lock/unlock, route changes, project switches, and crash recovery.
- **Calculations:** incremental versus full rebuild, repeated saves, common-word filtering, deleted files, historical date ranges, incomplete coverage, and Global aggregation.
- **UI:** editor preservation, Back/Forward navigation, direct Stats entry, responsive charts, keyboard access, themes, loading, errors, and empty states.
- **Evidence and deletion:** selective exports, missing/modified package content, historical assets after replacement, full live-history deletion, and invalidation of derived caches.
- **Regression gates:** Jest, TypeScript/Vite build, Rust tests, and the existing Publish QA matrix where source persistence or artifact contracts change. Native Quill, window lifecycle, and reader checks remain explicit manual gates.

Existing projects begin with a dated baseline. Earlier working time and edit counts are unknown; this epic does not infer them from modification dates. Existing publication artifacts can be indexed as milestones without manufacturing their preceding edit histories.

External timestamp services, PDF process reports, dedicated historical restoration controls, multi-device history merging, AI detection, and passage-survival analysis remain outside this epic.
