---
type: meeting_record
title: "Compensation, reimbursement, and product roadmap with engineering lead"
date: "2026-08-13"
participants: ["Thilak"]
areas: ["ai-tools-and-chat", "analytics-and-notifications", "timelines-and-media", "observation-capture", "admin-and-access"]
topics: ["compensation", "reimbursement", "open-questions", "soul-generation", "job-monitoring", "chat-rollout", "chat-latency", "usage-analytics", "structured-assessments", "csv-ingestion", "student-dashboard"]
status: "issues-drafted"
issue_refs: ["#231", "#229", "#230", "#241", "#247", "#248"]
source: "User-provided meeting transcript; no MOM supplied"
---

## Meeting Notes / MOM

The meeting covered reimbursement follow-up, a pending salary adjustment, open-question quality across programs, scheduled-job monitoring, Coach Pepper rollout and latency, usage statistics for agent access, and a new structured-assessment import feature. The engineering lead confirmed that Coach Pepper is ready to roll out broadly with a first-response warning, while latency optimization can be deprioritized. The assessment discussion established a likely P1 initiative: classroom/admin CSV uploads should preserve structured assessment data for later teacher and AI use rather than collapsing it into an unqueryable text blob.

## Decisions

- Going forward, reimbursement emails should copy Harish so the finance follow-up is visible without forwarding.
- The duplicate July Codex reimbursement email should be distinguished from the valid August Codex reimbursement and the separate OpenRouter credit expense.
- The salary adjustment to 35k is expected to be reviewed by the compensation committee and, if approved in August, reflected going forward.
- Open-question quality for Adolescent and Elementary needs a prompt review and rerun, but the longer-term safeguard is post-job quality evaluation with an LLM judge and explicit output metrics. This is not the immediate priority.
- Scheduled job monitoring/health checks are the immediate priority before the next expensive Soul and monthly-plan generations. Baseball-card and weekly-writing-analysis runs should be used as lower-cost tests before the August 31/September 1 expensive runs.
- Coach Pepper latency is acceptable for launch. Add copy that the first response may take approximately ten seconds, then roll chat out to the full school; latency benchmarking and optimization can wait.
- Usage statistics for Open Questions and Chat should be collected in an easy-to-access repository variable/interface for agent-side querying rather than requiring repeated ad hoc Firestore exploration.
- The existing crop-images feedback has been implemented and should not become a new issue.
- Structured assessment data should be available to classroom admins as well as superadmins, appear in a student-facing assessment view/timeline, and remain queryable for teachers and AI. A CSV may need a broad but predictable schema with optional fields, predefined formats, or an extensible format mechanism.
- Assessment uploads are closer to bulk upload than ordinary free-form notes, but the team has not settled whether the stored item should be labeled as a text note or a distinct assessment note.
- Assessment ingestion can be asynchronous. The system may accept an upload immediately, show a pending state, and parse/normalize it in a scheduled job; small assessment files are expected, generally around 20 rows and at most roughly 30–40 rows.

## Drafted Issues
### Created
- #247 — Define Coach Pepper behavior across Soul-context updates
- #248 — Build structured assessment CSV ingestion and student views

### Augmented
- #231 — Build a benchmark and evaluation system for Soul Generation
- #229 — Monitor scheduled jobs with provider-neutral health checks
- #230 — Extend job-run tracking beyond scheduled workflows
- #241 — Add AI spend analytics and budget guardrails

### Skipped
- Reimbursement routing and duplicate-expense follow-up — dropped from GitHub triage; retain as an operational follow-up.
- Coach Pepper rollout/first-response guidance — already completed; commit `72e2ef9` opened role-authorized chat access.
- Assessment schema/sample-CSV follow-up — folded into #248 rather than tracked separately.
- Image cropping — already implemented before the meeting and not drafted.
- Chat latency benchmark/optimization — explicitly deprioritized during the meeting.

## Open Questions

- What exact schema balances predictable querying with the variety of assessment formats (scored quizzes, reading assessments, category/subscore data, and remarks)?
- Which assessment columns are guaranteed, and which should be optional?
- Should the canonical stored type be `text` with an assessment subtype, or a first-class assessment note type?
- Should free-form remarks be passed through an LLM during asynchronous ingestion, and how should extracted subskills/subscores be represented?
- How should assessment data be displayed and filtered on the student dashboard/timeline?
- What happens when an old Coach Pepper chat is opened after the Soul context has changed, or when the expected weekly Soul is missing?
- What exact metrics should define acceptable open-question quality, and where should judge results and failures be surfaced?
- Should agent-facing usage statistics live in a checked-in generated data file, an MCP/API interface, or both?

