# HTML Artifacts Guide

Skills generate two kinds of output: **terminal text** (markdown in the conversation) and **HTML artifacts** (self-contained `.html` files opened in the browser). This guide tells you when to use which, and how to build HTML artifacts.

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

Use these CSS custom properties so artifacts feel cohesive and match the Pep OS MUI theme:

```css
:root {
  /* Brand */
  --primary: #3F51B5;
  --primary-light: #E8EAF6;
  --secondary: #4CAF50;
  --secondary-light: #E8F5E9;

  /* Severity */
  --blocker: #D32F2F;
  --blocker-bg: #FFEBEE;
  --warning: #F57C00;
  --warning-bg: #FFF3E0;
  --nit: #78909C;
  --nit-bg: #ECEFF1;
  --clean: #2E7D32;
  --clean-bg: #E8F5E9;

  /* Surfaces */
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --border: #E0E0E0;
  --text: #212121;
  --text-secondary: #616161;
  --text-muted: #9E9E9E;

  /* Typography */
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-8: 48px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

## Base HTML Skeleton

Every artifact starts from this:

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
      font-family: var(--font-body);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: var(--sp-6);
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 1.5rem; margin-bottom: var(--sp-2); }
    h2 { font-size: 1.15rem; color: var(--text-secondary); margin: var(--sp-6) 0 var(--sp-3); }
    code, .mono { font-family: var(--font-mono); font-size: 0.85em; }
    .muted { color: var(--text-muted); font-size: 0.85rem; }

    /* Add artifact-specific styles below */
  </style>
</head>
<body>
  <header>
    <h1>{TITLE}</h1>
    <p class="muted">{SUBTITLE — e.g., "PEP-42 — Implementation Plan" or "Generated 2026-05-12"}</p>
  </header>

  <main>
    <!-- Artifact content -->
  </main>
</body>
</html>
```

## Pattern Library

### Pattern: Comparison Cards (for implementation path options)

Use when presenting 2-3 options side-by-side with pros/cons.

```html
<style>
  .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-4); margin: var(--sp-5) 0; }
  .option-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-5); position: relative; }
  .option-card.recommended { border-color: var(--primary); border-width: 2px; }
  .option-card.recommended::after { content: 'Recommended'; position: absolute; top: -10px; right: 16px; background: var(--primary); color: white; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; }
  .option-title { font-weight: 600; font-size: 1.05rem; margin-bottom: var(--sp-3); }
  .option-summary { color: var(--text-secondary); margin-bottom: var(--sp-4); font-size: 0.9rem; }
  .pros-cons { display: flex; flex-direction: column; gap: var(--sp-2); }
  .pro, .con { display: flex; align-items: flex-start; gap: var(--sp-2); font-size: 0.88rem; }
  .pro::before { content: '+'; color: var(--secondary); font-weight: 700; min-width: 14px; }
  .con::before { content: '-'; color: var(--blocker); font-weight: 700; min-width: 14px; }
  .risk-pill { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; margin-top: var(--sp-3); }
  .risk-low { background: var(--clean-bg); color: var(--clean); }
  .risk-medium { background: var(--warning-bg); color: var(--warning); }
  .risk-high { background: var(--blocker-bg); color: var(--blocker); }
</style>

<div class="options-grid">
  <div class="option-card recommended">
    <div class="option-title">Option A: {Name}</div>
    <div class="option-summary">{What it changes}</div>
    <div class="pros-cons">
      <div class="pro">{Pro 1}</div>
      <div class="pro">{Pro 2}</div>
      <div class="con">{Con 1}</div>
    </div>
    <span class="risk-pill risk-low">Low Risk</span>
  </div>
  <div class="option-card">
    <div class="option-title">Option B: {Name}</div>
    <!-- same structure -->
  </div>
</div>
```

### Pattern: Severity-Tagged Findings (for audit reports)

Use when presenting categorized findings with file references.

```html
<style>
  .verdict-banner { padding: var(--sp-4) var(--sp-5); border-radius: var(--radius-md); font-weight: 600; font-size: 1.1rem; margin: var(--sp-5) 0; text-align: center; }
  .verdict-clean { background: var(--clean-bg); color: var(--clean); }
  .verdict-findings { background: var(--blocker-bg); color: var(--blocker); }
  .finding { background: var(--surface); border-radius: var(--radius-md); padding: var(--sp-4); margin-bottom: var(--sp-3); border-left: 4px solid; }
  .finding-blocker { border-color: var(--blocker); }
  .finding-warning { border-color: var(--warning); }
  .finding-nit { border-color: var(--nit); }
  .finding-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); }
  .finding-title { font-weight: 600; }
  .severity-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; }
  .badge-blocker { background: var(--blocker-bg); color: var(--blocker); }
  .badge-warning { background: var(--warning-bg); color: var(--warning); }
  .badge-nit { background: var(--nit-bg); color: var(--nit); }
  .finding-file { font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--sp-2); }
  .finding-body { font-size: 0.9rem; color: var(--text-secondary); }
  .finding-fix { background: var(--secondary-light); padding: var(--sp-3); border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: var(--sp-3); }
  .scope-check { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) 0; font-size: 0.9rem; }
  .scope-check.covered::before { content: '\2713'; color: var(--clean); font-weight: 700; }
  .scope-check.missing::before { content: '\2717'; color: var(--blocker); font-weight: 700; }
</style>

<div class="verdict-banner verdict-findings">HAS FINDINGS — 2 Blockers, 1 Warning</div>

<h2>Scope Alignment</h2>
<div class="scope-check covered">AC-1: "Users can upload voice notes" — addressed in AddNoteModal.jsx:42-78</div>
<div class="scope-check missing">AC-2: "Error toast on upload failure" — not found in diff</div>

<h2>Blockers</h2>
<div class="finding finding-blocker">
  <div class="finding-header">
    <span class="finding-title">{Title}</span>
    <span class="severity-badge badge-blocker">Blocker</span>
  </div>
  <div class="finding-file">{file_path}:{line_range}</div>
  <div class="finding-body">{What's wrong + why it matters}</div>
  <div class="finding-fix"><strong>Fix:</strong> {Suggested fix}</div>
</div>
```

