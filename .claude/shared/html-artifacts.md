# HTML Artifacts Guide

Skills generate two kinds of output: **terminal text** (markdown in the conversation) and **HTML artifacts** (self-contained `.html` files opened in the browser). This guide tells you when to use which, and how to build HTML artifacts.

## Design Philosophy

HTML artifacts exist because **visual hierarchy communicates faster than text**. Every artifact should feel like a well-designed document — not a markdown dump rendered in a browser. Rules:

1. **Lead with structure, not prose.** Use timelines, comparison tables, stat cards, and badges. Text explains; layout communicates.
2. **Be selective with words.** If a section title + 2 bullets says it, don't write a paragraph. Prose is for context that can't be shown visually.
3. **Earn every element.** If 3 items fit in a list, don't build a card grid. If a table has 2 rows, use inline badges instead.
4. **Whitespace is a feature.** Generous margins and padding signal hierarchy. Cramped layouts kill scannability.

## Decision Framework

**Use terminal text (markdown) when:**
- Content is conversational (questions, confirmations, status updates)
- Content is consumed by other agents/skills (audit findings for the fix agent, codebase overview for explore)
- Content is a short list or single table
- Content is operational (git output, test results, commands)

**Use an HTML artifact when:**
- Content is a **comparison** (side-by-side options, before/after, tradeoff matrices)
- Content has **severity/priority tiers** that benefit from color coding (audit findings, risk maps)
- Content is a **dashboard** (stats + charts + tables + activity together)
- Content has **nested structure** that flattens badly in markdown (plans with file trees + test specs + risk tables)
- Content would exceed ~80 lines of markdown — if you're about to dump a wall of text, it belongs in HTML

**Mixed output is normal.** A skill might output a 2-line terminal summary ("Audit complete — 2 blockers, 1 warning. Open `.claude/artifacts/audit-PEP-42.html`") and put the full report in the HTML file. The terminal text is the pointer, not a duplicate.

## How to Generate

1. Write a self-contained `.html` file to `.claude/artifacts/` (create the directory if needed)
2. Name it descriptively: `plan-PEP-42.html`, `audit-PEP-60.html`, `pulse-ai-interview.html`
3. All CSS must be inline (in a `<style>` block) — no external dependencies
4. Open it: `open .claude/artifacts/{filename}.html` (macOS)
5. In the terminal, output only a short summary + the file path

## Design Tokens

Use these CSS custom properties. The palette is warm and editorial — earth tones with intentional color accents for severity.

```css
:root {
  /* Surfaces */
  --ivory: #FAF9F5;
  --paper: #FFFFFF;
  --slate: #141413;

  /* Accent */
  --clay: #D97757;
  --clay-dark: #B85C3E;
  --olive: #788C5D;

  /* Neutrals */
  --oat: #E3DACC;
  --g100: #F0EEE6;
  --g200: #E6E3DA;
  --g300: #D1CFC5;
  --g500: #87867F;
  --g700: #3D3D3A;

  /* Severity — used sparingly for findings and status */
  --blocker: #B85C3E;
  --blocker-bg: #FAEFEB;
  --warning: #C68A2E;
  --warning-bg: #FBF4E4;
  --nit: #87867F;
  --nit-bg: #F0EEE6;
  --clean: #5B7A3A;
  --clean-bg: #EEF2E8;

  /* Typography */
  --serif: ui-serif, Georgia, 'Times New Roman', Times, serif;
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-8: 48px;
  --sp-10: 72px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;
}
```

## Base HTML Skeleton

