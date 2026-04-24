# Sprint 1.5.0 — Feature Mega Release

**Branch:** `sprint-1.5.0`
**Target Release:** `v1.5.0`
**Started:** 2026-04-24

## Scope (8 Tasks)

| # | Task | Priority | Effort | Notes |
|---|------|----------|--------|-------|
| **S1.1** | Card archival — auto-archive Done column | High | Low | Cron scans Done/Completed columns, moves cards to archive.md after N days |
| **S1.2** | Board templates — pre-built column sets | High | Low | POST /templates endpoint with preset: sprint, bug-triage, release, personal |
| **S1.3** | GitHub Issues sync (Kanban → GitHub) | High | Medium | Create/update/close GitHub issues from card metadata |
| **S1.4** | GitHub Issues reverse sync (GitHub → Kanban) | High | Medium | Issue state changes move cards between columns |
| **S1.5** | GitHub Project Boards sync | Medium | High | GraphQL API, column mapping, field updates |
| **S1.6** | Hermes CLI kanban commands | Medium | Medium | `hermes kanban list`, `hermes kanban move`, `hermes kanban create` |
| **S1.7** | Agent Hours (time/cost tracking per card) | Medium | Medium | `hours:` metadata, `GET /analytics/hours` endpoint, burn rate |
| **S1.8** | BRAT auto-update support | Medium | Low | versions.json, release workflow compatibility |

## Execution Order
1. S1.5, S1.6 (foundational settings from v1.4.0 sprint — already committed)
2. S1.1, S1.2 (finish current in-progress — quick wins, low effort)
3. S1.3, S1.4 (GitHub Issues sync — highest user value)
4. S1.5 (GitHub Project Boards — complex, do after Issues)
5. S1.7 (Agent Hours — analytics layer on top of existing card structure)
6. S1.6 (Hermes CLI commands — can work in parallel with S1.7)
7. S1.8 (BRAT — final polish)

## Deliverables
- `POST /cards/archive` — manual archive trigger
- `POST /templates` — create board from template
- `POST /sync/issues` — bidirectional GitHub Issues sync
- `POST /sync/projects` — bidirectional GitHub Projects sync
- `GET /analytics/hours` — agent hours report
- Hermes skill: `hermes-kanban-cli.md` — CLI commands documentation
- Updated API docs, wiki, and release notes

## Success Criteria
- Cards auto-archive from Done after configurable delay
- New boards can be created from templates
- GitHub Issues created from Kanban cards, closed issues move cards to Done
- Hermes can run `hermes kanban` commands to manage boards
- Agent hours tracked and reported per card per sprint

## Risks
| Risk | Mitigation |
|------|------------|
| GitHub API rate limits | Cache responses, batch operations |
| GraphQL complexity for Projects | Start with Issues (REST), add GraphQL for Projects if needed |
| CLI commands need Python wrapper | Create simple `hermes kanban` skill that uses file tools or REST API |
| Agent hours parsing conflicts with existing card format | Use explicit `hours: N.NN` metadata syntax, parse safely |
