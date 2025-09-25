# Coach Prompt Pack v1 (GPT‑4.1‑mini)

> Purpose: reliable, cheap, fast GPT "coach" to propose up to **2** context‑nudges after a teacher hits **Save**, without altering original text. English‑only for MVP.

---

## 0) Ground rules (locked)

* Model: **gpt‑4.1‑mini**, temperature **0.2–0.3**.
* Max **2 nudges**, ordered by **priority** (not confidence):
  **Duration → Modality → Independence → Evidence → Subjective**.
* Activity gate: if the note isn’t activity‑like, **Duration/Modality** naturally won’t activate.
* **Fixed chips** only; GPT must not invent options.
* **Append‑only**: never rewrite teacher’s text; only propose an optional **objective one‑liner** (Subjective case) and structured chips.
* Timeout UX after Save: **>5s** long‑running notice; **≥10s** save as‑is (no nudges).

---

## 1) Input contract (request payload to GPT)

```json
{
  "note_text": "string",
  "context": {
    "student_age_band": "string|null",      
    "subject_tags": ["math"|"language"|"sensorial"|"culture"|"practical_life"|"other"],
    "teacher_first_name_token": "TEACHER_A|null",
    "class_name": "string|null"
  }
}
```

**PII redaction (pre‑processing):**

* Names → `STUDENT_A`, `STUDENT_B`, `TEACHER_A`…
* Emails → `[EMAIL]`, phones → `[PHONE]`, IDs → `[ID]`, addresses → `[ADDRESS]`.
* Keep age band, subject tags, class name (not home addresses).
* **Ignore subjective words inside quotes** for detection.

---

## 2) Output contract (strict JSON)

> If unsure, return an empty `nudges` array. Never exceed 2 items. Use listed chip values **exactly**.

```json
{
  "nudges": [
    {
      "id": "duration|modality|independence|evidence|subjective",
      "reason": "short 1‑line why this helps",
      "confidence": 0.0,
      "microcopy_key": "about_how_long|how_was_this_done|add_tiny_evidence|objective_line_invite",
      "chips": ["<5m","5–10m","10–20m","20m+"],
      "append_line": "Duration: 10–20 min",
      "metadata": { "duration_range": "10–20m" }
    }
  ]
}
```

**Category‑specific chips & append rules**

* **Duration** → chips: `<5m`, `5–10m`, `10–20m`, `20m+`; append: `Duration: <chip as human text>`; metadata: `{ "duration_range": "<chip>" }`. **Do not infer a duration** from the text; only detect missingness.
* **Modality** → chips: `Material`, `Pen & paper`, `Mental`; append: `Modality: <chip>`; metadata: `{ "modality": "<chip>" }`.
* **Independence** → chips: `Independent`, `Peer pair`, `Small group`, `Teacher-guided`; append: `Independence: <chip>`; metadata: `{ "independence": "<chip>" }`.
* **Evidence** → chips/fields (rendered in UI in this order): `# attempts`, `# correct`, `Add quote` (short text). If either count is provided, **require both** (UI enforces) and append `Evidence: X/Y correct`; if only quote is provided, append `Evidence: "<quote>"`. Metadata keys: `evidence_attempts`, `evidence_correct`, `evidence_quote`.
* **Subjective** → microcopy_key `objective_line_invite`; **no chips**; return an **example one‑line objective rewrite** in `append_line` prefixed with `Objective note: ...`. Metadata: `{ "objective_line": "..." }`. Do **not** flag adjectives **inside quotes**.

---

## 3) Detection heuristics (guidance to the model)

> Use fuzzy reasoning; do **not** rely on literal regex. Prefer high precision; if unsure, skip.

* **Activity‑like cues** (boost Duration/Modality): *worked on, practiced, used, played with, engaged with, did, completed, traced, solved*.
* **Math cues** (boost Modality): *add, subtract, minus, number rods, golden beads, bead frame, place value, fraction, stamp game, pink tower, decanomial, bead chains*.
* **Independence cues:** *independent, alone, peer, pair, small group, with help, teacher‑guided*.
* **Evidence missing:** achievement/struggle claims (*grasped, mastered, identified, struggled, improved*) without numbers (X/Y) or quotes.
* **Subjective language:** labels like *always, never, lazy, naughty, careless, hyper, happy, sad, tired, confused, good, bad* **unless inside quotes or reported speech**.