Every artifact starts from this. Note the page frame (subtle border), serif headings, and generous spacing.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{ARTIFACT_TITLE}</title>
  <style>
    /* Paste design tokens here */

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--sans);
      background: var(--g200);
      color: var(--slate);
      line-height: 1.6;
      font-size: 15px;
      padding: 32px;
    }

    .page {
      max-width: 1120px;
      margin: 0 auto;
      background: var(--ivory);
      border: 1.5px solid var(--g300);
      border-radius: var(--radius-lg);
      padding: 56px 48px 80px;
    }

    /* --- Typography --- */
    h1 {
      font-family: var(--serif);
      font-size: clamp(28px, 4vw, 42px);
      font-weight: 400;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: var(--sp-3);
    }
    .subtitle {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--g500);
      margin-bottom: var(--sp-2);
    }
    h2 {
      font-family: var(--serif);
      font-size: clamp(22px, 3vw, 30px);
      font-weight: 400;
      line-height: 1.15;
      letter-spacing: -0.01em;
    }
    h3 {
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 600;
      margin-bottom: var(--sp-2);
    }
    p, li {
      color: var(--g700);
      font-size: 15px;
      line-height: 1.65;
    }
    code, .mono {
      font-family: var(--mono);
      font-size: 0.85em;
    }

    /* --- Section Header with Number Badge --- */
    .section {
      margin-top: var(--sp-10);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: var(--sp-4);
      margin-bottom: var(--sp-5);
    }
    .section-number {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
      background: var(--oat);
      color: var(--g700);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .section-intro {
      color: var(--g500);
      font-size: 14px;
      line-height: 1.6;
      max-width: 680px;
      margin-bottom: var(--sp-6);
    }

    /* --- Tag / Badge --- */
    .tag {
      display: inline-flex;
      align-items: center;
      font-family: var(--mono);
      font-size: 11px;
      padding: 3px 10px;
      border: 1.5px solid var(--g300);
      border-radius: var(--radius-sm);
      background: var(--paper);
      color: var(--g700);
      white-space: nowrap;
    }
    .tag-clay { border-color: var(--clay); color: var(--clay); }
    .tag-olive { border-color: var(--olive); color: var(--olive); }

    /* --- Responsive --- */
    @media (max-width: 700px) {
      body { padding: 12px; }
      .page { padding: 32px 20px 48px; }
    }

    /* Add artifact-specific styles below */
  </style>
</head>
<body>
  <div class="page">
    <p class="subtitle">{BREADCRUMB — e.g., "PEP OS / PEP-42 / Implementation Plan"}</p>
    <h1>{TITLE}</h1>
    <p class="section-intro">{1-2 sentence summary. Keep it short — the document speaks for itself.}</p>

    <!-- Sections go here -->
  </div>
</body>
</html>
```

## Pattern Library

### Pattern: Numbered Sections

Use to divide the document into scannable top-level areas. Every artifact should use numbered sections.

```html
<div class="section">
  <div class="section-header">
    <span class="section-number">01</span>
    <h2>{Section Title}</h2>
  </div>
  <p class="section-intro">{Optional 1-sentence description}</p>
  <!-- Section content -->
</div>
```

### Pattern: Comparison Table (for implementation path options)

Use when presenting 2-3 options side-by-side with pros/cons. Modeled on the reference design — each option is a column with a code preview area, a PRO/CON table, and metric tags at the bottom.

```html
<style>
  .compare-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin: var(--sp-5) 0;
  }
  .compare-card {
    background: var(--paper);
    border: 1.5px solid var(--g300);
    border-radius: var(--radius-lg);
    padding: var(--sp-5);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .compare-card.recommended {
    border-color: var(--olive);
    border-width: 2px;
  }
  .compare-card.recommended .compare-label {
    color: var(--olive);
  }
  .compare-label {
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--g500);
  }
  .compare-title {
    font-family: var(--serif);
    font-size: 18px;
    font-weight: 400;
  }
  .compare-desc {
    font-size: 14px;
    color: var(--g500);
    line-height: 1.55;
  }

  /* Pro/Con mini-table inside each card */
  .procon {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--g200);
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: 13px;
  }
  .procon-header {
    padding: var(--sp-2) var(--sp-3);
    background: var(--g100);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--g500);
    border-bottom: 1px solid var(--g200);
  }
  .procon-cell {
    padding: var(--sp-3);
    border-bottom: 1px solid var(--g100);
    line-height: 1.5;
    color: var(--g700);
  }
  .procon-cell:nth-child(odd) {
    border-right: 1px solid var(--g200);
  }
  .pro-bullet::before { content: '\2022 '; color: var(--olive); font-weight: 700; }
  .con-bullet::before { content: '\2022 '; color: var(--clay); font-weight: 700; }

  /* Metric tags row at bottom of card */
  .metric-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-top: auto;
  }
  .metric-tag {
    font-family: var(--mono);
    font-size: 11px;
    padding: 3px 10px;
    border: 1.5px solid var(--g300);
    border-radius: var(--radius-sm);
    background: var(--paper);
    color: var(--g700);
  }
  .metric-tag strong { font-weight: 600; }
