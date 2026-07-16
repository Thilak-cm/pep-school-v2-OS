# Brain Maintenance Rules

The `brain/` folder is the knowledge base for every LLM pipeline in Pep OS.
You edit files here locally, then push them to the live database with:

```bash
npm run push-brain
```

The script shows you exactly what changed and asks for confirmation before
uploading anything. Nothing is uploaded without your `y`.

## The one-minute mental model

- **Folders are read automatically.** Every pipeline reads: school-wide files
  + its program's files + its audience's files + its own folder. Drop a new
  `.md` file anywhere and the right pipelines pick it up - no code changes.
- **Deeper = more specific.** `school-wide/` reaches every pipeline.
  `primary/` reaches every primary pipeline. `primary/teacher-facing/`
  reaches only teacher-facing primary pipelines. `primary/teacher-facing/coach/`
  reaches only the coach.

## Rules

1. **Fixed filenames** - every pipeline folder must contain exactly these two:
   - `config.json` - model parameters (managed by Thilak, don't edit)
   - `prompt.md` - the pipeline's prompt (yours to edit)

2. **Free filenames** - any OTHER `.md` file you create is knowledge and gets
   included automatically. Name them whatever makes sense to you
   (`nomenclature.md`, `rubric.md`, `parent-tone-guide.md`, ...).

3. **Only `.md` and `.json` files.** No images, PDFs, or other formats -
   the push script will reject them.

4. **Don't create, rename, or delete folders.** The folder structure is
   managed by Thilak. If you need a new pipeline folder or want to
   restructure, ask. (The push script will warn if the structure changed.)

5. **No blank files.** An empty `.md` file blocks the push - either add
   content or delete the file.

6. **Toddler = primary.** There is no toddler folder; toddler students read
   from `primary/`. If they ever need to diverge, we'll split the folder.

7. **After a successful push, commit to git too:**
   ```bash
   git add brain/ && git commit -m "brain: update knowledge" && git push
   ```
   This keeps the repo in sync with the live database. If you skip this,
   the next person to pull the repo gets stale files.

8. **Don't edit `.brain-manifest.json`** - it's maintained automatically by
   the push script.

9. **Set a real model before going live.** New pipeline `config.json` files
   start with `"model": "placeholder-set-before-use"`. This is fine for
   initial pushes (the push script warns but does not block), but LLM calls
   will fail until you replace it with a real model name (e.g.
   `"gpt-4o-mini"`). The push script flags any remaining placeholders in
   its pre-upload summary.

## Folder map

```
brain/
├── school-wide/          read by ALL pipelines (+ home of text-summarizer,
│                         voice-transcriber - the horizontal tools)
├── primary/              (includes toddler)
│   ├── *.md              read by all primary pipelines
│   ├── teacher-facing/   blunt, internal language OK
│   │   ├── *.md          read by all teacher-facing primary pipelines
│   │   └── {pipeline}/   coach, weekly-snapshot, soul, chat, digest,
│   │                     monthly-plan, term-readiness, baseline-readiness
│   └── parent-facing/    polished, external language
│       ├── *.md          read by all parent-facing primary pipelines
│       └── {pipeline}/   term-report, baseline-report
├── elementary/           same layout as primary
└── adolescent/           same layout as primary
```
