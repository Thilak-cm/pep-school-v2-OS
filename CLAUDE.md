# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pep OS (Montessori OS) — a mobile-first React PWA for Montessori teachers to capture classroom observations via voice/text, with AI coaching, lesson notes, student timelines, and admin dashboards. Firebase backend (project: `pep-os`, region: `asia-south1`).

## Repository Layout

```
/                         Root — Firebase config, deploy scripts, security rules
├── montessori-os/        React frontend (Vite + MUI)
│   └── src/
│       ├── App.jsx           Screen-based navigation (no router library)
│       ├── firebase.js       Firebase SDK init (auth, db, storage, cloudFunctions)
│       ├── components/       ~44 page & modal components
│       ├── coach/            AI Coach system (parsing, schemas, service)
│       ├── services/         saveQueue (background persistence), promptProvider
│       ├── notifications/    Toast/banner context + components
│       ├── config/           Feature flags
│       └── utils/            roleUtils, analytics, fuzzySearch, export, etc.
├── functions/            Firebase Cloud Functions (Node 20, ESM)
│   ├── index.js              All callable functions (~3800 lines)
│   └── config/               Shared constants (coach, baseball card, chat)
├── scripts/              Admin CLI tools and utilities
│   └── admin/                create-user, delete-users, recompute-stats, etc.
├── firestore.rules       Firestore security rules
├── storage.rules         Storage security rules (max 2 firestore.get() calls)
└── DATA_STRUCTURE.md     Complete Firestore schema reference
```

## Commands

### Frontend (run from `montessori-os/`)
```bash
npm run dev          # Vite dev server with HMR
npm run build        # Production build (runs prebuild → update SW version)
npm run lint         # ESLint (flat config, React hooks + refresh plugins)
npm run test         # Node.js built-in test runner (node --test)
npm run preview      # Preview production build locally
```

### Cloud Functions (run from `functions/`)
```bash
npm run lint         # ESLint with Google style guide
```

### Deploy (run from root)
```bash
npm run deploy              # Deploy all Firebase resources
npm run deploy:functions    # Deploy Cloud Functions only
npm run deploy:hosting      # Deploy hosting only
npm run deploy:firestore    # Deploy Firestore rules + indexes
```

### Emulators
```bash
npx firebase emulators:start   # Auth:9099, Functions:5001, Firestore:8080, Hosting:5000, Storage:9199
```

### Admin Scripts (run from root)
```bash
node scripts/admin/admin-cli.js        # Interactive admin CLI
node scripts/admin/create-user.js      # Create user account
node scripts/admin/recompute-stats.mjs # Recalculate classroom statistics
```

## Architecture

### Navigation
No router library — `App.jsx` manages a `screen` state variable (e.g., `'landingPage'`, `'classroomList'`, `'timeline'`, `'studentDashboard'`). Screen transitions are function calls that set screen + associated state (selectedClassroom, selectedStudent, etc.).

### State Management
No Redux/Zustand — local React state + hooks. Key patterns:
- `NotificationContext` for toast/banner notifications with undo support
- `SaveQueueService` (`services/saveQueue.js`) for background persistence with retry logic
- Custom hooks: `useObservationFilters`, `useMentionableStudents`, `useSwipeTabs`, `useNotify`

### Roles & Access Control
Three roles stored on Firestore user docs: `superadmin`, `classroomadmin`, `teacher`.
- `isSuperAdmin()` / `isPrivilegedAdmin()` defined in `utils/roleUtils.js`
- Classroomadmins scoped via `manageableClassrooms` array (contains classroomIds, e.g. "allstars", "periwinkle")
- Firestore rules enforce role checks; Storage rules limited to 2 `firestore.get()` calls per evaluation

### AI Features
- **Voice transcription**: OpenAI Whisper API (`whisperSTT.js`)
- **Text cleanup**: OpenAI GPT via `textCleanup.js`, prompts from Firestore `config/text_summarizer`
- **AI Coach**: Nudge system per observation — Cloud Function `aiCoachReview`, config from `config/coach_{program}`
- **Baseball Cards**: AI-generated student summaries via Cloud Function
- AI feature config (prompts, model, temperature) managed in Firestore `config` collection with 5-min TTL cache (`services/promptProvider.js`)

### Observations (Core Data Model)
Fan-out per student: one observation doc per student at `students/{studentId}/observations/{observationId}`. Multi-student notes share a `groupId`. Three types: `text`, `voice`, `lesson`. See `DATA_STRUCTURE.md` for full schema.

### Cloud Functions
All in `functions/index.js` (single file). Callable functions deployed to `asia-south1`. Uses `firebase-admin`. Predeploy runs lint.

## Key Conventions

- **ESM modules** throughout (`"type": "module"` in all package.json files)
- **MUI 7** with Emotion — Indigo primary, Green secondary theme
- Frontend ESLint: `no-unused-vars` errors but ignores `^[A-Z_]` patterns
- Functions ESLint: Google style guide, double quotes required
- Firebase config via `VITE_FIREBASE_*` env vars in `montessori-os/.env`
- Admin scripts use `firebase-admin` with `projectId: 'pep-os'`
- Shared constants between frontend and functions live in `functions/config/` (Vite `fs.allow` permits cross-boundary imports)
- App version tracked in `montessori-os/package.json` and `VERSION` file at root; service worker version updated at prebuild

## Firebase Security Rules Constraints

Storage rules have a strict cross-service `firestore.get()` budget. Keep unique Firestore document paths to **2 or fewer** per storage rule evaluation. This is a hard platform limit — path-level caching is NOT reliable.