</style>

<div class="compare-grid">
  <div class="compare-card recommended">
    <span class="compare-label">Recommended</span>
    <div class="compare-title">{Option A: Name}</div>
    <p class="compare-desc">{1-2 sentence summary of what it changes}</p>
    <div class="procon">
      <div class="procon-header">Pro</div>
      <div class="procon-header">Con</div>
      <div class="procon-cell"><span class="pro-bullet">{Pro 1}</span></div>
      <div class="procon-cell"><span class="con-bullet">{Con 1}</span></div>
      <div class="procon-cell"><span class="pro-bullet">{Pro 2}</span></div>
      <div class="procon-cell"><span class="con-bullet">{Con 2}</span></div>
    </div>
    <div class="metric-tags">
      <span class="metric-tag">Risk: <strong>low</strong></span>
      <span class="metric-tag">Test impact: <strong>minimal</strong></span>
    </div>
  </div>

  <div class="compare-card">
    <span class="compare-label">Alternative</span>
    <div class="compare-title">{Option B: Name}</div>
    <!-- same structure -->
  </div>
</div>
```

### Pattern: Timeline (for implementation steps, milestones)

Use for sequential content — implementation order, phase breakdowns, activity logs. The vertical line + dots from the reference design.

```html
<style>
  .timeline {
    position: relative;
    padding-left: 140px;
    margin: var(--sp-5) 0 var(--sp-8);
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 126px;
    top: 8px;
    bottom: 8px;
    width: 1.5px;
    background: var(--g300);
  }
  .tl-item {
    position: relative;
    padding: 0 0 var(--sp-8) var(--sp-6);
  }
  .tl-item:last-child { padding-bottom: 0; }
  .tl-label {
    position: absolute;
    left: -140px;
    top: 2px;
    width: 112px;
    text-align: right;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--g500);
    line-height: 1.4;
  }
  .tl-dot {
    position: absolute;
    left: -7px;
    top: 6px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--g300);
    background: var(--ivory);
  }
  .tl-dot.done { background: var(--olive); border-color: var(--olive); }
  .tl-dot.active { background: var(--clay); border-color: var(--clay); }
  .tl-dot.pending { background: var(--ivory); border-color: var(--g300); }
  .tl-title {
    font-weight: 600;
    font-size: 15px;
    margin-bottom: var(--sp-1);
  }
  .tl-desc {
    font-size: 14px;
    color: var(--g500);
    line-height: 1.55;
    margin-bottom: var(--sp-3);
  }
  .tl-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (max-width: 700px) {
    .timeline { padding-left: 28px; }
    .timeline::before { left: 6px; }
    .tl-label { position: static; width: auto; text-align: left; margin-bottom: 2px; }
    .tl-dot { left: -25px; }
  }
</style>

<div class="timeline">
  <div class="tl-item">
    <span class="tl-label">Step 1</span>
    <span class="tl-dot done"></span>
    <div class="tl-title">{Step title}</div>
    <p class="tl-desc">{Brief description — 1-2 sentences max}</p>
    <div class="tl-tags">
      <span class="tag">functions/index.js</span>
      <span class="tag">firestore.rules</span>
    </div>
  </div>
  <div class="tl-item">
    <span class="tl-label">Step 2</span>
    <span class="tl-dot pending"></span>
    <div class="tl-title">{Step title}</div>
    <p class="tl-desc">{Brief description}</p>
  </div>
