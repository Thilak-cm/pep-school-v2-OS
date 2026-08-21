---
type: meeting_record
title: "Assessment data structure and medical records upload flow"
date: "2026-08-20"
participants: ["Thilak"]
areas: ["observation-capture", "timelines-and-media", "analytics-and-notifications", "ai-tools-and-chat", "admin-and-access", "settings-feedback-shell"]
topics: ["structured-assessments", "medical-assessments", "assessment-ingestion", "weekly-digest", "brain", "stats", "coach-chat", "soul-generation", "job-monitoring", "ai-costs"]
status: "issues-drafted"
issue_refs: [212, 229, 241, 248, 253, 254, 255]
source: "Granola — https://notes.granola.ai/t/2ad4a9d3-2825-43e7-a23a-9ab534752907"
---

## Meeting Notes / MOM

The meeting finalized the v1 direction for a fourth note category, Assessment, with structured spreadsheet and medical PDF subtypes. Structured uploads should use a teacher-authored metadata section at the top of the selected worksheet: assessment name, date or date window, assessment description, and plain-English definitions for result fields. This deliberately shifts one-time labeling work to the teacher and removes the need for an LLM clarification chat; each aligned row or multiline segment becomes its own per-student assessment record. Source documents remain stored for provenance and later verification.

Assessment records should appear in a dedicated student-level history, count as a fourth category in Statistics, and be explicitly integrated into Coach Pepper, Soul, weekly snapshots, monthly plans, classroom digests, baselines, term reports, and readiness workflows. A cross-student assessment-document view is deferred. Medical assessments use the same Assessment entry point with a Medical toggle, accept PDFs, process asynchronously, and retain the original PDF for viewing or download from the student profile.

The group also discussed several operational follow-ups: dismissible red alerts; a more insightful, longitudinal weekly email digest; Brain-backed prompts and curriculum references; the broken Statistics refresh; malformed Coach Pepper bullet rendering; the Coach shortcut being covered by the add-note FAB; rolling improved Open Questions into all four Soul prompts; possibly moving the August Soul run earlier; per-child AI cost reporting; and job-run monitoring before month-end generation.

## Decisions

- Add Assessment as a fourth note category beside voice/text, media, and lesson.
- Provide two v1 assessment subtypes: Structured spreadsheet upload and Medical PDF upload.
- Structured uploads accept CSV/XLSX on a dedicated full-page flow.
- Require five conceptual fields: student identity, assessment type/name, assessment description, assessment date/date window, and at least one result.
- Put teacher-defined metadata at the top of the worksheet, including plain-English descriptions for Result 1, Result 2, and any additional result fields.
- Remove LLM clarification questions from the expected structured-upload path; the teacher performs the semantic labeling once and can reuse the format.
- For multi-worksheet workbooks, require the uploader to select one worksheet.
- Split aligned multiline/grouped cells into separate assessment events. Counts are per resulting record, not per source document.
- Store original spreadsheet/PDF artifacts alongside compact parsed records for audit, troubleshooting, and reprocessing.
- Keep assessment browsing student-scoped for v1; defer a cross-student document view.
- Make student assessment history available from the student dashboard/timeline.
- Count assessments as a separate fourth Statistics category.
- Explicitly feed structured assessments into all relevant AI pipelines rather than treating them as ordinary text observations.
- Keep PDF upload in Media Notes while also offering a Medical assessment subtype.
- Process medical PDFs asynchronously and retain the original for student-profile viewing or download.
- Defer question-paper upload and interpretation to a future, Icebox issue.
- Add an Acknowledge action to red alerts so teachers can dismiss them immediately.
- Put multi-week pattern detection and prioritization in the weekly email digest rather than making the in-app alert system agentic in v1.
- Use Brain content for editable prompts and supporting curriculum/reference documents; wiring remains engineering work.
- Prefer printable HTML for the revised monthly-plan output.
- Apply the improved Open Questions behavior to all four program-specific Soul prompts before the next run.
- If the prompt changes validate, move the Soul run from August 31 to approximately August 27–28.
- Prepare run-level monitoring before month-end and term-report generation.
- Report AI tokens and cost per child, broken down by major pipeline/output.

## Drafted Issues

### Created

- #253 — Add question-paper context to assessments (P4-low, Icebox)
- #254 — Make weekly digests longitudinal and insight-led (P2-high)
- #255 — Process medical assessment PDFs asynchronously (P4-low, Icebox)

