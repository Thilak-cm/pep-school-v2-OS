/**
 * Render structured digest JSON into consistent HTML emails.
 *
 * The LLM outputs JSON with defined sections; this module wraps
 * that content in a fixed HTML template so styling is consistent
 * across runs.
 */

// ── Classroom digest ───────────────────────────────────────────────

function renderUrgentItem(item) {
  return `<div style="margin-bottom:12px;padding:10px 14px;border-left:4px solid #b22222;background:#fdf2f2;">
      <strong style="color:#b22222;">${esc(item.name)}:</strong>
      ${esc(item.content)}
      <strong>Action:</strong> ${esc(item.action)}
    </div>`;
}

function renderBullet(text) {
  return `<li style="margin-bottom:8px;">${esc(text)}</li>`;
}

/**
 * Render a classroom digest JSON object into HTML email content.
 *
 * Expected shape:
 * {
 *   title: string,
 *   urgent?: [{ name, content, action }],
 *   watch?: [string],
 *   curriculum?: [string],
 *   bright?: [string],
 *   teachers?: string
 * }
 */
export function renderClassroomDigest(data) {
  const sections = [];

  // Title
  sections.push(`<h2 style="text-align:center;margin:0 0 20px;color:#2f4f4f;">${esc(data.title)}</h2>`);

  // Urgent
  if (data.urgent?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#b22222;">Urgent — needs action this week</h3>
      ${data.urgent.map(renderUrgentItem).join("\n")}
    </section>`);
  }

  // Watch
  if (data.watch?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Watch — trending concerns</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.watch.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  // Curriculum
  if (data.curriculum?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Curriculum blind spots</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.curriculum.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  // Bright spots
  if (data.bright?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Bright spots</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.bright.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  // Teachers
  if (data.teachers) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Teacher documentation</h3>
      <p style="margin:0;">${esc(data.teachers)}</p>
    </section>`);
  }

  return wrap(sections.join("\n"), 600);
}

// ── Superadmin digest ──────────────────────────────────────────────

/**
 * Render a superadmin digest JSON object into HTML email content.
 *
 * Expected shape:
 * {
 *   title: string,
 *   critical?: [{ name, classroom, content, action }],
 *   patterns?: [string],
 *   classrooms?: [{ name, content }],
 *   bright?: [string]
 * }
 */
export function renderSuperadminDigest(data) {
  const sections = [];

  sections.push(`<h2 style="text-align:center;margin:0 0 20px;color:#2f4f4f;">${esc(data.title)}</h2>`);

  // Critical
  if (data.critical?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#b22222;">1. Critical interventions needed</h3>
      ${data.critical.map((item) => `<div style="margin-bottom:12px;padding:10px 14px;border-left:4px solid #b22222;background:#fdf2f2;">
        <strong style="color:#b22222;">${esc(item.name)} — ${esc(item.classroom)}:</strong>
        ${esc(item.content)}
        <strong>Action:</strong> ${esc(item.action)}
      </div>`).join("\n")}
    </section>`);
  }

  // Patterns
  if (data.patterns?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">2. Cross-classroom patterns</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.patterns.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  // Classrooms
  if (data.classrooms?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">3. Classrooms needing attention</h3>
      ${data.classrooms.map((c) => `<p style="margin:0 0 10px;">
        <strong>${esc(c.name)}:</strong> ${esc(c.content)}
      </p>`).join("\n")}
    </section>`);
  }

  // Bright spots
  if (data.bright?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">4. Bright spots</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.bright.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  return wrap(sections.join("\n"), 700);
}

// ── Helpers ─────────────────────────────────────────────────────────

function wrap(inner, maxWidth) {
  return `<div style="max-width:${maxWidth}px;margin:0 auto;padding:16px;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#222;">
  ${inner}
</div>`;
}

function esc(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Parse LLM output as JSON and render to HTML.
 * Throws on invalid JSON so the classroom is marked as errored
 * and no broken email is sent.
 */
export function parseAndRender(content, renderer) {
  let json = content.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const data = JSON.parse(json);
  return renderer(data);
}
