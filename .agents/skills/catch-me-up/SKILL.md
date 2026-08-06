---
name: catch-me-up
description: Build an evidence-backed briefing about any bounded slice of Pep OS work, including GitHub issues, pull requests, projects, priorities, time windows, features, incidents, branches, commits, code areas, or past decisions. Use when the user says "catch me up," asks what happened or what the current state is, requests a historical or topical deep-dive, or filters work with prompts such as "P1 issues," "P2 issues," "issues solved three months ago," or "everything about Coach Pepper chat."
---

# Catch Me Up

## Goal

Turn a natural-language lens into a concise, evidence-backed briefing. A GitHub
Project is one possible scope, not a requirement.

## Frame the request

Extract the relevant dimensions:

- **Subject:** project, feature, issue, priority, incident, code area, branch, or decision
- **State:** open, closed, merged, in flight, stale, blocked, or any state
- **Time:** current, a date range, a relative period, or full history
- **Depth:** quick briefing or deep-dive
- **Output need:** orientation, prioritization, chronology, decisions, risks, or next actions

Infer missing dimensions when the request provides a useful lens. State the scope
used in the report. Ask one concise question only when different interpretations
would materially change the result.

Interpret relative month phrases as calendar months unless the user asks for a
rolling period. For example, "solved three months ago" means the calendar month
three months before the current month; show the exact dates used.

## Route to evidence

Use the smallest set of authoritative sources that can answer the request:

- **Issues, pull requests, and comments:** prefer the connected GitHub app; use
  `gh` when connector coverage is insufficient.
- **Legacy issue history:** query Linear when the requested period predates the
  GitHub Issues migration or GitHub has no matching historical records; identify
  the tracker used in the report.
- **GitHub Project fields:** use `gh project` commands when project status or
  custom fields matter.
- **Branches, commits, and code history:** use local `git log`, `git show`,
  `git blame`, and `git branch`.
- **Current implementation and docs:** use `rg`, then read the relevant files.
- **Cross-cutting feature history:** trace issue → discussion → pull request →
  commit → current code or documentation.

Do not search every source mechanically. Follow the user's lens and deepen only
where it improves the briefing.

## Workflow

1. **Define the lens.** Convert the request into explicit search filters and an
   exact time window when applicable.
2. **Build the candidate set.** Fetch enough results to make counts and ordering
   reliable. Paginate when needed and exclude pull requests from issue-only
   requests.
3. **Inspect decisive details.** Read issue bodies, labels, dates, dependencies,
   comments, linked pull requests, or commits for the items that drive the
   conclusion.
4. **Deepen according to request type.**
   - **Priority slice:** group by priority, then surface blockers, in-review or
     in-progress work, stale work, and dependencies.
   - **Historical window:** identify what closed or merged in the exact period,
     why it mattered, and what remains relevant now.
   - **Topic or feature:** search related terminology, build a chronology, trace
     decisions into the current implementation, and identify unresolved work.
   - **Issue or incident:** reconstruct the problem, decisions, implementation,
     verification, and current status.
   - **GitHub Project:** include status counts, progress, recent activity, stale
     work, and suggested next issues when those metrics are meaningful.
5. **Synthesize.** Lead with the bottom line, distinguish facts from inference,
   and explain material gaps in access or evidence.

Keep retrieval proportional to the question. When a filter returns more than 30
items, compute the full distribution but inspect only the 10–15 items most likely
to change the conclusion. Expand further only for a requested deep-dive or when
the evidence has not converged. If a preferred source is unavailable, use the
best read-only fallback and disclose the limitation instead of repeatedly
retrying the same route.

## Priority ordering

Use the repository's canonical priority field or labels. For Pep OS labels, sort:

1. P1 — urgent
2. P2 — high
3. P3 — normal
4. P4 — low
5. Unprioritized

Within the same priority, order by:

1. Work that blocks other work or needs review
2. Active in-progress work
3. User or production impact
4. Staleness
5. Most recently updated

Do not invent a priority from issue prose. If no canonical priority exists,
report it as unprioritized and keep any impact assessment separate.

## Present the briefing

Adapt the sections to the request rather than forcing a fixed dashboard:

- **Scope:** one line stating filters, sources, and exact dates
- **Bottom line:** three to six bullets with the most important conclusions
- **What happened:** chronology or grouped summary when history matters
- **Current state:** what is done, active, blocked, stale, or superseded
- **Priority view:** sorted table or list when prioritization matters
- **Decisions and dependencies:** only the consequential ones
- **What deserves attention:** concrete next actions with reasons
- **Evidence:** direct links to issues, pull requests, commits, or local files

For a quick catch-up, keep the body compact. For a requested deep-dive, expand
the chronology and evidence rather than merely adding more items.

## Examples

- "Catch me up on all open P1 and P2 issues."
- "Catch me up on issues solved three months ago."
- "Deeply catch me up on Coach Pepper chat and where the rebuild stands."
- "Catch me up on this branch since it diverged from dev."
- "Catch me up on the Question Deck: decisions, shipped work, and loose ends."
- "Catch me up on the AI Interview System GitHub Project."

## Guardrails

- Keep the workflow read-only unless the user separately asks for changes.
- Do not claim completeness when pagination, authentication, or source access is
  incomplete.
- Do not equate an old issue description with the current implementation without
  checking later evidence.
- Separate repository facts, user-stated context, and agent inference.
- Prefer direct evidence and links over unsupported summaries.
- Keep the report scannable even when the investigation is deep.
