# Sprint 1.4.0 — GitHub Integration + BRAT Auto-Update

**Branch:** `sprint-1.4.0`  
**Target Release:** `v1.4.0`  
**Started:** 2026-04-24  

## Scope

| # | Task | Priority | Effort | Notes |
|---|------|----------|--------|-------|
| S1.1 | GitHub Issues sync (Kanban → GitHub) | High | Medium | Create/update/close issues from card metadata |
| S1.2 | GitHub Issues reverse sync (GitHub → Kanban) | High | Medium | Issue state maps to card columns |
| S1.3 | GitHub Project Boards sync (Kanban → GitHub) | High | High | GraphQL API, column mapping, field updates |
| S1.4 | GitHub Project Boards reverse sync | High | High | Project item moves update card columns |
| S1.5 | GitHub settings tab | Medium | Low | Token input, repo selection, sync direction |
| S1.6 | BRAT auto-update support | High | Medium | BRAT registration, manifest compatibility, update command |
| S1.7 | API docs + wiki update | Low | Low | Document new endpoints |

## Deliverables
- New `/sync/issues` endpoint (bidirectional)
- New `/sync/projects` endpoint (bidirectional)
- New settings tab for GitHub configuration
- BRAT auto-update support
- Updated documentation

## Success Criteria
- Can create a GitHub Issue from a Kanban card via API
- Can move a Kanban card when GitHub Issue is closed
- Can sync a Kanban board to a GitHub Project board
- Can trigger BRAT update check from within Obsidian
- All endpoints documented in wiki

## Risks
| Risk | Mitigation |
|------|------------|
| GitHub API rate limits | Use conditional requests, cache responses |
| GraphQL complexity | Start with REST API, add GraphQL for Projects later |
| BRAT submission delays | Manual install path still works |
