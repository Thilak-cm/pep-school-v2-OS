# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pep OS (Montessori OS) - a mobile-first React PWA for Montessori teachers to capture classroom observations via voice/text, with AI coaching, lesson notes, student timelines, and admin dashboards. Firebase backend (project: `pep-os`, region: `asia-south1`).

## Repository Layout

- `montessori-os/` - React frontend (Vite + MUI)
- `functions/` - Firebase Cloud Functions (Node 20, ESM), organized by domain in subfolders
- `testbench/` - Prompt iteration and evaluation UI for AI features
- `mcp-server/` - MCP server exposing Firestore data to Claude Code
- `scripts/` - Ops and debug CLI tools
- `brain/` - Knowledge base content synced to Firestore
- `firestore.rules` / `storage.rules` - Security rules
- `DATA_STRUCTURE.md` - Complete Firestore schema reference

Explore the tree directly for current structure - it changes often.

## Commands

Frontend: run from `montessori-os/` - standard Vite commands (`npm run dev`, `build`, `lint`, `test`). Tests use Node.js built-in test runner (`node --test`).

Cloud Functions: run from `functions/` - `npm run lint` (Google style guide).

Deploy: run from root - `npm run deploy`, `deploy:functions`, `deploy:hosting`, `deploy:firestore`.

Ops: `node scripts/ops/create-classroom.mjs` (interactive or `--name --branch --program --user --dry-run/--yes` for agents), `npm run push-brain`.

## Architecture

### Roles & Access Control
Three roles stored on Firestore user docs: `superadmin`, `classroomadmin`, `teacher`.
- `isSuperAdmin()` / `isPrivilegedAdmin()` defined in `utils/roleUtils.js`
- Classroomadmins scoped via `manageableClassrooms` array (contains classroomIds, e.g. "allstars", "periwinkle")
- Firestore rules enforce role checks; Storage rules limited to 2 `firestore.get()` calls per evaluation

### AI Features
The app is heavily AI-powered. Key capabilities: voice transcription (Whisper), observation text cleanup, AI coach nudges, baseball card student summaries, handwriting analysis, photo analysis, report generation, digest generation, monthly planning, chat, and alert summarization. LLM calls route through OpenRouter for model flexibility.

- AI feature config (prompts, model, temperature) lives in Firestore `config` collection with 5-min TTL cache (`services/promptProvider.js`)
- Coach system: `montessori-os/src/coach/` (frontend), `functions/ai/` (backend)
- Prompt iteration and eval: `testbench/`
- Every LLM call must include Langfuse tracing
- See `functions/config/` for shared constants (models, prompts, tool catalog)

### Observations (Core Data Model)
Fan-out per student: one observation doc per student at `students/{studentId}/observations/{observationId}`. Multi-student notes share a `groupId`. Three types: `text`, `voice`, `lesson`. See `DATA_STRUCTURE.md` for full schema.

## Key Conventions

- Firebase config via `VITE_FIREBASE_*` env vars in `montessori-os/.env`
- Admin scripts use `firebase-admin` with `projectId: 'pep-os'`
- Shared constants between frontend and functions live in `functions/config/` (Vite `fs.allow` permits cross-boundary imports)
- App version tracked in `montessori-os/package.json` and `VERSION` file at root; service worker version updated at prebuild

## Firebase Security Rules Constraints

Storage rules have a strict cross-service `firestore.get()` budget. Keep unique Firestore document paths to **2 or fewer** per storage rule evaluation. This is a hard platform limit - path-level caching is NOT reliable.

## Philosophy

These are the principles we build by. This section will grow over time.

### User experience over product polish
In early-stage, the product that should be insanely great is the experience of being your user, not the product itself. An early, incomplete, buggy product paired with extraordinary attentiveness beats a polished product with no soul. Compensate for gaps with responsiveness, not roadmap promises. The metric is how the user feels, not how the code looks. (Derived from Paul Graham's "Do Things That Don't Scale")

### Document the why, not just the what
Always add comments explaining design choices when it's a trade-off situation. The audience is not just humans - it's future agent sessions (yours or a teammate's) that need the reasoning trail to carry forward preferences. Without the "why", an agent will re-derive or contradict past decisions. Document:
- What alternatives were considered
- Why this path was chosen over others
- Where to find more context (issue numbers, docs, conversations)

Technical comments explain code. Trade-off comments explain decisions. Prioritize the latter.