### Augmented

- #212 — Added Brain-managed digest prompts, curriculum/reference-file loading, and printable monthly-plan HTML requirements.
- #229 — Added month-end student-level run reconciliation, P1 priority, and Pep OS project membership.
- #241 — Added per-child tokens/cost, pipeline breakdowns, annualized estimates, and model-change comparisons.
- #248 — Replaced the adaptive clarification-heavy direction with defined worksheet metadata; added Medical PDF upload, assessment Statistics, student history, and downstream AI decisions; split asynchronous medical processing into #255.

### Skipped

- Create a separate assessment-AI integration issue — decisions were folded into #248; #252 remains as related technical context.
- Create a new red-alert acknowledgement issue — an existing acknowledged/dismissed pattern was referenced, so no duplicate was created.
- Fix Statistics memory exhaustion — already being handled in #251.
- Create a combined Coach formatting/FAB issue — reserved as an ad-hoc code fix after issue triage.
- Track the four-program Soul prompt rollout — treated as operational work rather than a new issue.
- Add a teacher observation-quality report-card issue — existing #154 already covers the underlying feature.
- Add Open Questions/chat adoption tracking — not selected for issue creation.

## Open Questions

- The opening discussion limited structured upload to superadmins/classroom admins, while later language repeatedly says “teacher uploads.” Confirm the exact initiating roles before implementation.
- Confirm whether v1 keeps the previously proposed deterministic evidence verifier after the standardized metadata template removes clarification questions.
- Define the exact spreadsheet template grammar, including how metadata boundaries, date windows, and multiline result alignment are represented.
- Define the normalized interpretation contract for medical PDFs and what is shown before background processing finishes.
- Decide whether improved Soul prompts and the earlier August run are release tasks or operational actions tracked outside product issues.

## Clarifications

- The four explicit closing tasks were: produce the per-child AI cost report; update all four Soul prompts and potentially move the August run earlier; implement assessments; and implement job monitoring/run logs.
- Medical PDF upload, storage, and original-file access belong to #248. Background OCR, interpretation, retries, and downstream medical-content processing are deferred to #255.
- Question-paper ingestion and grading-context interpretation are deferred to #253.
- Structured-assessment downstream AI requirements were folded into the authoritative 2026-08-20 decision block in #248 rather than handled as a separate walkthrough item.

## Raw Transcript

> Lightly cleaned transcript: greetings, repeated acknowledgements, filler, and false starts were removed. Substantive product decisions, constraints, examples, and follow-ups are preserved. Speaker labels remain as supplied by Granola.

Me: I pushed the cropping feature to teachers and replied to KB Panama's feedback. I spent most of this week speccing assessments and have questions to clarify. The rough flow is that a superadmin or classroom admin sees a fourth note type: voice, media, lesson, and assessment. Assessment opens a full page like Lesson Notes, where the user uploads CSV, XLSX, or another supported document.

Me: A deterministic parser needs core fields so it can break the sheet into computer-readable rows and cells. I initially proposed student name, assessment type, assessment date, and at least one result such as a score, grade, or comment.

Them: There should also be an assessment descriptor or description. The LLM needs to know what the assessment is.

Me: Agreed. The five core fields become student name, assessment type, assessment description, assessment date, and at least one result. The parser extracts the sheet, then the LLM can semantically interpret optional fields such as comments, time taken, self-correction, or reading level. I had also considered validating the LLM output deterministically against source cells because the resulting data will feed other pipelines and ultimately reach teachers and parents.

Them: I am not very worried about hallucination. These are small classroom-scoped sheets, usually no more than about 15 students, and converting cells to JSON is a solved problem.

Me: The risk is a number such as 35 becoming 45 or values being swapped. Even if frontier models rarely do this, I want provenance and verifiability because we store the output. We can collect backend data and decide whether the verification layer ships in v1.

Me: I also considered a Coach Pepper-style clarification step where the model asks what abbreviations such as UG, AD, or E mean, or confirms ambiguous dates and fields.

Them: We should simplify and avoid making the LLM do that much interpretation. The teacher should provide the meaning in the sheet. Put metadata at the top: assessment name, assessment date or date window, and result fields. The teacher defines Result 1, Result 2, Result 3, and so on in plain English—for example grade and time taken. Then the actual data table follows below.

