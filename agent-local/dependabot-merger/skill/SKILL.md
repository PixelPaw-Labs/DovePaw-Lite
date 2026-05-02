---
name: dependabot-merger
description: Review, risk-assess, and merge Dependabot PRs across configured repos. Prefixes every PR title with the provided Jira ticket and merges safe PRs automatically. Reports blockers with risk reasoning and confidence scores for anything that can't be merged. Use when the user says "process dependabot PRs", "merge dependabot", "triage dependabot PRs", "review dependency updates", "handle dependabot", or asks to automate dependency PR merging. Also triggers when asked to check if any dependency PRs are safe to merge.
model: sonnet
allowed-tools: Read, Bash, Grep, Glob, Agent
argument-hint: 'ticket="PROJ-123" [optional: specific repo name or dry-run]'
---

# Dependabot Merger

Review Dependabot PRs across configured repos, assess merge safety, prefix titles with the Jira ticket, and merge or report blockers.

## Inputs

Raw arguments: $ARGUMENTS

Infer from the full prompt context and $ARGUMENTS:

- REPOS: local repo paths — infer from any paths mentioned in the context, or fall back to `REPO_LIST` env var
- REPO_FILTER: optional repo name to scope to one repo
- DRY_RUN: true if "dry-run" or "dry run" appears anywhere in the context
- JIRA_TICKET: parse `ticket="<key>"` from $ARGUMENTS (e.g. `ticket="EC-1007"`)

Derive the GitHub slug for each repo via:

```bash
git -C <repo_path> remote get-url origin \
  | sed 's|.*github.com[:/]||;s|\.git$||'
```

If no repos can be resolved from either source, stop and tell the user.

## Phase 1 — Collect open Dependabot PRs

For each repo (apply REPO_FILTER if set), derive the GitHub slug then list open Dependabot PRs:

```bash
gh pr list --repo <owner/repo> \
  --author "app/dependabot" \
  --state open \
  --json number,title,headRefName,mergeable,statusCheckRollup,labels,body,url \
  --limit 100
```

`statusCheckRollup` contains all CI check results — no separate check call is needed. Each entry is either a `CheckRun` (has `conclusion`: FAILURE/SUCCESS/SKIPPED) or a `StatusContext` (has `state`: SUCCESS/FAILURE/PENDING).

## Phase 2 — Risk assessment per PR

Assess each PR on:

**Semver level** — extracted from title or body:

- `patch` → Low risk
- `minor` → Medium risk
- `major` → High risk

**CI status:**

- All checks passing → Safe
- Any failing check → Blocker (do not merge)
- Pending (SOX check only) → Ignore — SOX checks are not required for merge
- Pending (non-SOX check) → Do not assign verdict yet; poll in Phase 4 (up to 30 min) for it to resolve

**Dependency type** — from labels or title:

- `devDependencies` / test-only → lower risk
- Runtime deps → higher risk
- `security` label → elevated priority

**Breaking change signals** — scan PR body for:

- "BREAKING CHANGE", "breaking", "removed", "deprecated"
- Major ecosystem bumps with known breaking patterns

**Merge conflict detection** — check `mergeable` field:

- `CONFLICTING` → verdict **CONFLICT** (merge conflict; auto-rebase will be requested in Phase 4b)
- `UNKNOWN` → treat as pending; re-check after CI polling in Phase 4
- `MERGEABLE` → proceed with normal verdict

**Verdict:**

- **MERGE** — patch, CI passing, no breaking signals
- **REVIEW** — minor with passing CI; or major devDep with passing CI → see Phase 2b for upgrade path
- **CONFLICT** — `mergeable` is `CONFLICTING`; skip further CI/changelog checks
- **BLOCK** — failing CI, major runtime bump, breaking change signals

## Phase 2b — REVIEW upgrade investigation

For each PR with a tentative REVIEW verdict, attempt to upgrade it to MERGE by investigating two sources:

**1. Changelog / release notes** — fetch from the PR body URL or GitHub release:

```bash
gh api repos/<owner/repo>/releases --jq '.[] | select(.tag_name | contains("<new version>")) | .body'
```

If no GitHub release, check the PR body for a changelog link and fetch it. Look for:

- No `BREAKING CHANGE`, `removed`, `deprecated`, or API-incompatible entries
- Changes are additive (new features, bug fixes, perf improvements only)

**2. Codebase usage** — investigate how the changed package is actually used in the repo. Determine the appropriate search strategy based on the package ecosystem, project structure, and what changed. Cross-reference findings against all changelog entries — not just breaking changes. Any change (bug fix, behaviour tweak, config rename, dropped default) could affect the codebase if it relied on the old behaviour. The goal is to identify any changelog entry that touches something the codebase actually uses.

**Upgrade to MERGE if:**

- Changelog contains no breaking changes, AND
- Any changed APIs are not used in the codebase (or are only used in a compatible way)

**Keep as REVIEW if:**

- Changelog is unavailable or ambiguous
- Changed APIs are present in the codebase and compatibility is unclear
- Breaking changes are present in the changelog but none affect code found in this codebase — do not auto-merge
- Any PR comment is authored by `chatgpt-codex-connector` — it has flagged the PR for human attention

**Downgrade to BLOCK if:**

- Changelog explicitly lists breaking changes that affect code found in the codebase
- Non-SOX CI checks are still pending after 30 minutes of polling in Phase 4