## Post-Meeting Additions

- Triage completed on 2026-08-13: #231, #229, #230, and #241 were augmented; #247 and #248 were created.
- #248 is the highest-priority outcome from this meeting and is marked P1 for this week. Its scope includes collecting varied sample CSVs and resolving schema, optional-field, assessment-label, asynchronous-ingestion, and student-view decisions.
- Item 4 was verified against commit history: `72e2ef9 fix: open Coach Pepper chat to role-authorized users (#220)` is present on the current branch, so no duplicate issue was created.
- Pep OS project #3 has no `Backlog` status option; its available statuses are `Todo`, `In Progress`, and `Done`. New issues were added to the project in its default unrefined state.

## Raw Transcript

The source below is the full user-provided transcription, lightly normalized only for obvious punctuation and speech-recognition artifacts. No MOM was supplied separately. Email addresses and account identifiers mentioned in the transcription have been redacted as `[email redacted]`.

### Logistics, reimbursement, and compensation

Me: Hello.

Them: Hi. Hi. Hi. Hi. Sorry.

Me: I have a few logistic things to get out of the way. If you can see my Pep School Gmail account, two things: last month my mom got around 30k, which is 5k in addition to the 25k salary, and I believe that was for the ad hoc OpenRouter credit addition. That checks out. But I sent in this on July 28. This was me switching from Claude to ChatGPT. This arrived and was sent on July 28. I did not realize I had already sent it, so the one I sent today should be fresh in your inbox: reimbursement for August 2026 Codex. To prevent confusion, the one highlighted is a duplicate of the July 28 request; the receipt dates are the same day.

Them: Only look at the one sent today. Two of them were sent to me today, correct?

Me: Yes. Today I sent two. One is correct, for another ad hoc fifty-dollar expense made yesterday. The other is a duplicate of the one I sent previously, for which I still have not received reimbursement. I wanted to clarify that in case there is confusion in the back end.

Them: Going forward, copy Harish on these emails. There is no need for extra forwarding. I remember forwarding the previous one. I will tell Harish now.

Me: Okay.

Me: I brought up the salary increment about three weeks ago and do not think we had a chance to circle back. Did we settle on 35k, or where do we stand?

Them: It is on our list to clear, hopefully in August. Chetan and I have a compensation committee where we review these items. It will most likely happen, and I want it to reflect in your August salary going forward as 35k. We like to do all teachers in one shot. The cycle is June or July onward, but because you joined in August it shifted by a month. It is on the list; 35 is going to happen.

Me: Okay. Sounds good.

### Open-question quality and Soul rerun

Me: We spoke about adolescent and elementary students’ questions not looking as smooth as toddler and primary. I investigated the logs and they confirm that the LLM ran on everything. The same run that generated the smoother toddler and primary questions also ran for adolescent and elementary. I compared the current questions with their previous versions to see whether there had been any improvement. There has definitely been a change, but the quality is not ubiquitous: it is as expected for some students and not for others.

Me: The eventual fix is some kind of judge LLM that evaluates output after the cron job, based on quantified metrics for what an acceptable question looks like. We do not have the time or bandwidth in the next two weeks, but we need a fallback that exposes when a job ran and the output was not up to the mark.

Them: Remember that the prompt was partly winged. We added a couple of sentences.

Me: Exactly. If you can pull the prompt updated by your agent, you can harden it and run it across a few children. I will rerun it for adolescent and elementary, then we can push it to all teachers. Right now only toddler and primary teachers see the button.

Them: When is the expensive run?

Me: There are two expensive runs around the end and beginning of the month: monthly-plan generation and Soul generation on consecutive days. Before then, job monitoring is critical. We need to know whether every child was processed, what failed, and whether the failure was a credit limit or another error, instead of discovering it only after a teacher reports a problem. I plan to work on monitoring after the August 20 meeting, test it with baseball cards and weekly writing analysis on August 28–30, and use the August 31 and September 1 expensive generations as the final test.

### Coach Pepper latency and rollout

Me: Chat latency telemetry is fully logged. From starting a request to receiving the last token is about 15 seconds end to end on average; the first token arrives around the twelfth second. The OpenRouter call begins around the third or fourth second, so authorization, student-context collection, and other work happen first. Now that latency is exposed, there is room for optimization. I planned a lightweight automated benchmark that sends messages and collects latency traces instead of manually testing 10–15 messages.

Them: I experienced 10–12 seconds for the first response, but after that it is nearly instantaneous because the context is loaded. That seems acceptable. A warning saying the first response takes approximately 10 seconds should be enough. I am more interested in the prompt than latency. I have not tested opening an old chat. We should eventually consider how old contexts are cleared and what happens if the Soul has updated while an old thread is open.

