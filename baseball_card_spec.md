# Last 6 Weeks Baseball Card — Build Notes

## What it is
- A fixed “Coach Pepper’s summary” baseball card on `montessori-os/src/components/StudentDashboard.jsx` above existing cards, visible to all roles, no expand/collapse.
- Shows a per-student summary for the last 6 weeks (rolling window), based on both observation and lesson notes. Full note text can be used for AI context.

## Generation cadence
- Regenerate for **every student daily at midnight Asia/Kolkata**. No reuse/skip logic; no gating on new notes.

## Data source
- Pull from Firestore: observations/lesson notes for the student.
- Include both observation + lesson notes; use `observedAt` (fallback to `timestamp`) to filter a rolling window of `windowDays` (default 42 days).
- `export.js` can be reused for filtering and normalization.

## AI call
- New Cloud Function to fetch data, prepare prompt, and call the model.
- Model: `gpt-4o-mini`, temperature `0`.
- Prompts/system text should live in `ai_prompts` (consistent with other AI tools).
- Prompt (starter, sparse alert handled in UI not LLM):
  ```
  You are Coach Pepper, summarizing the last <WINDOW_DAYS> days of notes for ONE student.
  You receive an array of notes with various fields in them. Understand them so you can generate a structured summary output.

  Rules:
  - Output concise JSON only. No markdown. Return exactly one JSON object matching the schema; no extra keys.
  - Summaries must be grounded ONLY in provided notes. Never invent details, diagnoses, or events.
  - Keep wording clear, teacher-friendly, and brief; prefer active voice.
  - Bullets: 3–7 items (depends on content size). Each bullet must include a concrete evidence clause with a date (e.g., “On Nov 18 …”).
  - Lesson summary: 1–2 sentence conclusion weaving the recent lessons/overall takeaway (no heading).

  Output schema:
  {
    "bullets": ["...", "..."],
    "lessonSummary": "..."
  }
  ```
- Output schema (minimum):
  - `bullets`: 3–7 narrative bullets summarizing the last 6 weeks; each bullet should include inline evidence from real observations (e.g., “On Nov 18 …”).
  - `lessonSummary`: a compact concluding paragraph that captures recent lessons/overall takeaway (no heading).
  - `coverage`: TBD once coverage strip is defined.

## Config
- Doc: `config/baseball_card`.
- Fields: `model` (default `gpt-4o-mini`), `temperature` (default `0`), `windowDays` (default `42`), `timezone` (default `Asia/Kolkata`).
- Editable only by superadmins via Config page.
- No refresh policy needed (always regenerate daily).

## UI behavior
- Card title: “Coach Pepper’s summary” with a small spark icon to indicate AI-generated content.
- Pills: show “Last 6 weeks” (label driven by `windowDays`) and optionally a note-count pill/label nearby.
- Layout:
  - Section header: “What’s been happening”.
  - Bullets: 3–7 items with evidence inline.
  - Followed by a short conclusion paragraph (no heading) that serves as the compact recent lesson summary/overall takeaway.
- Card is permanently placed above current cards on StudentDashboard.
- Uses the latest generated payload; if generation fails, show error state with a button to add feedback.
- No expand/collapse; no manual refresh required for v1.

## Failure handling
- If the AI/card fetch fails, show an error and deep-link to Feedback with a prefilled message like:
  - “AI baseball card failed to load for [Student Name]. Context: last 6 weeks summary endpoint returned an error. Please investigate the AI generation function/logs.”

## Open items
- Coverage strip: decide dimension/domain buckets and color mapping.