Me: Metadata at the top plus the actual table makes the structure extensible: Result 4, Result 5, and so on. If the required concepts are defined there, it eliminates clarification questions and greatly simplifies interpreting any number of data columns.

Them: Exactly. This is a worthwhile one-time effort for teachers. Once a teacher creates the format properly, subsequent work is copy-paste. A reading assessment with seven result dimensions can simply define Result 1 through Result 7 at the top. Keep it simple and let teachers adapt their existing sheets.

Me: With that structure, we may not need an LLM to parse source facts. I suggest a real assessment record with queryable structured fields plus a generated text representation for display and downstream context.

Them: The structured data should remain structured. The metadata already provides what is needed to save that type.

Me: We can show an ideal template on the structured-upload page for documents that do not yet fit.

Them: I will handle teacher knowledge transfer and the recommended format. The human doing a little labeling work solves a lot of engineering complexity.

Me: For review, should a user be able to see all of one student's assessments in reverse chronological order, similar to the Media section on the student profile?

Them: Yes.

Me: We can add an Assessments button to the student dashboard, raise or shorten the baseball-card area, and support up to eight dashboard buttons. Do we need a document-centric view that shows one uploaded document across multiple students?

Them: No, defer that. The UI is built around an individual child rather than arbitrary subsets of students. Do not add cross-student document browsing now.

Me: Since this is another note type, should it be available to Coach Pepper chat, student Soul, weekly snapshot, monthly plan, classroom digest, baseline, term report, readiness, and every related AI pipeline?

Them: Yes. Assessments are an important part of understanding the child.

Me: In the sample spreadsheet, one student's cell contained three separate lines. Should that yield three assessment records?

Them: Yes. Those were three assessments grouped in a cell for convenience and must be split into separate records.

Me: Then each aligned entry becomes a separate note. Existing name-resolution behavior can match uploaded names to students, with explicit correction when ambiguous.

Me: Should assessment records count in the overall notes and Statistics page?

Them: They should be a separate category.

Me: Statistics currently has observations, lessons, and media, so assessment becomes a fourth type. Counting is per record rather than per file: 20 rows produce 20 assessment notes; if 20 children each have three aligned entries, that produces 60 notes.

Them: Correct.

Me: For multi-worksheet workbooks, the app will ask which worksheet to upload.

Them: Yes.

Them: A future question is whether to upload the question paper as grading context, especially for higher grades.

Me: That could be an optional upload on the structured-assessment page, but it often introduces PDFs, photographs, and OCR.

Them: It becomes sophisticated quickly: the system has to understand the question paper, infer its level, summarize it, and relate it to results. Park that for level two.

Me: I will create an issue and put it in Icebox.

Them: For v1, rely on the human's accurate assessment description. Later, question-paper understanding can reduce that reliance.

Me: To confirm the v1 flow: the user opens Assessment from Add Note. Structured is the default subtype. They upload the document, select a worksheet if needed, resolve student names within their authorized classroom scope, and a deterministic parser separates metadata from the table. We then save one structured record per event and retain the original document for audit and verification.

Them: Correct. Classroom scope remains strict. If someone conducted an assessment in another class, the teacher assigned to that class should upload it rather than broadening the first person's access.

Me: The source document stays stored so discrepancies can be investigated and parsed records can be corrected later.

Them: Yes.

Them: There is another assessment use case: a child may return from a medical assessment with a PDF. This is like a media note tagged as an assessment and should be in the tool.

Me: Existing Media Notes already support PDF upload, although the PDF tab is less prominent than image upload. Should PDF move out of Media and into Assessment?

Them: No. PDFs can stay in Media because there are other reasons to upload them. Assessment should also offer PDF upload with a Medical tag.

Me: Medical assessment is more free-form. The teacher can upload the PDF and send it; OCR and interpretation can happen asynchronously in the backend.

Them: Yes. Medical reports can be long, sometimes rendered originals and sometimes scans. Parsing may be straightforward for printed PDFs, but there is still an interpretation layer. It can happen in the background.

Them: From the student's profile, I sometimes need the complete original assessment rather than only an AI interpretation. The app should let me read it or at least download it.

Me: Then the Assessment page defaults to Structured and offers a Medical toggle. Medical accepts a PDF, uploads immediately, and processes asynchronously. Together, structured and medical assessments cover the two major remaining external data sources.

