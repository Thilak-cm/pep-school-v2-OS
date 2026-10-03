# Engineering Principles

Six codebase-maintenance concepts, each grounded in this repo's own code. Audited
2026-10-02 against the live codebase. For agents: cite violations by concept name
in reviews ("adds a sixth config cache - violates Concept 3"). For humans: the
repetition is the point.

## 1. Boundaries / Separation of Concerns

One reason to change per module. The "and also" test: if describing a file needs
"and also", it has too many concerns. Layer backend code: handler (translate
request, auth) -> business logic (pure decisions) -> data access (fetch/store).

- Done right: `functions/utils/soulHelpers.js` - pure functions, zero Firebase
  imports, trivially testable. Thin-handler example: `functions/media/index.js`
  (`analyzePhotoVLM` wires a named handler + named runWith).
- Canonical violation: `functions/assessments/index.js` - auth, Storage I/O,
  workbook parsing, permissions, and batch writes fused in one handler body.
  Frontend equivalent: `montessori-os/src/components/AddNoteModal.jsx`.
- Standing rule: every task touching a god file extracts the piece it touched.
- Vocabulary: god function/file, Single Responsibility Principle, thin
  controller, service layer, repository.

## 2. Dependency Direction

Import arrows and knowledge point inward: edge code (handlers, Firestore, Google
APIs) imports core logic; core imports nothing edge-y. Data flows inward as
function arguments - the edge fetches, the core receives plain objects and
declares its needs in its signature (dependency inversion).

- Done right: `functions/shared/firebase.js` is the only `getFirestore()` call
  in functions/; `functions/shared/llm.js` has zero Firestore knowledge;
  `soulHelpers.js` receives config as arguments.
- Canonical violation: inline `db.collection(...)` reads interleaved with
  prompt-building in `functions/digest/index.js` and `functions/students/soul.js`
  (`getSoulConfig`) - business logic that would change in a database migration.
- Litmus test: "if Firestore became Postgres, would this file change, and is
  that justified?"
- Vocabulary: dependency inversion, repository pattern, dependency injection,
  hexagonal / ports-and-adapters, accidental coupling, blast radius.

## 3. Colocation + Convention

One way to do each recurring mechanical thing (LLM calls, config access, CF
definition, db access, logging, tests); things that change together live
together. Conventions are promoted, not invented: notice a thing done 3+ times
(rule of three), extract the best instance into `shared/`, make it easier to
use than reinventing. Golden paths live in CLAUDE.md; enforcement lives in
`.claude/hooks/`.

- Done right: `functions/shared/llm.js` (`runLLM`) and
  `functions/shared/structuredLLM.js` - incident-hardened, the convention IS the
  module.
- Canonical violation: the per-feature config TTL caches independently
  reimplemented in `ai/coach.js`, `ai/baseballCard.js`, `ai/handwriting.js`,
  `students/soul.js`, `monthlyPlan/index.js`; divergent duplicate
  `fetchStudentNotesForDateRange` in `reports/index.js` vs `testbench/report.js`.
- Vocabulary: DRY (about knowledge, not lines), rule of three, convention
  drift, divergent duplicates, shotgun surgery, golden path.

## 4. Contracts at Seams

Wherever data crosses a trust or process boundary (client -> CF, LLM -> consumer,
dispatcher -> worker, our code -> Google APIs), the consumer enforces what it
requires instead of assuming it. Contracts have two levels: shape (Zod) and
value constraints (what the consumer actually rejects - control chars, enums,
lengths). The contract is defined by what the consumer rejects, not what the
producer promises.

- Done right: `functions/shared/structuredLLM.js` (schema + bounded repair
  retry), `functions/monthlyPlan/planSchema.js` (enum-locked section names),
  `functions/shared/fanout.js` (`parseFanoutMessage` validates every pubsub
  worker entry).
- Canonical violation: bare `JSON.parse` of LLM output in
  `functions/utils/reportHelpers.js` feeding Google Docs without the control-char
  sanitizer (the exact shape of the Sept 2026 monthly-plan incident).
- Standing rule: every new LLM output -> consumer path goes through
  `runStructuredLLM`.
- Vocabulary: seam, contract, parse-don't-validate, anti-corruption layer,
  unvalidated handoff.

## 5. Config / Environment Isolation

Environment-specific values (project IDs, buckets, model names, domain lists)
live in one declared place - `functions/config/`, Firestore `config` collection,
or env vars - and are injected into logic, never buried as literals.

- Done right: Firestore `config` collection for prompts/models (hot-reloadable),
  `functions/config/` constants, `VITE_FIREBASE_*` env vars.
- Canonical violations: hardcoded bucket in `functions/shared/firebase.js`;
  customer domain list in `functions/auth/index.js`; model-name literals in
  `ai/coach.js`, `ai/textCleanup.js`, `media/index.js`, `monthlyPlan/index.js`.
- Standing rule: touch a file containing an escaped literal, move it to config
  in the same PR.
- Vocabulary: 12-factor config, magic string, externalized configuration,
  runtime config store, environment coupling.

## 6. Agent Ergonomics

This repo is maintained by agents directed by a human. Three levers: the map
matches the territory (CLAUDE.md/docs verified against reality), context is
cheap (no god files, no misleading names, no root clutter), and verification is
one command (`npm test` both sides, lint, dry-run scripts, hooks).

- Done right: `docs/SCHEDULED_CLOUD_FUNCTIONS.md` (verified current),
  `.claude/hooks/` (conventions enforced, not remembered), dry-run-by-default
  ops scripts.
- Canonical violations (historical, being worked down): the `functions/` test
  suite that had no `npm test` entry, the ghost test that lived outside the CI
  glob, `voice-note-functions` as a package name, 3k-line components.
- Vocabulary: documentation drift, ghost test, context bomb, false affordance,
  guardrails over guidelines.

## Known gaps (future concepts)

Not yet covered by the six: observability as a design concern (partially held
by Langfuse + hooks), an explicit per-boundary error-handling policy (fragments
exist: #310 retry taxonomy), and data lifecycle (migrations/backfills - see the
W36 incident history).