Document the investigation outcome (changelog summary + usage grep result) in the report.

## Phase 3 — Update PR titles

For every PR (regardless of verdict), if the title does not already start with `[<JIRA_TICKET>]` (skip if DRY_RUN):

```bash
gh pr edit <number> --repo <owner/repo> --title "[<JIRA_TICKET>] <original title>"
```

After all title updates are done, use `/loop 60s "check if the merge button is re-enabled by re-fetching the PR mergeable field"` to wait 60 seconds before proceeding. Updating a title triggers a GitHub Actions re-run which temporarily disables the merge button — the wait ensures checks have re-queued and the merge button is clickable again.

## Phase 4 — Merge safe PRs

For each PR with verdict **MERGE** (skip if DRY_RUN):

0. If any non-SOX CI check is still pending, use `/loop 2m "re-fetch statusCheckRollup for PR <number> and check if all non-SOX checks have passed"` to poll every 2 minutes for up to 30 minutes. If all non-SOX checks pass within the window, proceed.

   If any non-SOX check **fails** (not just pending), post `@dependabot rebase` (skip if already posted — check existing comments first), then use `/loop 8m "re-fetch statusCheckRollup for PR <number> after rebase and check if all non-SOX checks now pass"` to wait 8 minutes and re-poll once. The rebase rebases the PR onto the latest main, which re-triggers CI and may clear transient failures. If checks pass after the rebase re-run, proceed. If they still fail, downgrade to BLOCK and skip this PR.

   If the 30-minute window expires with checks still pending (never failed, just stuck), downgrade to BLOCK and skip this PR.

1. Approve:

   ```bash
   gh pr review <number> --repo <owner/repo> --approve
   ```

2. Merge:

   ```bash
   gh pr merge <number> --repo <owner/repo> --squash --auto
   ```

   Fall back to `--merge` if `--auto` is unavailable.

3. Before commenting, fetch existing comments and check if any already conveys the same merge rationale (semver level, CI status, risk assessment). If a semantically equivalent comment exists, skip. Otherwise add:
   ```bash
   gh pr view <number> --repo <owner/repo> --json comments
   gh pr comment <number> --repo <owner/repo> \
     --body "Merged by dependabot-merger. <reason: summarise the risk assessment — semver level, CI status, dependency type, and any notable signals from the changelog>"
   ```

Record merge outcome for the report.

## Phase 4b — Request rebase for conflicting PRs

For each PR with verdict **CONFLICT** (skip if DRY_RUN):

1. Fetch existing comments and check if any already contains `@dependabot rebase`:

   ```bash
   gh pr view <number> --repo <owner/repo> --json comments \
     | jq '[.comments[] | select(.body | contains("@dependabot rebase"))] | length'
   ```

2. If no such comment exists, post one:

   ```bash
   gh pr comment <number> --repo <owner/repo> --body "@dependabot rebase"
   ```

3. After posting (or if a rebase comment was already present), use `/loop 8m "re-fetch statusCheckRollup and mergeable for PR <number> after rebase"` to wait 8 minutes, then re-fetch the PR's `statusCheckRollup` and `mergeable` field. If `mergeable` is now `MERGEABLE` and all non-SOX CI checks pass, upgrade verdict to **MERGE** and process this PR through Phase 4 immediately.

Record whether the rebase comment was posted or skipped (already present), and whether the PR was subsequently merged, for the report.

## Phase 5 — Report

```
# Dependabot Merger Report — <DATE>
<DRY RUN — no changes were made>   (if DRY_RUN)

## Summary
- Repos scanned: <N>  |  PRs found: <total>
- Merged: <N>  |  Needs review: <N>  |  Blocked: <N>  |  Rebase requested: <N>

## Merged ✅
| Repo | PR | Package | Bump |
|------|----|---------|------|
| api-service | [#123](https://github.com/owner/api-service/pull/123) | rails | 7.1.2 → 7.1.3 |

## Needs Review ⚠️
| Repo | PR | Package | Bump | Risk Reason | Confidence |
|------|----|---------|------|-------------|------------|
| web-frontend | [#45](https://github.com/owner/web-frontend/pull/45) | react | 18.2 → 18.3 | Minor runtime bump | 70% |

## Blocked 🚫
| Repo | PR | Package | Bump | Blocker | Confidence |
|------|----|---------|------|---------|------------|
| api-service | [#67](https://github.com/owner/api-service/pull/67) | webpack | 4 → 5 | Major + CI failing + breaking config | 95% |

## Rebase Requested 🔄
For each PR with a merge conflict, include a one-liner explaining which PRs landed first and caused the conflict (infer from the PR title/body or related PR numbers if available):

| Repo | PR | Package | Bump | Reason | Rebase Comment |
|------|----|---------|------|--------|----------------|
| web-frontend | [#12](https://github.com/owner/web-frontend/pull/12) | react | 19.2.4 → 19.2.5 | Merge conflict — package-lock.json out of sync because react-dom (#13) and next (#11) landed first | Posted |

```

**Confidence scoring:**

- 90–100%: Clear CI failure or explicit breaking change keyword
- 70–89%: Major bump with broad usage, no explicit breaking signal
- 50–69%: Minor bump with ambiguous changelog
- <50%: Speculative — flag for human judgment

Always include one-line reasoning per confidence score.