Me: The latest week’s Soul should be fetched. I have not decided what happens if that week’s Soul does not exist.

Them: The quality is good and it is ready to launch. Add the first-response warning and push it to the entire school. Latency work can wait.

Me: I will lower the priority of latency tests and optimization, add the warning, and roll out chat.

### Usage statistics and agent interface

Them: We need internal stats, not necessarily UI stats. I have no feel for whether Open Questions or Chat is being used.

Me: I can collect the analyzed statistics and store them in the codebase so the agent can interface with them when the repository is pulled, rather than fetching and analyzing Firestore each time. I can add guidance to AGENTS.md so the agent knows where to find the data. The existing Firestore MCP server is useful, and job monitoring may eventually expose function logs, but a pre-collected statistics interface would make routine analysis easier.

Them: Ideally there should be an interface. When I ask Codex now, it repeatedly accesses Firestore. I want the data collected in an easy-to-access variable that I can ask for from the agent side.

### Crop feedback and priorities

Me: Katie Panoma asked for the ability to crop images. I added a simple crop control in the edit flow; I will improve the UI, but the feature is effectively done.

Me: The current P1 list includes linking lesson notes to monthly-plan items, migrating OpenAI to OpenRouter, Practice Notes, and image cropping. Practice Notes can move down, and cropping can leave P1. The OpenRouter account migration could move to the company account, but we can defer access analysis.

Them: The strategic priorities are the OpenRouter usage/cost view and a summary of usage statistics. Those should give us one place to see what is happening, rather than granting personal-email access immediately. Structured assessment data is also becoming increasingly important.

### Structured assessment data

Them: Assessment data should be available to classroom admins as well as superadmins. It is a bulk upload of structured data, such as a class of 20 children receiving grades and teacher comments. Unlike ordinary observations, the data should not be lost inside a text blob. Teachers should be able to see assessment data in the child timeline, with a way to show all structured data for a child.

Me: This sounds similar to bulk upload, but the back end would be different because the data is structured. We need to decide how it is displayed. One idea is to add an Assessment Data entry next to Timeline or Reports on the student dashboard, but the current dashboard is already dense. We may need to reorganize the snapshot card and move from one row of four buttons to two rows so assessment data and future high-priority views have room.

Them: A row from a CSV could become a note for the child, showing the assessment title, name, score, and teacher note at the relevant time. The feature is similar to bulk upload.

Me: Bulk upload currently requires a note type such as lesson, text, or voice. Should assessment use a new type or text?

Them: The data could initially be a text note, but an assessment-note label may be more valuable because it distinguishes this high-value data from a random observation.

Me: We need sample CSVs, preferably different kinds, because a completely free-form CSV risks muddled data and difficult retracing. A single text blob would not be queryable; extracting values later would require unreliable LLM digestion. We need a balance between structure and flexibility.

Them: In a mental-math quiz, the total might be out of 30, but we also need addition, subtraction, and other subcategory scores. If we collapse it to the total, we lose information that could help the AI guide a teacher. We could define seven or eight predefined formats and allow an authorized person to define a new format when needed.

Me: Another approach is a fixed, wide schema in which all columns are optional. It could support total score, possible score, sub-scores, and remarks while allowing reading assessments without a numeric denominator. A remarks column could contain irregular detail that is passed to an LLM during ingestion.

Them: The common workhorse format has assessment date, assessment name, child name, total score possible, score, and remarks. Other assessments may measure reading ability without a score out of ten. Large ERP systems handle this with a wide bulk-upload sheet and optional columns.

Me: The heavy parsing and ingestion should be asynchronous. The upload can immediately show as waiting to be processed, and a scheduled job during the daily downtime can normalize and structure the data. It does not need an instant result.

Them: These are not giant spreadsheets: usually around 20 rows, sometimes 30–40. They are infrequent in primary (three or four times a year), more frequent in middle school, and intermediate in elementary, but they are valuable data that is currently sitting in spreadsheets and should be available to the LLM.

Me: I will brainstorm the schema, label, display, and processing model, request sample CSVs, and ask follow-up questions. This should be treated as a P1 priority alongside the usage/statistics work and other strategic items.

### Closing commitments

Me: I will roll Coach Pepper chat out to everyone today with the first-response warning. I will send the current system prompt for review. Open-question quality review can wait for the next Soul run; job monitoring is planned for the following week. I will create a new issue for structured assessments and work on the usage/statistics and related P1 items.

Them: Chat is good to go even if the prompt changes later. Please send the prompt. The structured assessment work is important; discuss the design questions during the week.
