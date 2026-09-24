---
type: meeting_record
title: Structured assessments, practice notes, and report readiness with product review
date: 2026-09-23
participants: [Thilak, Rahul]
source: Granola (https://notes.granola.ai/t/1fccd17e-86ab-4256-8de8-622c61b3bd24)
areas: [timelines-and-media, observation-capture, analytics-and-notifications, ai-tools-and-chat, admin-and-access]
topics: [structured-assessments, practice-notes, report-readiness, student-stats, ai-cost-report, gemini-flash, langfuse, openrouter, medical-pdfs, email-digest]
status: issues-drafted
issue_refs: [296, 297, 227, 241, 255]
takeaway_count: 12
thilak_takeaway_count: 9
rahul_takeaway_count: 3
---

# 2026-09-23 - Structured Assessments, Practice Notes, and Report Readiness (Product Review)

## Meeting Notes / MOM

### Structured Assessment Rollout
- Pushed to production: structured assessment view renders correctly; delete and download buttons removed; scrollable layout for multiple columns. Rahul verified live on Vedant Doddamani's record and approved.
- Minor UI change requested: show student grade on the timeline card without opening the note.
- Note-type filter (structured/medical) missing from timeline FilterPanel; to be added.
- Teachers see the assessment option grayed out; creation is admins-only for now. Rahul approved pushing access to all users - the remaining UI changes are minor.
- Usage expected to pick up next week, after parent-teacher meetings.
- Backend instrumentation logs teacher upload errors (metadata table violations); frequent violation patterns may feed back into the default format.

### Medical PDFs
- 80% of cases: school flags a concern, refers parents to one of ~2 clinics; clinic hands back a PDF (Word-doc-converted, simple templates).
- Thilak researching PDF content extraction; needs 1-2 more samples from Rahul to understand variance.

### Practice Notes Design (decisions)
- UI: radio button on the lesson note entry ("first time" vs "practice"), NOT a separate 5th note type in the add-note UI. Backend type remains `practice` for clean separation.
- Classroom + lesson title fields shared above the branch. First-time path: existing UI unchanged. Practice path: same short description + student selection, but different rating dimensions and questions (options likely same).
- No mandatory linkage to a prior lesson note: AI infers linkage from lesson title text. Rationale: teachers are already under load ("gun to their head" on reports); avoid extra clicks/scrolling. A practice note can exist independently - no dummy parent lesson note.
- Cross-teacher linkage allowed (e.g. Yamini logs the lesson, Archana logs the practice).
- Stats: practice is a separate line item (5th type), not grouped under lessons. Rationale: new lesson is teacher-driven; practice is a structured observation of the child.
- Assessments stay visible in the activity trend even though low-volume - valuable at the student level.
- Rating dimensions for the practice path: Rahul to supply.

### Student Stats and Report Readiness (direction)
- Students tab in stats is effectively deprecated: hardcoded ranges (e.g. 0-3 notes over 42 days) are useless at current scale. Interim option mentioned: just change the hardcoded numbers; real direction is a rethink.
- New framing: quality over quantity. A report-readiness-style evaluation collapses breadth/quantity/missing-dimension signals into a single readiness number.
- Dimensions come from term report readiness checks and are program-specific (e.g. primary: social-emotional development, creative and physical development, Indian languages, cultural studies; adolescent: creative arts, physical development, technology, research practice).
- Should be program-based, not classroom-based.
- Three surfaces:
  1. Student dashboard: individual readiness score, reset each term; ideal perennial home for report readiness (moving out of reports page).
  2. Stats page: class-level aggregate - which students are underobserved across which dimensions.
  3. Weekly email digest: push the same to teachers.
- Terms: 2-3 per academic year (e.g. June-Oct, Oct-March, March-summer); boundaries are dynamic, set around the school calendar (festivals etc.), not fixed dates.
- Thilak to brainstorm dashboard placement (dashboard already jam-packed; needs a display-priority call) and return with questions.

### AI Cost Report and Model Strategy
- Cost report v1 structure agreed: headline totals (total spend + active students), per-child ledger grouped by branch > program > classroom with per-pipeline breakdown (baseline report, term report, baseball card, etc.; tokens in/out + cost), pipeline totals across students, and unattributed spend (exited/orphaned students, test bench, backend testing). Analysis/patterns and per-teacher breakdown deferred to v2. Rahul: "good enough, go ahead."
- Langfuse hit free-tier trace limit; upgrade to $29/month plan needed (added to Thilak's subscription stack). Langfuse is the observability source for token in/out costs.
- Gemini Flash ("Jeff"): strong candidate for classification tasks (calibrated decisions, cheap input tokens, free output tokens). Plan: trial on report readiness first, propagate if results are good. Don't migrate existing pipelines wholesale; generation tasks may move to cheaper models once cost-per-report numbers are in from Langfuse.
- OpenRouter is on Thilak's personal account (setup mistake); to be migrated to the PepSchool account.

## Decisions

1. Push structured assessments to all users (teachers get create access); grade-on-timeline-card and note-type filter are the only UI changes needed first.
2. Practice notes: radio-button branch inside lesson note entry; backend type `practice`; no mandatory linkage (AI infers from title); separate stats line item.
3. Students tab pivots from quantity buckets to readiness-based quality scoring; report readiness becomes a perennial feature anchored on the student dashboard, with class-level aggregation in stats and a weekly teacher digest.
4. AI cost report v1 structure approved (headline, per-child ledger, pipeline totals, unattributed); v2 gets analysis + per-teacher.
5. Trial Gemini Flash on report readiness before any wider model migration.
6. Upgrade Langfuse to the $29/month plan.
7. Thilak sends Rahul a weekly takeaway list on WhatsApp after each sync.

## Post-Meeting Reflection

### Thilak's Explicit Takeaways

#### Takeaway T1 - Roll out structured assessments to all users with timeline UI tweaks
- **Owner:** Thilak
- **Commitment:** Push structured assessment creation to all users (un-gray for teachers) and ship the two approved UI tweaks: student grade shown on the timeline card, and structured/medical note-type filter in the timeline FilterPanel.
- **Why it matters:** Teacher usage starts next week after parent-teacher meetings; Rahul will create the formats and teachers begin uploading.
- **Expected deliverable / handoff:** Deployed to production before usage picks up (week of 2026-09-28).
- **Tracking refs:** follows #290 (closed); related #275 (upload UX filter)
- **Completion evidence:** All-user access live in production; grade visible on timeline card without opening; note-type filter includes structured/medical; verified on a real student record.
- **Baseline at meeting close:** 5% - view/delete/scroll shipped and verified live, but rollout and both UI tweaks not started.
- **Next-meeting check:** Confirm teachers can add assessments and both tweaks are live; report any upload-error patterns from backend instrumentation.
- **Carry forward:** Yes

#### Takeaway T2 - Implement practice notes per agreed design
- **Owner:** Thilak
- **Commitment:** Implement the practice note flow: radio button branch in lesson note entry, backend type `practice`, no mandatory linkage (AI infers from lesson title), separate stats line item.
- **Why it matters:** Structured observation of a child practicing is distinct from teacher-driven new lessons; keeps teacher friction near zero.
- **Dependency / expected input:** Rahul's rating dimensions and questions for the practice path (Takeaway R2).
- **Tracking refs:** #227
- **Completion evidence:** Practice path live in production with Rahul's dimensions; practice appears as its own stats line item; cross-teacher practice notes work; AI linkage inference specified or implemented as designed.
- **Baseline at meeting close:** 15% - design fully converged and all clarifying questions resolved; no implementation.
- **Next-meeting check:** Demo the branch UI; confirm dimensions received and wired.
- **Carry forward:** Yes

#### Takeaway T3 - Design perennial readiness scoring (dashboard + stats + digest)
- **Owner:** Thilak
- **Commitment:** Brainstorm and propose how the readiness score is served: individual term-reset score on the student dashboard (including what to drop from the jam-packed dashboard), class-level underobserved view on stats, weekly email digest, program-specific dimensions extracted from term report readiness, dynamic term boundaries.
- **Why it matters:** Teachers have no way to know which children/dimensions are underobserved across 30 days; org has moved past quantity into quality of observation.
- **Expected deliverable / handoff:** A design proposal with follow-up questions for Rahul; then implementation issues.
- **Tracking refs:** none yet (issues to be drafted from this meeting)
- **Completion evidence:** Proposal reviewed with Rahul and converged into implementable specs.
- **Baseline at meeting close:** 0% - direction agreed, design not started.
- **Next-meeting check:** Present dashboard placement proposal and readiness-number formula sketch.
- **Carry forward:** Yes

#### Takeaway T4 - Build AI cost-per-child report v1 with the agreed structure
- **Owner:** Thilak
- **Commitment:** Build the report: headline (total spend + active students), per-child ledger grouped branch > program > classroom with per-pipeline token/cost breakdown, pipeline totals, unattributed spend (exited students, test bench, backend testing). Defer analysis and per-teacher to v2.
- **Why it matters:** Rahul needs per-child unit economics for model and pricing decisions; refines the 2026-08-20 T1 commitment with an approved v1 structure.
- **Tracking refs:** #241 (v1), #265 (v2 follow-ups)
- **Completion evidence:** Report generated from Langfuse/provider data and delivered to Rahul; unattributed spend separated from active students.
- **Baseline at meeting close:** 10% - output structure designed and approved by Rahul; no data pipeline built.
- **Next-meeting check:** Deliver the report or a first draft with real numbers.
- **Carry forward:** Yes

#### Takeaway T5 - Upgrade Langfuse to the $29/month plan
- **Owner:** Thilak
- **Commitment:** Move Langfuse off the breached free tier to the $29/month plan; add to the subscription/reimbursement flow.
- **Why it matters:** Trace logging is capped; observability (and the cost report's data source) degrades without it.
- **Completion evidence:** Paid plan active; tracing uncapped; receipt submitted for reimbursement.
- **Baseline at meeting close:** 0%.
- **Next-meeting check:** Confirm upgrade done.
- **Carry forward:** Yes

#### Takeaway T6 - Migrate OpenRouter to the PepSchool account
- **Owner:** Thilak
- **Commitment:** Transition the OpenRouter account from Thilak's personal account to the PepSchool account.
- **Why it matters:** Rahul has no access today; billing and ownership should sit with the school.
- **Tracking refs:** #276
- **Completion evidence:** OpenRouter key/billing under the PepSchool account; production traffic verified on the new key; Rahul has access.
- **Baseline at meeting close:** 0% - acknowledged as a setup mistake, not yet investigated.
- **Next-meeting check:** Confirm migration status.
- **Carry forward:** Yes

#### Takeaway T7 - Trial Gemini Flash on the report readiness pipeline
- **Owner:** Thilak
- **Commitment:** Use Gemini Flash for the next report readiness run/build as a classification-task trial; propagate to other classification pipelines only if results are good.
- **Why it matters:** Large potential spend reduction on classification-heavy workloads; deliberately avoiding a hype-driven wholesale migration.
- **Completion evidence:** Report readiness runs on Gemini Flash with quality validated against the current model; go/no-go recorded.
- **Baseline at meeting close:** 0%.
- **Next-meeting check:** Share trial results and cost delta.
- **Carry forward:** Yes

#### Takeaway T8 - Send a weekly takeaway list on WhatsApp after each sync
- **Owner:** Thilak
- **Commitment:** After every weekly sync, send Rahul his takeaway list on WhatsApp (starting with: medical PDF samples + practice note dimensions).
- **Why it matters:** Rahul-owed items currently surface only at the next meeting - a week of lost latency.
- **Completion evidence:** First WhatsApp takeaway list sent after this meeting; habit sustained weekly.
- **Baseline at meeting close:** 0%.
- **Next-meeting check:** Did the list go out and did it unblock the two handoffs?
- **Carry forward:** Yes

#### Takeaway T9 - Get back to Rahul on compensation
- **Owner:** Thilak
- **Commitment:** Speak to parents about compensation and get back to Rahul.
- **Completion evidence:** Response communicated to Rahul.
- **Baseline at meeting close:** 0%.
- **Carry forward:** Yes

### Rahul's Explicit Takeaways

#### Takeaway R1 - Share medical PDF samples
- **Owner:** Rahul
- **Commitment:** Send 1-2 more medical PDF samples (from the ~2 referral clinics) so Thilak can assess extraction variance.
- **Expected deliverable / handoff:** Sample PDFs to Thilak.
- **Tracking refs:** #255
- **Completion evidence:** Samples received by Thilak.
- **Baseline at meeting close:** 0% (a couple sent previously; more needed).
- **Carry forward:** Yes

#### Takeaway R2 - Supply practice note rating dimensions and questions
- **Owner:** Rahul
- **Commitment:** Provide the rating dimensions/questions ("line items on the branching") for the practice path.
- **Expected deliverable / handoff:** Dimension list to Thilak; blocks Takeaway T2 completion.
- **Tracking refs:** #227
- **Completion evidence:** Dimensions received and confirmed usable.
- **Baseline at meeting close:** 0%.
- **Carry forward:** Yes

#### Takeaway R3 - Create assessment formats so teachers don't invent their own
- **Owner:** Rahul
- **Commitment:** Create the structured assessment formats/templates before teacher usage starts next week.
- **Why it matters:** Prevents metadata-table violations at upload time; continues the 2026-08-20 R1 rollout commitment.
- **Completion evidence:** Formats distributed; teachers uploading against them.
- **Baseline at meeting close:** 0% (stated intent, delivery pending).
- **Carry forward:** Yes

## Drafted Issues

**Created:**
- #296 - Perennial readiness scoring: dashboard score, class stats, weekly digest (feature, P1-urgent, Pep OS project #3, Todo)
- #297 - Filter-aware timeline pagination (improvement, P2-high, Todo) - post-meeting: surfaced while verifying the Assessments filter; type filters only slice the fetched 30-note window, sparse types need ~10 blind "Show More" clicks

**Augmented:**
- #227 - practice note design decisions (this-or-that selector inside lesson note entry, no mandatory linkage, AI-inferred, separate stats line item)
- #241 - approved AI cost report v1 structure (headline, per-child ledger, pipeline totals, unattributed spend)
- #255 - medical PDF variance context (2 clinics, Word-template PDFs, samples incoming)

**Skipped (no issue):**
- Structured assessment rollout + grade-on-card + note-type filter: to be done immediately in-session, no tracking issue (Thilak's call)
- Trial Gemini Flash on report readiness (dropped)
- Upgrade Langfuse to $29/mo (dropped - handled as takeaway T5, not an issue)
- Migrate OpenRouter to PepSchool (dropped - already tracked in #276)
- Interim bump of hardcoded students-tab ranges (dropped - superseded by #296)
- Assessment upload violation-pattern feedback loop (dropped)
- Weekly WhatsApp takeaway list (process habit, takeaway T8)

## Clarifications

- Practice note branch UI corrected during issue drafting (2026-09-23): not a radio button - a simple this-or-that selector, same pattern as the existing individual/group lesson note toggle. Backend type `practice` unchanged.
- Takeaway T1 work (rollout + grade-on-card + note-type filter) deliberately has no GitHub issue; it is being implemented directly.
- Pep OS project #3 board has no Backlog column; new issues land in Todo.

## Open Questions

- Practice path rating dimensions and questions (Rahul).
- Readiness number formula: how to collapse breadth + quantity + missing dimensions into one score.
- Student dashboard real estate: what gets dropped/deprioritized to fit the readiness score.
- Where dynamic term boundaries live (config) and who sets them.
- Whether the weekly underobserved digest merges into the existing weekly stats email (#277/#254) or is separate.
- Interim fix: do we bump the hardcoded students-tab ranges while the readiness rework lands, or leave as-is?

## Raw Transcript

Chat with meeting transcript: https://notes.granola.ai/t/1fccd17e-86ab-4256-8de8-622c61b3bd24
Meeting Title: Structured assessments, practice notes, and report readiness with product review
Date: Sep 23
Meeting participants: Thilak (Me), Rahul (Them)

Me: Hello. Hey. Hey. Oh. Oh. Oh. Mm-hmm. Mm-hmm. Mm-hmm. Connect the food. Hello.
Them: Hey.
Me: Hi, how are you?
Them: Hey, hey.
Me: Hey.
Them: All good. Good.
Me: Hi, Jumpin'.
Them: Yeah, let's talk.
Me: Okay. Hi. I think it's pushed. I just pushed it to production. So if you go to the students for whom you uploaded a structured assessment last week,
Them: Okay. Okay. Let me go.
Me: I'll also check. You should be able to see a view. Rendering. And the delete is— delete and download is no longer present.
Them: Yeah, one second.
Me: Uh, who's the student you added it for?
Them: The medical one or the structured, uh, that
Me: Stuck, stuck joke.
Them: I added for Vedant Doddamani. So, if I go there, I'll— should I share my screen?
Me: Uh, sure, yeah.
Them: Okay, here I am.
Me: Yes.
Them: Access Rio Assessment. Very nice, Thilak. Perfect. And I'm assuming if there are multiple columns here, it will just come here and I can just scroll.
Me: Science school, yes, yes.
Them: Right, scroll.
Me: Yeah, it'll, as much as it can, it'll fit into that UI and then rest will be scrollable.
Them: Okay.
Me: Up to a limit. So check the student and classroom timeline.
Them: Mm-hmm.
Me: That's 2 more places where you see it, right? So go to timeline. Uh, You might have school. Filter. Or we can just keep it.
Them: Oh yeah, filter is there. Oh, here I don't have node type, is it?
Me: Okay, that I'll add. Yeah, so under filter, note type, add structure. And medical order. No, it's not.
Them: Uh, it's not there.
Me: Gone past it.
Them: It's not there.
Me: Oh yeah, you added it just last week, right? And we're already beyond it.
Them: No, I would have tagged it to a certain date. Let's check that.
Me: Oh. Oh, it says 6/30, June 30th. Yeah, scroll. We have to scroll further.
Them: It was 30th June, June 30th. Okay. Why is it not showing more? Okay.
Me: June 30th. Yeah.
Them: Ah, here we are.
Me: Yes.
Them: Okay. Nice. Okay. Uh, only thing I can think of is here, can we just put, uh, I mean, actually, I think it's okay. Let it be like this. I was thinking whether we can add Vedant's grade here directly. The way you have it here, no?
Me: Okay, okay, because it's a student timeline, so instead of without opening it, it shows the grade there.
Them: Like essentially the same card.
Me: Just his grade.
Them: Yeah, just, yeah, just this, just this.
Me: Like here. Okay. I'll make the small UI change.
Them: Just that. Yeah, just that. I think otherwise it's good to go. And I guess we'll know when we try it. I mean, I'll only create the formats so that teachers are not doing any inventing on this.
Me: Yeah.
Them: You know, we'll upload and we'll start seeing.
Me: Yeah. And as teachers upload, I'm sure they'll run into errors. And I have instrumentation on the backend to log all the errors. Yeah. They violated the metadata table in this so-and-so manner, right? So if we come across some frequent pattern of violation, maybe that can be a new part of the default, right? So that I'll keep you posted on.
Them: Yeah, and right now only the admins have the right.
Me: They— yeah, yeah, they can only— yeah, did the teachers see the— this button?
Them: Add an assessment.
Me: In the add note file, but they can't. Do anything beyond that, nothing actionable.
Them: Sure. For the users, if they do the plus sign here, they don't see assessment there. Is that what you're saying?
Me: They see assessments, but it's grayed out.
Them: It's greater. Okay.
Me: Yeah. Yeah, so I'm just, uh, these UI changes, I mean, whenever you want me to push it out to everyone.
Them: Oh, okay. Got it.
Me: Um, based on that, I can.
Them: No, I think, yeah, yeah, I think these are small. These UI changes are very minor. I think it's good to be pushed.
Me: Work on it. Yeah.
Them: Anyway, usage per se will start only like I would say next week because everybody's busy with their parent-teacher meetings now. But you can push it. I think this is good enough to be pushed, right?
Me: Okay, all right. So I'll push it out here and I'll make these tiny UI changes.
Them: Mm-hmm.
Me: For medical PDFs. I was doing some research on how to extract PDF content and all. Um, that I can have. That's something I'm still working on, but if I can get some, a few samples, I think the variance there will help me understand how to tackle it.
Them: Yeah. I'll share with you maybe one or 2 more. See, broadly there are 2 clinics.
Me: Okay.
Them: Um, that we refer for such cases, right? So there's only 2 types of reports.
Me: So this medical PDF is something that you guys request the parents to get.
Them: Uh-huh. Correct.
Me: Okay, because of some trigger.
Them: That's how I would say 80% of the cases are like that, where we see something, we say this is beyond the scope of the school, but the child needs help, and here are people who can help you. Go to these people.
Me: Okay. Okay, and then the, the result, the handoff is from the hospital. Or the clinic to you guys is the PDF, right?
Them: Okay.
Me: Okay.
Them: Correct. Correct.
Me: All right, yeah, send me a few types of documents.
Them: Yeah, but I mean, it's all— everything is, uh, it's somebody who wrote it on a Word doc and then converted to PDF. That's what it is. It's nothing more fancy than that.
Me: So I get Okay. Oh, so it's literally like that clinic type page where, you know, their, their org is org name at the top and then some handwriting.
Them: Somebody's— they have a template, they keep changing their name, they keep changing some numbers. Type out a little bit, it's nothing fancy.
Me: Okay, cool. Um, beyond that, I was working on practice notes.
Them: Mm-hmm. Mm-hmm.
Me: Uh, I've fleshed out everything, and in that process I came up with a few clarifying questions I need your opinion on.
Them: Yeah. Yeah.
Me: Okay, so what's this? You can send it to write back notes.
Them: Yeah.
Me: Yeah, this. I know the answer, but I'm confirming. Uh, say Yamini logs lesson note. For 15 kids. And then a week later, Archana logs a practice note linked to that lesson note. That should be allowed, right? So cross-teacher linkage. One second.
Them: Yeah.
Me: Okay, cool.
Them: Mm-hmm.
Me: I was thinking about how to serve this. As part of the UI, and I have one alternative.
Them: Mm-hmm.
Me: As opposed to showing it as a new note type. What if?
Them: Mm-hmm.
Me: Within lesson note, like they click lesson. And then over here it says new or follow-up. Or new word practice so that in the backend. I still have type as practice because it helps. With that clear separation, inherently it is still. You want it to act as a child. Lesson note. Right, but that doesn't necessarily mean we have to. Replicate that in the UI. So this would mean, I guess, a little simplicity in restricting ourselves to 4 node types. Not that 5 is like an egregiously high number. But that is something I thought of.
Them: Yeah, no, it's an interesting, interesting idea. Let's just run through it once. Now let's— let me share my screen again. Let's just think through the specifics. So I'm going to— let's see.
Me: Because the destination point of a practice note is something that looks like a lesson note, but there's different ratings. And with a mandatory. Link it to a lesson note.
Them: Let's say that I'm going to do an individual lesson note. What do I need? So you're saying here,
Me: Like above that, like above this. There will be new lesson note, which is this. And then follow up. Which will roughly be the same except with one additional field, which is what lesson note do you want to link it to.
Them: See, I mean, the linking, I'm okay actually with. I feel like the linking doesn't matter that much because I do it. I think it's easier for the teacher to just write the lesson title again. And the AI will infer the linkage.
Me: Okay.
Them: Right.
Me: Okay.
Them: You understand what I'm saying, right? Instead of them having one more click and, you know, they have a lot of lessons or to scroll through a whole bunch, all painful stuff.
Me: And there are a lot of lessons. Yeah.
Them: Yeah, so then I would say that maybe there's an even simpler world here where there's a checkbox only, no, where you say like there's just a checkbox, say is this a practice note or is it a first-time lesson?
Me: Oh yeah, yeah, that. A little like a radio button.
Them: A radio button, right? And, uh, like exactly. And the short description there could be— we'll— I mean, everything is the same here, right? It's the 3rd time I've seen him practicing this.
Me: All right. Um, yeah. Yeah, and because everything is the same, I was thinking that we can stick to teachers entering this page from the lesson note.
Them: I need to use it for—
Me: In the add note button.
Them: Yeah.
Me: As opposed to a separate practice note, because they both lead to something that looks very similar. Right.
Them: Yeah, no, that makes sense. Where do they add— so here they in the description. They will write here also. I think I've realized, maybe we'll think about it later. I feel like we are able to get a lot of inference from the— in this group lesson note, no, we, we say were they concentrating and all of that.
Me: And then comes in the second page once you
Them: I know, I know, it doesn't come in the individual. In the individual, let's say, oh yeah, it comes. Oh, only then it comes. Oh yeah, okay. So then here comes a problem, no? Because the moment they put this, this is no longer relevant for a practice note.
Me: Type something. Yeah, and I think you mentioned you would give a new set of ratings dimensions because inherently you want to extract different sets of information.
Them: Or a practice.
Me: Right.
Them: Correct. Correct. So which means then that it's classroom lesson title, first time or practice. Click something and you go down different paths.
Me: Yes, and that is the branch, right? And before that, classroom and lesson title is common, so might as well have that above.
Them: Yeah.
Me: And if it's first time, we already have the UI. If it's a follow-up, then a short description and student selection is the same, but the dimensions change, the questions change.
Them: Yeah. Yes.
Me: Right. And the options, I'm guessing. Same.
Them: Option. Yeah, options will be similar. Yeah, maybe same only. Questions will of course change.
Me: Yeah, I mean, that depends on the question, but this page too.
Them: Yeah.
Me: It differs, right?
Them: Yeah. Yeah.
Me: Okay.
Them: Yeah.
Me: Yeah. Then that clears up a lot. Um,
Them: Yeah, it makes it simpler. I like that. Okay.
Me: So I think we indirectly answered this question, but I'll ask it like explicitly either way. Say a practice note. You mentioned not necessarily forcing a teacher to link it, right? And rather just type the lesson note for a practice note. Uh, I think this question came more from a mandatory linkage because I was going to ask if the teacher doesn't link something, do we create a dummy lesson note? But from what I'm understanding, you're saying you don't need any of that, right? A practice note can exist independently.
Them: Yeah, yeah. Yeah, it's okay. Yeah, I feel like that's the simplest solution. No need to mandatorily link it. Yeah.
Me: Without. A bed. Okay. Okay. Yeah, then it like really blossoms as its own note type. Right. Because the most common way of adding practice mode would be just its own independent lesson title. So without the intelligence linking them, it's still 2 separate entities. Right. 2 separate note types.
Them: Yeah.
Me: Okay. Yeah, rating dimensions that you'll give me.
Them: See, I'm also coming from the pain for the teachers. See, in a very ideal world, I'll link them. I'll ask it to be linked explicitly, right? But I'm just like, I feel like it just adds more and more to the teachers and I think they're already kind of struggling a little bit. Right, I mean, just going by the time at which they're doing all of this work and all of that. No, I don't want to add more.
Me: Okay, what?
Them: Right, so I just want
Me: What gives you, like, what informs you? Telling me. That these teachers are struggling to. Is it with respect to adoption of features or I think the vastness?
Them: No, they're doing it now because there's a gun to their head. Um, Right, and because the org has said, okay, reports are also going to go through this, genuinely I don't have an option. Right, um, so we have to kind of manage the, the amount of extra work we are asking them to do. I'm coming from there. And hence, wherever a linkage can be established directly on the backend, we should try to do it. But I don't want to give them extra work. At this point of time.
Me: Okay. Okay, that's fair. Um, beyond that, that's, um, you'd want a 5th node type in stats as well. So in stats we have observation, uh, what all do we have? Observation lesson, media assessments. So practice is the 5th thing.
Them: Yeah. I think assessment, that data need not be captured like that. I think, see, that, okay, maybe we can capture it, but I don't, uh, I think it's quite relevant for the student, right? It's helpful to see for students what assessment has happened. Yeah, so it's a, it's a different note type. It's assessment, whatever, call it whatever.
Me: No, no, I'm talking about practice. Should practice be a subpart of lessons? Or a separate?
Them: Yeah.
Me: Uh, like
Them: No, it can be. No, can we under— no, it should be a different line item entirely, right? It's because see, a new lesson is teacher-driven. Right. Practice is something different. Right, it's a structured— it's, it's, it's a structured observation. Of the child. Right. I mean, it's a tricky one, but let it just be separate. I think it's just better for everything to be separate.
Me: Sure. And you mentioned something about assessments.
Them: Yeah.
Me: So by definition, its nature is that it's going to be low volume. At least compared to observations. So in the graph, it is always probably going to be the lowest, like, worm. Right, so do we still want to show that in the activity trend?
Them: Yeah. Yeah. Yeah, we should show it. I mean, because it's— we know it's going to be low value. Right, so that's not a surprise or anything. It's just there. It's part of the data we're reporting. Um, it's actually quite helpful from the student point of view, right, that I want to see, okay, Vedant, how many assessments has he— has data been reported for, for the last 3 months? As a child grows older, the data becomes more important. Right, so I think let it be there.
Me: Okay, so that actually brings me to this. Uh, 4th tab. Students.
Them: Yeah.
Me: Which, I mean, right now is completely deprecated, right? Because the scale is completely blown out.
Them: Yeah.
Me: And these hardcoded values are just useless now, right?
Them: Yeah. Yeah.
Me: So in that, like, in this line of thought, how do you want to repurpose this students tab? And do you still see value in evaluating and bucketing student activity.
Them: Yeah.
Me: So would you? Like, to be specific, would you? Update. These hardcoded ranges. Or is that something that you don't care about anymore? You want separate student-specific stats. Do we highlight it?
Them: No, I think we have to relook at the— what is our calculation here? Like, when do we call out immediate attention? Like, what is the— how does it get inferred?
Me: Uh, 0 to 3 notes. Oh, you see the number down there?
Them: Yeah, that's— yeah, 8 to 11. This is over the last 42 days. Got it. No, yeah, that's too less. I will just change the hardcoded number.
Me: Yeah. Yeah, yeah, of course.
Them: Um, okay. See, again, I think we can get smarter on this, but for now we'll just change the numbers. Um, because I don't
Me: So in your opinion, what would you like? Class— this is obviously classroom-based. Right. Like the activity.
Them: Yeah.
Me: Maybe program-based and not so much classroom-based, but yeah.
Them: Program-based, program-based.
Me: Um, but how would you classify a student as, um, highly like attended? Oh. Versus completely neglected. Like, is it just the note number? I mean, I don't know what else information we have to work with.
Them: See, think about it as the report readiness. A version of that showing up here. Right, um, if you did report readiness, uh, monthly, like we created a monthly report and did monthly report readiness, that is the true metric.
Me: Okay, this report readiness evaluates notes.
Them: Right. Oh.
Me: Right, and says how ready is the student for some— for the report.
Them: Yes. I see. Yes. Yes, exactly. And that is the true sort of single evaluation.
Me: Okay, so you want something like that here where month to month. Or some time period, we have a function that runs. That evaluates the notes, but not with the goal of.
Them: Yeah. Yeah.
Me: Generating a report rather. Checking for completeness and attentiveness. Like how, how well they attended to.
Them: Correct.
Me: Right.
Them: Correct.
Me: Okay.
Them: Correct. Correct.
Me: Okay, so this becomes instead of a dump stats highlighter. Like a function that runs. Where we intelligently fetch notes and like just aggregate them.
Them: Yeah.
Me: Right.
Them: Yeah.
Me: Mm-hmm.
Them: Yeah. I mean, I think that's the way because I think the original setup was to ensure no child getting missed. I think we're beyond that stage now, right? Now it's about quality of observation. Breadth of observation for a single child. We are worried about other things now, about quality. So we have gone a little bit beyond the quantity stage. Right. And so if quality is important, then we have to report quality.
Me: Okay. So how would you— what? Quality metrics would you want to see? Um, in this page.
Them: Just like reported NS, we'll collapse the individual. Things into a single number of some kind. Right, in when you do report readiness, you get a bunch of things, no, whether the breadth is covered and which is not covered and all of that. We'll take that, we'll take quantity and we'll create one number.
Me: Yeah. Okay. I'm trying to open Report Readiness. To see what all it highlights. All right. Mm-hmm. Okay. Some bit of quotes.
Them: Okay.
Me: Yeah, it talks about sentiment. Balance and just highlights missing data. So like 3 fields.
Them: Yeah. Yeah.
Me: So you were talking about some sort of aggregate function, right? Highlight some numbers and completeness and
Them: Yeah, because we, at the end of the day, on the stats page, we're showing only one metric. And again, we can revamp that. So I'm coming from what will help the teachers, right? The teachers, it will help them if, uh, they know which student they have not given enough observations on a single dimension.
Me: And what is, what is that dimension?
Them: That's what will help.
Me: Like, what are the dimensions?
Them: Any of, any of the dimensions on the report readiness check. Right, so it could be that Hindi has not been done. It could be that technology and research practice are underrepresented, whatever, right?
Me: Oh, the— oh, those categories. It's not
Them: See, that's because the teacher— there's a real problem the teachers have, no, which is that over 30 days they don't really know across all teachers, have we observed a lot on this dimension or not? There is no way for them to know that.
Me: And that's the issue. We have the data, but we're not— oh, so are you talking about these categories in the monthly plan? So language, sensorial, math, practical life, and grace and courtesy. I mean, this is specific to survival.
Them: Yeah. Okay, that's for primary. You can look at the term report readiness only. See, those are the, the term report readiness. We flag a bunch of things when you run report readiness.
Me: I think we're— I mean, I'm looking at report readiness right now. And the UI shows only— oh, you're talking about the missing data. Okay, so social.
Them: Missing data, yeah.
Me: Emotional development. Creative and physical development, Indian languages, cultural studies.
Them: Yeah.
Me: So 4 for primary.
Them: Yeah. Yeah.
Me: And I think this, if I remember correctly, is again program-based. Right.
Them: Yes, it is program-based.
Me: Okay, so if I go to reports for All Stars, so adolescent. Creative arts, physical development. Technology. Research practice. Okay. Okay, so I'll extract the dimensions from there. And Okay. Okay, so I'll think about how to serve that, whether it can be something that's together.
Them: See, the ideal place for that is actually on the student profile.
Me: I'm blind.
Them: Right, it is on the dashboard of the student.
Me: So on the dashboard.
Them: Where that— yeah, where there is. You know, it's getting captured there where every term we refresh and go to zero. Right, and then month 1 of the term happens. We do a review and a number comes, or this data shows up.
Me: And the term is June 1st, like that split stubs.
Them: Right, at end of, let's say, June 1st. Exactly. Yeah, yeah, yeah.
Me: So, okay. So term is academic year, basically.
Them: Yeah. By 2 or by 3. So we'll give you term end, term start, term end. So June to— like now you're doing term reports, no? So June to October is one term.
Me: Okay, okay. So terms, 3, 2 to 3 terms per academic year.
Them: Right.
Me: Like June to October, October to March, I think, right?
Them: See, because what is our objective? Yeah.
Me: And then March to— that's the summer where student cohort is small.
Them: Yeah. Yeah. Yeah. Yeah.
Me: But we still want to evaluate.
Them: Yeah.
Me: Okay, okay. So 1, 2, 3.
Them: Yeah.
Me: And each like this readiness score. General readiness score is reset. Okay. Is it? Is this separator that's there in October and March between terms? Fixed every year, or is it?
Them: No.
Me: It. Okay.
Them: It's very good.
Me: Okay. And that's a call you make based on however the classroom is going.
Them: Yeah. You know, it's based on when Dasara is and all. It's literally like it's not in anybody's hands.
Me: Okay.
Them: Right. Yeah.
Me: Right.
Them: No.
Me: Okay. Yeah. So in that case, do you see report readiness moving out of the reports page and into student dashboard, or do you see 2 different types?
Them: That's ideal. Yeah, no, that's ideal actually. See, we see the way we did report readiness was we kind of worked backwards from what we were seeing, right? We saw that teachers were generating a report, then they are waking up Saying something is not there, then we got this feature in. Now imagine if it's an ongoing perennial feature, right, where we just— it's just there.
Me: Yes. Okay. Okay. Okay, so I'll brainstorm how to serve that. In the dashboard, because the dashboard is already pretty. Jam-packed with information. Um, so I'll think about if there's space to add it in there, and if not, what do we drop off? You know, we'll have to come up with like a priority of things to highlight in the dashboard because that's, that is the home base for a student, right? So we want to be critical with what we show and what we hide.
Them: Yeah.
Me: So I'll think about that and then I'll come up with some more questions. Okay, but that clears up report readiness along with that student tab.
Them: Yeah.
Me: Um, so that student tab in stats can be rendered redundant and removed. Or do you want— still want that to highlight some? Quantity information.
Them: Um, see. The need for the teacher is if I'm a teacher with 50 children in my class. How do I know which child has not been observed well? I mean, I can go through all children one by one, that's one way. Right, but if there was a single page I could go to which told me in this class these are the children that are not observed. And maybe that's the email digest. Right, maybe that's where it goes.
Me: Okay, then stats page can be that aggregate readiness information. Stone dashboard is individual.
Them: Right, because we have all this information. Yeah. Wow. Yeah.
Me: And email is when we push to teachers. Like once a week.
Them: Yeah. Yeah.
Me: Okay, okay, that clears up a lot. Um, but yeah, that's all the questions I had for practice assessments. Um, one second. What else did I have to update you about? Oh, shoot. I was thinking about how to come up with a function for the AI per student cost report. And in thinking about what the end product looks like, the MD file or PDF, whatever. Format we.
Them: Mm-hmm.
Me: Decide to put it in. There will be a headline, so total spend. Active students and, um, yeah, total spend and active students, then a per-child ledger. That is grouped by branch, then program, and ultimately class home. And then we split it amongst, uh, based on each pipeline.
Them: Mm-hmm.
Me: Tokens in and tokens out. And ultimately cost associated.
Them: Hmm.
Me: For each student. And then a pipeline total.
Them: Mm-hmm.
Me: Like Across all students. And finally, unattributed spend. Because, um, The AI that we've used on a student who no longer exists, who's been exited. Like we don't want to show that as a current student, right? Like I filtered it out for active students so that all the miscellaneous things come into unattributed spend such as about like exit orphaned students or test bench spend.
Them: Yes. Yeah. Nice. Nice. Yeah.
Me: Or whatever I do in the backend. All that testing.
Them: Yeah.
Me: So that is one sync for everything else. But this is what I'm thinking for BYOD. Networks.
Them: Sounds good.
Me: So there's still a lot more to add, such as analysis and then patterns and per teacher. Thing as well, you know, how much they invoke. But that I'm thinking I'll defer to version 2. So headline, purchase ledger, pipeline total, and unattributed spend. 4 big items.
Them: Let's go ahead. It's good enough.
Me: Okay. Um,
Them: And when you say per child ledger, will it call out per? Process ledger, like in the sense that per child for baseline report it's this much, for term report it's this much, for baseball card it's this much.
Me: Yes, yes. Yes. Yeah, per purchase ledger is, yeah.
Them: Okay.
Me: Branch. Program classroom. Uh, per pipeline. Tokens in, tokens out.
Them: Yeah, okay, sounds good.
Me: Yeah. Um, yeah, and finally, I, um, I think everyone is now talking about Jeff, like that is all I see on my LinkedIn and YouTube.
Them: Yeah. Yeah.
Me: Um, and they've opened it up to everyone. Um, yeah.
Them: Yeah. I have access, yeah.
Me: The— it's, it just seems crazy, like output tokens are free, input tokens are dirt cheap. Um, and especially like you mentioned, especially for our case.
Them: Yeah.
Me: Um, because we're predicting most of the things, there's like a good split between generated content and flag prediction, right? Classification and classification is where like this.
Them: Yeah. Yeah. Yeah.
Me: Jeb comes in because it's tuned for calibrated decisions.
Them: Yeah.
Me: So There is an obvious expenditure saving we can get. We switch over to Jeff. I don't know if we should switch to everything. Like, should we wait? to expose some of the bad things about Jeff because right now it feels like it's such a hot topic and everyone is moving to it. Um,
Them: Um, yeah, I think that, uh, I don't think we should move like a lot of stuff, but I feel like it's, it's an option for us to consider for things that we are Going to build. I don't want to touch things in the past so much. There I feel the savings— I mean, maybe small things, no? Like, I feel like, like reported in seems like a thing to send off to Jeff.
Me: What? Yeah, and if that's something, then I'm going to update now.
Them: But yeah.
Me: I think I'll try it with Jeb this time around.
Them: Okay. Yeah, so like that, I think.
Me: And then based on that, if that looks great, and then we'll propagate it to the rest. So we'll start off with report. I'll start off with that.
Them: Yeah, yeah. Yeah, yeah, exactly. And I feel like, so a lot of those things I feel we can use. I think for generations, maybe we have to go to, I don't know, one of the cheaper models. Like once when I see the numbers, I'll get a better feel.
Me: Yeah, yeah.
Them: Right, I don't know, it's maybe like $1 per report. Like, I don't know what is— I'm not getting— I don't yet have a good feel. Right, if I'm generating a 5-page report, right, I don't know. Maybe it's not $1, maybe like 20, 30 cents.
Me: Yeah. Yeah, I mean LangFuse. Has everything. Um, What you can do. In an ad hoc sense is. Open up your Claude and in this code base, and it has access to the LangFuse MCP. LangFuse is the platform where we log Everything the LLM receives as input outputs, if it thinks. You know what error it made. Full observability.
Them: Yeah.
Me: It also tracks.
Them: Mm-hmm.
Me: Like it says token in cost and token out cost. Right. So I think that is one place that exposes these things.
Them: Hmm.
Me: Hello.
Them: Hmm.
Me: I, speaking of LangFuse, I got an email. Saying we've reached our free tier limit. So that's, um, I don't remember where it is.
Them: Okay.
Me: But there's no— we can't avoid that because we are logging more and more observations. They cap. How much? Traces you can log. And we've breached that and we will continue to. Slowly increase.
Them: Okay.
Me: So the first payment here is $29 a month. So I think we have to move to that.
Them: Take care. Yeah.
Me: So I'll add that on to the Claude subscription. Um, I haven't spoken to my parents about my compensation yet, so I'll get back to you on that.
Them: Yeah.
Me: Um, yeah, otherwise that's all I had to bring up.
Them: Okay, sounds good.
Me: So take care. I'll push out.
Them: Um,
Me: The structured assessments to all users. And There's still a lot of work I have to do with the medical assessments, and now we spoke about this. Report readiness becoming more generic. So I'll start looking into that.
Them: Yeah.
Me: And practice notes too. Now that I have clarity on that, it should be straightforward to implement.
Them: Good call. Yeah, that's straightforward. There I have to give you the, the line items.
Me: The dimensions.
Them: On the branching.
Me: Yeah, so your takeaways, I'll start sending you like a takeaway list on WhatsApp.
Them: Dimensions.
Me: Because I also forget what I need from you and then it only comes up in the next week's meeting, which is very inefficient, like once a week. So I'll, like, I log all that information locally.
Them: Yeah. Yeah. Yeah.
Me: A mental note to send it to you. But I think for now, for you, it's some medical PDFs for me to take a look at along with these practice note dimensions.
Them: Yeah. Yeah.
Me: I think that's it.
Them: Yeah. That sounds good. Okay. Sounds good. PDFs I'll send you. Yeah. I don't know whose I sent you, but I know I sent you a couple.
Me: Yeah. Cool.
Them: Open router, tell me, do I have access? It's on, it's on which account?
Me: Uh, it's on my private account. Yeah.
Them: Acha, okay.
Me: I, I mean, I've— yeah, I made a mistake when I created the account. Um, but I'll, I'll work on transitioning, switching it to, um, the PepSchool account. That's something I have to look into.
Them: Take care.
Me: Yeah.
Them: Okay.
Me: Okay.
Them: Cool, man.
Me: All right.
Them: All right, thanks. See you. Bye-bye.
Me: Let's see. Bye.
Them: Bye.