### Pattern: Stat Cards + Table Dashboard (for project pulse)

Use when presenting metrics, activity, and recommendations together.

```html
<style>
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--sp-3); margin: var(--sp-5) 0; }
  .stat-card { background: var(--surface); border-radius: var(--radius-md); padding: var(--sp-4); border-left: 4px solid var(--border); }
  .stat-value { font-size: 1.8rem; font-weight: 700; line-height: 1; }
  .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: var(--sp-1); }
  .progress-bar { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin: var(--sp-4) 0; }
  .progress-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.3s; }
  .activity-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .activity-table th { text-align: left; padding: var(--sp-2) var(--sp-3); border-bottom: 2px solid var(--border); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; }
  .activity-table td { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: var(--sp-2); }
  .dot-done { background: var(--clean); }
  .dot-progress { background: var(--primary); }
  .dot-todo { background: var(--warning); }
  .dot-stale { background: var(--blocker); }
  .suggestion-card { background: var(--surface); border-radius: var(--radius-md); padding: var(--sp-4); margin-bottom: var(--sp-3); display: flex; gap: var(--sp-4); align-items: flex-start; }
  .suggestion-rank { background: var(--primary-light); color: var(--primary); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
  .suggestion-body { flex: 1; }
  .suggestion-title { font-weight: 600; font-size: 0.95rem; }
  .suggestion-why { color: var(--text-muted); font-size: 0.82rem; margin-top: var(--sp-1); }
</style>

<div class="stats-grid">
  <div class="stat-card" style="border-color: var(--clean);">
    <div class="stat-value">8</div>
    <div class="stat-label">Done</div>
  </div>
  <div class="stat-card" style="border-color: var(--primary);">
    <div class="stat-value">3</div>
    <div class="stat-label">In Progress</div>
  </div>
  <!-- more cards -->
</div>

<div class="progress-bar">
  <div class="progress-fill" style="width: 42%;"></div>
</div>
<p class="muted" style="text-align:center;">42% complete (8/19 non-cancelled done)</p>
```

### Pattern: File Change List with Risk Tags

Use inside plans or audit reports to show which files change and how risky each one is.

```html
<style>
  .file-list { margin: var(--sp-4) 0; }
  .file-item { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: 0.88rem; }
  .file-path { font-family: var(--font-mono); font-size: 0.82rem; flex: 1; }
  .file-desc { color: var(--text-secondary); font-size: 0.82rem; flex: 2; }
  .file-risk { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .file-risk-safe { background: var(--clean-bg); color: var(--clean); }
  .file-risk-medium { background: var(--warning-bg); color: var(--warning); }
  .file-risk-high { background: var(--blocker-bg); color: var(--blocker); }
</style>

<div class="file-list">
  <div class="file-item">
    <span class="file-path">src/components/AddNoteModal.jsx</span>
    <span class="file-desc">Add voice upload retry logic</span>
    <span class="file-risk file-risk-medium">Medium</span>
  </div>
</div>
```

### Pattern: Collapsible Sections

Use for long content that should be scannable (test specs, code details).

```html
<details>
  <summary style="cursor:pointer; font-weight:600; padding:var(--sp-2) 0;">{Section Title}</summary>
  <div style="padding:var(--sp-3) 0 var(--sp-3) var(--sp-4); border-left:2px solid var(--border); margin-left:var(--sp-2);">
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

- **Don't duplicate.** If it's in the HTML file, don't also put it in terminal markdown. The terminal message is a pointer: summary + file path.
- **Don't use HTML for agent-consumed data.** The fix agent reads the audit report as structured text, not HTML. If another agent needs the data, keep a structured version (the skill can hold it in memory) and only render the human-facing version as HTML.
- **Don't add JavaScript unless the artifact is an editing surface.** Read-only artifacts (plans, reports, dashboards) need zero JS. Collapsible `<details>` elements are native HTML, no JS needed.
- **Don't over-design.** The goal is scannability, not aesthetics. If a section has 3 items, a styled list is fine — don't build a card grid for it.
- **Don't use external resources.** No CDN links, no Google Fonts, no images from URLs. Everything inline.