</div>
```

### Pattern: Severity-Tagged Findings (for audit reports)

Use when presenting categorized findings. Each finding is a card with a colored left border. Group by severity with clear section breaks.

```html
<style>
  .verdict-banner {
    padding: var(--sp-5);
    border-radius: var(--radius-md);
    font-family: var(--serif);
    font-size: 22px;
    font-weight: 400;
    margin: var(--sp-5) 0 var(--sp-6);
    text-align: center;
  }
  .verdict-clean { background: var(--clean-bg); color: var(--clean); }
  .verdict-findings { background: var(--blocker-bg); color: var(--blocker); }

  .meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-bottom: var(--sp-6);
  }

  .scope-list { margin: var(--sp-4) 0; }
  .scope-item {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-3) 0;
    font-size: 14px;
    border-bottom: 1px solid var(--g100);
  }
  .scope-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .scope-icon.covered { background: var(--clean-bg); color: var(--clean); }
  .scope-icon.missing { background: var(--blocker-bg); color: var(--blocker); }

  .finding {
    background: var(--paper);
    border: 1.5px solid var(--g200);
    border-left: 4px solid;
    border-radius: var(--radius-md);
    padding: var(--sp-5);
    margin-bottom: var(--sp-4);
  }
  .finding-blocker { border-left-color: var(--blocker); }
  .finding-warning { border-left-color: var(--warning); }
  .finding-nit { border-left-color: var(--nit); }
  .finding-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--sp-3);
  }
  .finding-title {
    font-weight: 600;
    font-size: 15px;
  }
  .severity-badge {
    font-family: var(--mono);
    font-size: 10px;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-blocker { background: var(--blocker-bg); color: var(--blocker); }
  .badge-warning { background: var(--warning-bg); color: var(--warning); }
  .badge-nit { background: var(--nit-bg); color: var(--nit); }
  .finding-file {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--g500);
    margin-bottom: var(--sp-3);
  }
  .finding-body {
    font-size: 14px;
    color: var(--g700);
    line-height: 1.6;
  }
  .finding-fix {
    background: var(--clean-bg);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-sm);
    font-size: 13px;
    margin-top: var(--sp-4);
    color: var(--g700);
    line-height: 1.55;
  }
  .finding-fix strong { color: var(--clean); }
</style>

<div class="verdict-banner verdict-findings">2 Blockers, 1 Warning</div>

<div class="meta-strip">
  <span class="tag">PEP-42</span>
  <span class="tag">Branch: pep-42-fix-upload</span>
  <span class="tag">3 files changed</span>
</div>

<div class="section">
  <div class="section-header">
    <span class="section-number">01</span>
    <h2>Scope alignment</h2>
  </div>
  <div class="scope-list">
    <div class="scope-item">
      <span class="scope-icon covered">&#10003;</span>
      <span>AC-1: "Users can upload voice notes" — addressed in AddNoteModal.jsx:42-78</span>
    </div>
    <div class="scope-item">
      <span class="scope-icon missing">&#10007;</span>
      <span>AC-2: "Error toast on upload failure" — not found in diff</span>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-header">
    <span class="section-number">02</span>
    <h2>Blockers</h2>
  </div>
  <div class="finding finding-blocker">
    <div class="finding-header">
      <span class="finding-title">{Title}</span>
      <span class="severity-badge badge-blocker">Blocker</span>
    </div>
    <div class="finding-file">{file_path}:{line_range}</div>
    <div class="finding-body">{What's wrong — 1-2 sentences}</div>
    <div class="finding-fix"><strong>Fix:</strong> {Suggested fix}</div>
  </div>
</div>
```

### Pattern: Stat Cards + Progress (for dashboards)

Use when presenting metrics. Cards are minimal — a number, a label, and a colored left accent.

```html
<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--sp-4);
    margin: var(--sp-5) 0;
  }
  .stat-card {
    background: var(--paper);
    border: 1.5px solid var(--g200);
    border-left: 4px solid var(--g300);
    border-radius: var(--radius-md);
    padding: var(--sp-4) var(--sp-5);
  }
  .stat-value {
    font-family: var(--serif);
    font-size: 32px;
    font-weight: 400;
    line-height: 1;
  }
  .stat-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--g500);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: var(--sp-2);
  }

  .progress-track {
    height: 6px;
    background: var(--g200);
    border-radius: 3px;
    overflow: hidden;
    margin: var(--sp-5) 0 var(--sp-2);
  }
  .progress-fill {
    height: 100%;
    background: var(--olive);
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .progress-label {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--g500);
    text-align: center;
  }
