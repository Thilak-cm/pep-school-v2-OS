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
 *   negligence?: [string],
 *   curriculum?: [string],
 *   handwriting?: [string],
 *   bright?: [string],
 *   teachers?: string,
 *   watch?: [string]
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

  // Student negligence
  if (data.negligence?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#d4a017;">Student negligence — under-observed</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.negligence.map(renderBullet).join("\n")}
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

  // Handwriting highlights
  if (data.handwriting?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Handwriting highlights</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.handwriting.map(renderBullet).join("\n")}
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

  // Watch
  if (data.watch?.length) {
    sections.push(`<section style="margin-bottom:22px;">
      <h3 style="margin:0 0 10px;color:#555;">Watch — trending concerns</h3>
      <ul style="padding-left:20px;margin:0;">
        ${data.watch.map(renderBullet).join("\n")}
      </ul>
    </section>`);
  }

  return wrap(sections.join("\n"), 600);
}

// ── Superadmin digest ──────────────────────────────────────────────

/**
 * Render a superadmin digest JSON object into HTML email content.
 *
 * Expected shape (per-program cards):
 * {
 *   title: string,
 *   programs: [{
 *     programId: string,
 *     programName: string,
 *     critical?: [{ name, classroom, content, action }],
 *     patterns?: [string],
 *     classrooms?: [{ name, content }],
 *     bright?: [string]
 *   }]
 * }
 */
export function renderSuperadminDigest(data) {
  const sections = [];

  sections.push(`<h2 style="text-align:center;margin:0 0 20px;color:#2f4f4f;">${esc(data.title)}</h2>`);

  const programs = data.programs || [];
  for (const prog of programs) {
    const cardSections = [];

    // Critical
    if (prog.critical?.length) {
      cardSections.push(`<div style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:#b22222;">Critical interventions needed</h4>
        ${prog.critical.map((item) => `<div style="margin-bottom:10px;padding:8px 12px;border-left:4px solid #b22222;background:#fdf2f2;">
          <strong style="color:#b22222;">${esc(item.name)} — ${esc(item.classroom)}:</strong>
          ${esc(item.content)}
          <strong>Action:</strong> ${esc(item.action)}
        </div>`).join("\n")}
      </div>`);
    }

    // Patterns
    if (prog.patterns?.length) {
      cardSections.push(`<div style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:#555;">Cross-classroom patterns</h4>
        <ul style="padding-left:20px;margin:0;">
          ${prog.patterns.map(renderBullet).join("\n")}
        </ul>
      </div>`);
    }

    // Classrooms needing attention
    if (prog.classrooms?.length) {
      cardSections.push(`<div style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:#555;">Classrooms needing attention</h4>
        ${prog.classrooms.map((c) => `<p style="margin:0 0 8px;">
          <strong>${esc(c.name)}:</strong> ${esc(c.content)}
        </p>`).join("\n")}
      </div>`);
    }

    // Bright spots
    if (prog.bright?.length) {
      cardSections.push(`<div style="margin-bottom:14px;">
        <h4 style="margin:0 0 8px;color:#555;">Bright spots</h4>
        <ul style="padding-left:20px;margin:0;">
          ${prog.bright.map(renderBullet).join("\n")}
        </ul>
      </div>`);
    }

    // If no sections, show "no concerns" line
    const body = cardSections.length > 0
      ? cardSections.join("\n")
      : `<p style="margin:0;color:#888;font-style:italic;">No concerns this week — all classrooms running smoothly.</p>`;

    sections.push(`<section style="margin-bottom:24px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;">
      <h3 style="margin:0 0 12px;color:#2f4f4f;border-bottom:2px solid #4a7c59;padding-bottom:6px;">${esc(prog.programName || prog.programId)}</h3>
      ${body}
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