---

## 4) Nudge selection logic (model‑side)

1. Decide which categories are **missing and relevant**.
2. Rank by **priority** (Duration → Modality → Independence → Evidence → Subjective).
3. Emit up to **2** highest‑priority items.
4. Include a terse **reason** (for “Why shown?” tooltip) and a **confidence** 0..1 (calibrated by your own judgment; UI may use it later for suppression but not ordering).

---

## 5) Few‑shot examples

### Ex1 — Duration + Modality

**note_text:** `STUDENT_A used number rods today.`
**expect:** Duration (high), Modality (medium).

```json
{"nudges":[
  {"id":"duration","reason":"Activity noted without a time range.","confidence":0.88,"microcopy_key":"about_how_long","chips":["<5m","5–10m","10–20m","20m+"],"append_line":"Duration: 10–20 min","metadata":{"duration_range":"10–20m"}},
  {"id":"modality","reason":"Math work without modality context.","confidence":0.62,"microcopy_key":"how_was_this_done","chips":["Material","Pen & paper","Mental"],"append_line":"Modality: Material","metadata":{"modality":"Material"}}
]}
```

### Ex2 — Evidence only

**note_text:** `He identified the 'ch' phonogram.`

```json
{"nudges":[
  {"id":"evidence","reason":"Claim without count or quote.","confidence":0.79,"microcopy_key":"add_tiny_evidence","chips":["# attempts","# correct","Add quote"],"append_line":"Evidence: 3/3 correct","metadata":{"evidence_attempts":3,"evidence_correct":3}}
]}
```

### Ex3 — Subjective invite (ignore quotes)

**note_text:** `He said "I'm sad" during cleanup.`

```json
{"nudges":[]}
```

### Ex4 — Independence

**note_text:** `After a prompt he engaged with tracing and phonetic sounds with peers.`

```json
{"nudges":[
  {"id":"independence","reason":"No independence/grouping label present.","confidence":0.66,"microcopy_key":"how_was_this_done","chips":["Independent","Peer pair","Small group","Teacher-guided"],"append_line":"Independence: Peer pair","metadata":{"independence":"Peer pair"}}
]}
```

### Ex5 — Non‑activity arrival note (no Duration/Modality)

**note_text:** `Arrival: smiled and greeted adults.`

```json
{"nudges":[
  {"id":"subjective","reason":"Adjective can be replaced by one objective observation.","confidence":0.61,"microcopy_key":"objective_line_invite","chips":[],"append_line":"Objective note: Arrival: smiled and greeted adults.","metadata":{"objective_line":"Arrival: smiled and greeted adults."}}
]}
```

---

## 6) Timeout & errors (model guidance)

* If information is insufficient or ambiguous, **return an empty array**.
* **Never** invent chip values. Stick to approved lists.
* Do not generate more than **2** nudges.
* If asked to infer duration, **decline**; only detect missingness.

---

## 7) Caching semantics (client hint)

* If **note_text unchanged** on a quick re‑save, the client may **reuse the last response** (no call). If changed, client will call again.

---

## 8) Redaction reminder (safety)

* Treat tokens like `STUDENT_A`/`TEACHER_A` as placeholders. Do not attempt to de‑identify further, and never request raw names.

---

## 9) Implementation notes

* Bind `microcopy_key` to UI strings:

  * `about_how_long` → “About how long?”
  * `how_was_this_done` → “How was this work done?” / “How was this done?”
  * `add_tiny_evidence` → “Add a tiny evidence point?”
  * `objective_line_invite` → “Adjective spotted. Add one objective line?”
* Logging (outside model): store `coach.status`, `reason`, `nudgesShown[{id,confidence}]`, and selected fields in `coach.selections`.

---

## 10) Acceptance tests (MVP pass criteria)

* Returns valid JSON on 100 seed notes with ≤1% parse failures.
* Never outputs >2 nudges; never invents chips; respects priority order.
* Subjective nudge not triggered when adjective appears **only inside quotes**.
* Evidence pairing respected (both counts suggested when relevant; or quote alternative).
* Duration **not** emitted on clear non‑activity notes.