</style>

<div class="stats-grid">
  <div class="stat-card" style="border-left-color: var(--olive);">
    <div class="stat-value">8</div>
    <div class="stat-label">Done</div>
  </div>
  <div class="stat-card" style="border-left-color: var(--clay);">
    <div class="stat-value">3</div>
    <div class="stat-label">In Progress</div>
  </div>
  <div class="stat-card" style="border-left-color: var(--warning);">
    <div class="stat-value">5</div>
    <div class="stat-label">Todo</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">12</div>
    <div class="stat-label">Backlog</div>
  </div>
</div>

<div class="progress-track">
  <div class="progress-fill" style="width: 42%;"></div>
</div>
<p class="progress-label">42% complete — 8 of 19 non-cancelled done</p>
```

### Pattern: Activity Table (for recent activity, file lists)

Minimal table with status dots and mono-spaced identifiers.

```html
<style>
  .activity-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .activity-table th {
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1.5px solid var(--g300);
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--g500);
    font-weight: 600;
  }
  .activity-table td {
    padding: var(--sp-3);
    border-bottom: 1px solid var(--g100);
    vertical-align: top;
  }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: var(--sp-2);
    vertical-align: middle;
  }
  .dot-done { background: var(--olive); }
  .dot-progress { background: var(--clay); }
  .dot-todo { background: var(--warning); }
  .dot-stale { background: var(--blocker); }
  .issue-id {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--g500);
  }
</style>

<table class="activity-table">
  <thead>
    <tr><th>Status</th><th>Issue</th><th>Title</th><th>Assignee</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="status-dot dot-done"></span></td>
      <td><span class="issue-id">PEP-42</span></td>
      <td>{Title}</td>
      <td>{Name}</td>
    </tr>
  </tbody>
</table>
```

### Pattern: File Change List with Risk Tags

Use inside plans or audit reports to show which files change and their risk level.

```html
<style>
  .file-list { margin: var(--sp-4) 0; }
  .file-item {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-3) 0;
    border-bottom: 1px solid var(--g100);
    font-size: 14px;
  }
  .file-path {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--slate);
    min-width: 220px;
  }
  .file-desc {
    color: var(--g500);
    font-size: 13px;
    flex: 1;
  }
</style>

<div class="file-list">
  <div class="file-item">
    <span class="file-path">src/components/AddNoteModal.jsx</span>
    <span class="file-desc">Add voice upload retry logic</span>
    <span class="tag tag-clay">medium</span>
  </div>
  <div class="file-item">
    <span class="file-path">functions/index.js</span>
    <span class="file-desc">New callable function</span>
    <span class="tag" style="border-color: var(--blocker); color: var(--blocker);">high</span>
  </div>
  <div class="file-item">
    <span class="file-path">montessori-os/src/utils/export.js</span>
    <span class="file-desc">Add helper</span>
    <span class="tag tag-olive">low</span>
  </div>