Me: Separately, red alerts persist for the full week, teachers become numb to them, and they cannot dismiss them. I was working on an Acknowledge action that removes an alert immediately. I also considered replacing simple flags with a weekly agent that detects patterns, such as a child having three or four red flags across six weeks or teachers not logging notes for months.

Them: The intelligent multi-week pattern belongs in the email digest. The in-app alert UI is adequate once Acknowledge dismisses the current alert. The digest is currently memoryless, data-heavy, and not insight-heavy; improving its prompt can make it prioritize urgent longitudinal patterns.

Me: So keep the UI alert system simple and raise intelligent pattern detection in the weekly email digest.

Them: Yes. Everyone is using the email. The digest already has an LLM and a lot of data; improve that prompt rather than creating a second agentic alert system.

Them: I should be able to access and update that prompt through Brain.

Me: The digest has not yet been wired to Brain. I need to do that.

Them: That is fine. I also have requested monthly-plan output changes. I will update the Markdown file and send it. We may want the monthly plan to output HTML so teachers can print it.

Me: HTML stored in Brain is straightforward to read and use. You also mentioned supporting reference files.

Them: Yes. The monthly-plan prompt should read curriculum and other reference documents before generating the plan. I will work on the prompt and add two or three referenced files; engineering needs to wire them.

Me: Brain is underutilized while it only stores prompts with no supporting documents. Its real value appears once prompts can reference curriculum and operational knowledge stored there.

Them: Statistics is not working; multiple teachers reported it.

Me: I am working on the fix and expect to push it in an hour or two. It is a good growth problem: the function's memory allocation is no longer enough for the data volume, so it needs a more scalable implementation.

Them: Multiple teacher reports are a positive usage signal because it means people actively refresh Statistics.

Them: I am separately experimenting with using Codex and direct database access to rate teacher observation quality against our new observation handbook. Teachers would receive a monthly personal report card showing strong observations, observations that could improve, and tips. It should emphasize quality rather than quantity.

Me: That resembles a backend service/agent that reads Firestore, runs a prompt, and sends email. It may reveal reusable patterns for other agentic tasks.

Them: Exactly. Similar services could eventually power the weekly digest and send email or WhatsApp outputs.

Them: Open Questions are a big hit. Teachers across programs say they are exactly what they needed.

Me: I have not yet reviewed the usage metrics.

Them: Coach Pepper chat is also working well, but the formatting is still broken. Bullets sometimes render as single characters on separate lines. This is irritating and makes copy-paste painful.

Me: I will prioritize fixing the bullet rendering because it has been raised repeatedly.

Them: Another UI issue is that the Coach button on the student dashboard is hidden behind the Add Note plus button. Coach is only reachable through that button.

Me: Expanding Add Note into two rows should solve it and will also accommodate the future larger set of note actions.

Them: Two rows should help. The exact final button count can be decided later.

Them: I need to improve Open Questions for the other programs. Once I edit the prompts, do the changes require Soul regeneration before teachers see new questions?

Me: Yes. Soul and Open Questions are produced together in one LLM run per student. The next run is August 31. There are four separate program-specific Soul prompts, and it appears the earlier question change was only applied to one of them.

Them: I will review and edit all program prompts, including adolescent and elementary, and return them.

Me: We should validate that the updated prompts generate smoother questions before the August 31 run.

Them: Term report generation begins around September 7–8. If the prompts are ready and validated, move the Soul run to around August 27–28 so teachers have more time to answer questions before reports.

Me: I can run it ad hoc a few days early.

Them: We also need to understand AI spend by child. For every major output—baseline, term report, Soul/baseball card, weekly snapshot, writing analysis, chat—show tokens and cost per child. School fees are per child, so I need to understand AI cost on the same unit basis.

Me: That provides a decision metric for model and frequency changes. I will prepare and send a report this week, broken down by pipeline and output.

Them: Then a model change can immediately show its child-level cost effect.

Me: The concrete follow-ups are: send the per-child AI cost report; update and validate all four Soul prompts; possibly move this month's Soul generation earlier; implement assessments; and implement job monitoring and run logs before month-end so we know which students completed Soul or monthly-plan generation and which are missing before teachers discover gaps a week later.

Them: Sounds good.
