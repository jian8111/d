---
name: swarm
description: Fan out N parallel Cursor subagents across disjoint repository slices, aggregate verified results, and produce one consolidated report. Use for /swarm, 'swarm this', parallel coverage, multi-edition audits, or competitive races.
disable-model-invocation: true
icon: git-branch
color: cyan
---
<!-- 署名: PRO1V(valerie...@gmail.com) -->

# Swarm

Orchestrate parallel Cursor subagents (`swarm-planner`, `swarm-worker`, `swarm-verifier`, `github-sync-reviewer`) cleanly without file conflicts.

## Start

Create a todolist with one entry per phase before launching subagents:

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the **done predicate** and exact output artifact or report required.
2. Choose the topology:
   - **Partition**: Split into disjoint writable slices (e.g., `pro1/`–`pro6/`, `assets/`, `.github/`, docs). No two concurrent workers may touch the same file (`index.html`, `README.md`, `PROGRESS.md` stay owned by the parent orchestrator).
   - **Race**: Spawn N workers on identical briefs and declare the selection rule (`first pass`, `rank all`, or `best-of`) up front.
   - **Mixed**: Partition by slice with multiple arms on high-risk slices.
3. Resolve the worker model from the `swarm workers` line in `.cursor/rules/30-pstack-models.mdc` (fallback: `inherit-parent`, omitting `model` so the parent chat model or Auto is used).
4. For git-level verification, include exact commit SHAs and verification commands in every worker brief.

## Phase B: Fan out

Spawn all N workers in parallel in a single turn (using `swarm-worker` subagents with isolated worktrees or cloud environments when workers write code, or `swarm-verifier` for parallel read-only audits).

Every worker brief must be self-contained:
- Goal and done predicate
- Exact writable paths (or `readonly: true` audit scope)
- Verification command(s) to run (e.g., `python3 .cursor/skills/swarm-verify/scripts/verify_repo.py`)
- Required return format: `PASS`, `ISSUES`, or `BLOCKED` with concrete file paths, line numbers, and command outputs.

If a worker drops out, continue with `N - 1` and record the gap explicitly.

## Phase C: Aggregate

1. Review every worker output. Reject any result missing requested verification evidence or SHAs and respawn that worker once.
2. Integrate verified changes on the parent branch, then run `python3 .cursor/skills/swarm-verify/scripts/verify_repo.py`.
3. Update `PROGRESS.md` (and `SIGNATURES.md` / `README.md` if applicable) with the active `PRO<N><L>(<email>)` signature per `AGENTS.md`, and sync `<50MB` changes to GitHub `main` and Google Drive `download`.

## Phase D: Report

Return one concise report containing:
- Result table (`Slice / Arm | Agent | Status | Evidence`)
- Consolidated issue one-liners (if any)
- Gaps or dropped workers (if any)
- Git commit SHA + Google Drive sync status