</div>
```

### Pattern: Suggestion Cards (for recommended next actions)

Ranked items with a numbered badge and a "why" line.

```html
<style>
  .suggestions { margin: var(--sp-5) 0; }
  .suggestion {
    background: var(--paper);
    border: 1.5px solid var(--g200);
    border-radius: var(--radius-md);
    padding: var(--sp-4) var(--sp-5);
    margin-bottom: var(--sp-3);
    display: flex;
    gap: var(--sp-4);
    align-items: flex-start;
  }
  .suggestion-rank {
    background: var(--oat);
    color: var(--g700);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-weight: 600;
    font-size: 12px;
    flex-shrink: 0;
  }
  .suggestion-body { flex: 1; }
  .suggestion-title { font-weight: 600; font-size: 15px; }
  .suggestion-id {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--g500);
    margin-left: var(--sp-2);
  }
  .suggestion-why {
    color: var(--g500);
    font-size: 13px;
    margin-top: var(--sp-1);
    line-height: 1.5;
  }
</style>

<div class="suggestions">
  <div class="suggestion">
    <span class="suggestion-rank">1</span>
    <div class="suggestion-body">
      <div class="suggestion-title">{Issue title}<span class="suggestion-id">PEP-42</span></div>
      <div class="suggestion-why">High priority, in Todo, blocks PEP-45</div>
    </div>
  </div>
</div>
```

### Pattern: Code Block (dark background)

Use for showing code snippets, commands, or config. Dark background with syntax-aware color hints.

```html
<style>
  .code-block {
    background: var(--g700);
    color: #E6E3DA;
    border-radius: var(--radius-md);
    padding: var(--sp-5);
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.7;
    overflow-x: auto;
    margin: var(--sp-4) 0;
  }
  .code-block .kw { color: var(--clay); }        /* keywords */
  .code-block .fn { color: #C9A96E; }            /* functions */
  .code-block .str { color: var(--olive); }       /* strings */
  .code-block .cmt { color: var(--g500); }        /* comments */
</style>

<pre class="code-block"><span class="cmt">/* example */</span>
<span class="kw">const</span> result = <span class="fn">await</span> db.collection(<span class="str">"students"</span>).get();</pre>
```

### Pattern: Collapsible Sections

Use for long content that should be scannable (test specs, detailed findings).

```html
<details style="margin: var(--sp-4) 0;">
  <summary style="cursor:pointer; font-weight:600; font-size:14px; padding:var(--sp-3) 0; color: var(--slate);">
    {Section Title}
  </summary>
  <div style="padding: var(--sp-4) 0 var(--sp-4) var(--sp-5); border-left: 2px solid var(--g300); margin-left: var(--sp-2); margin-top: var(--sp-2);">
    {Content}
  </div>
</details>
```

## Lifecycle & Cleanup

HTML artifacts are **ephemeral** — they exist to support a single skill session, not as permanent records.

- `.claude/artifacts/` is gitignored. These files never get committed.
- **`/merge-issue`** deletes the entire `.claude/artifacts/` directory as part of its Phase 5 cleanup (alongside `.playwright-mcp/`).
- If a skill regenerates an artifact (e.g., re-generating a plan after edits), overwrite the previous file — don't create a new one.
- Name files with the issue ID so they're identifiable: `plan-PEP-42.html`, `audit-PEP-42.html`.

## Anti-Patterns

- **Don't text-dump.** If a section is 10+ lines of prose, rethink the structure. Use a timeline, a table, comparison cards, or collapsible sections instead.
- **Don't duplicate.** If it's in the HTML file, don't also put it in terminal markdown. The terminal message is a pointer: summary + file path.
- **Don't use HTML for agent-consumed data.** The fix agent reads the audit report as structured text, not HTML. If another agent needs the data, keep a structured version (the skill can hold it in memory) and only render the human-facing version as HTML.
- **Don't add JavaScript unless the artifact is an editing surface.** Read-only artifacts (plans, reports, dashboards) need zero JS. Collapsible `<details>` elements are native HTML, no JS needed.
- **Don't over-design small data.** If a section has 3 items, a styled list is fine — don't build a card grid for it.
- **Don't use external resources.** No CDN links, no Google Fonts, no images from URLs. Everything inline.
- **Don't forget the page frame.** Always wrap content in `<div class="page">` — the subtle border and ivory background define the design language.
