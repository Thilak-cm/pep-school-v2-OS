---
type: meeting_record
title: Assessment upload structure and editability for retests and absent students
date: 2026-09-30
participants: [Thilak, Rahul]
source: Granola
areas: [assessments, baseball-card, media, ai-pipelines, soul-generation]
topics: [assessment-criticality, assessment-editability, student-pool-lock, your-assessments-page, writing-analysis-context, worksheet-media, soul-context-compaction, cost-report]
status: issues-drafted
issue_refs: [313, 314, 315, 317]
takeaway_count: 4
thilak_takeaway_count: 3
rahul_takeaway_count: 1
---

# Assessment upload structure and editability for retests and absent students

## Meeting Notes / MOM

### Assessment Criticality and Baseball Card UI
- Criticality flag embedded in CSV metadata (e.g. `criticality: high/low`)
  - Default to low if absent; high-criticality assessments surface prominently
  - Term exams = high; random quizzes = low
- Baseball card to show critical assessments as an expandable section (not a new tab)
  - Scrolls below existing stats/line graph ("notable assessments" bar that expands)
  - Displays title, result, and value only
  - Filtered to high-criticality entries, roughly last 6 months
  - Rahul framing: reclaim the baseball card's roots - "a set of numbers," like a cricket player's economy rate/average

### Assessment Editability and Student Pool
- Two edit scenarios identified:
  - Absent student completes assessment later: absent value upgrades to a grade + date (THE critical feature per Rahul)
  - Student retakes assessment: new attempt recorded chronologically (lower priority)
- Student pool locked ~2 weeks before each assessment; no additions after lock
  - All eligible students listed upfront; absent = recorded as absent, not omitted
  - "Board exam registration" model - good discipline, business decision
  - New mid-year joiners are an acknowledged edge case, deferred
- Editability scoped to the uploader (teacher who created the assessment)
  - Edge case of teacher leaving = accepted risk for now
- "Your Assessments" page needed: teacher-specific view of past uploads with option to add attempt N or update absent to graded
  - Supports slow-burn assessments (e.g. Yamini's reading assessments built up over 2 weeks)
  - Edits happen via non-CSV route (in-app: update grade + date only)
  - Assessments are classroom-agnostic; teacher's student pool = all classrooms they have access to
  - UI design to be brainstormed (multiple wildly different alternatives via Claude Code Design)
- Yearly assessment battery model: Q1/Q2/Q3 per level, every eligible child has a data point (grade or absent)

### Media Notes and Writing Analysis
- Current media pipeline walkthrough: image uploaded, LLM tags it (activity type, material, freeform) + teacher comment saved
  - Writing analysis runs monthly: feeds prior analysis + images + metadata + teacher comments to LLM, returns ratings/summary/action items
- Gap identified: teachers (e.g. Amrita's note) feel writing analysis is missing context; output not well understood
  - Rahul's hypothesis: insufficient context on how writing was captured is shared with the LLM
  - Rahul wants to spend time understanding current media processing first
- Future direction: worksheet-style media where LLM compares student answer to a ground-truth question
  - Flagged as a bigger project; deprioritized for now

### Soul Generation Context Assembly (post-meeting voice addendum)
- Change context assembly: previous month's soul + only new notes since that soul's generation
  - Replaces current 365-day notes window (induced memory compaction)
  - Confirmed in code: soul.js already passes previous soul; the change is shrinking the notes window
  - Primary motivation: large soul generation cost reduction

## Decisions

- Criticality is binary (high/low), carried in CSV metadata line, default low when absent
- Baseball card surfaces critical assessments as an expandable section below stats, NOT a 4th tab
- Student pool per assessment is locked ~2 weeks before; no additions after lock
- Assessment editing is uploader-only; additive edits (absent-to-grade, attempt N); grade + date are the only editable fields
- Absent-to-grade upgrade prioritized over retest support
- Rahul creates a battery of 10-12 hardcoded Excel formats; teachers never invent formats
- Worksheet ground-truth comparison deferred
- Soul context moves to previous-soul + delta-notes model

## Post-Meeting Reflection

### Thilak's Explicit Takeaways

#### Takeaway T1 - Send AI cost report this week
- Commitment: "This week I'll send you the cost report."
- Why it matters: Longest-carried takeaway (origin 2026-08-20); Rahul called costing "important" again; now has an explicit within-week deadline
- Expected deliverable: Cost-per-child report v1 delivered to Rahul (structure approved 2026-09-23)
- Tracking refs: #241, #265
- Completion evidence: Report generated from Langfuse/provider data and sent to Rahul
- Baseline at meeting close: 10% (structure approved, data pipeline not built)
- Next-meeting follow-up: Was the report sent and did Rahul review it?
- Carry forward: Yes

#### Takeaway T2 - Show baseball card critical-assessments UI at next week's meeting
- Commitment: "I can show a UI to you in the next week's meeting."
- Why it matters: Blocks the criticality display loop; Rahul starts uploading data himself meanwhile
- Expected deliverable: UI mockup of the expandable critical-assessments section on the baseball card
- Tracking refs: #313
- Completion evidence: Mockup shown to Rahul at the first-week-of-October meeting
- Baseline at meeting close: 0%
- Next-meeting follow-up: Present the mockup
- Carry forward: Yes

#### Takeaway T3 - Brainstorm "Your Assessments" page designs
- Commitment: "I'll do some brainstorming with maybe Claude Code Design, come up with 10 different, wildly different alternatives" + "I'll brainstorm potential edge cases and if anything seems like a real roadblocker I'll bring it up to you"
- Why it matters: Core UX for assessment editability (absent-to-grade, attempt N); Rahul flagged the design as "quite tricky"
- Expected deliverable: Design alternatives + edge-case list; roadblockers escalated to Rahul
- Tracking refs: #313
- Completion evidence: Design alternatives reviewed with Rahul; converged direction recorded
- Baseline at meeting close: 0%
- Next-meeting follow-up: Walk through design alternatives and edge cases
- Carry forward: Yes

### Rahul's Explicit Takeaways

#### Takeaway R1 - Define assessment format battery with criticality levels
- Commitment: "I'll create those formats for them... a battery of 10, 12 Excel files" + "I have the data. I'm going to do it myself. Start, and then we'll see what's the best way to do this with them."
- Why it matters: Teachers must not invent formats; criticality metadata and the whole prioritization scheme hinge on these formats existing
- Expected deliverable: Format definitions with criticality levels; Rahul begins uploading assessment data himself
- Completion evidence: Formats exist and real assessment data uploaded by Rahul
- Baseline at meeting close: 0%
- Next-meeting follow-up: Are formats defined? Has data started flowing?
- Carry forward: Yes

## Drafted Issues

Created:
- #313 - Assessment criticality, baseball card section, and Your Assessments page (feature, P1-urgent) - combined per Thilak's direction: criticality flag + baseball card section + Your Assessments page must land hand in hand
- #314 - Soul generation: delta context (previous soul + notes since last gen) (improvement, P2-high)
- #315 - Writing analysis: share capture context with the LLM (improvement, P3-normal) - supersedes #155, which was closed
- #317 - Worksheet media: compare student answer to ground-truth question (feature, P4-low, Icebox)

Augmented: none.

Skipped:
- Cost report send - already tracked in #241 and captured as takeaway T1
- Rahul's assessment format battery - Rahul-owned takeaway R1, not a system issue

## Clarifications

- Thilak chose to merge the criticality flag, baseball card section, and Your Assessments page into one issue (#313) since backend + UI must be designed together and the Your Assessments brainstorm benefits from the full context.
- #155 closed as superseded by #315 per Thilak's instruction.

## Open Questions

- Exact criticality metadata syntax in the CSV (key name, allowed values)
- How attempt history is stored on the observation doc (schema for attempts[])
- Mid-year joiner handling once pool-lock ships (deferred)
- What "context on how writing was captured" should be added to writing analysis inputs

## Raw Transcript

Chat with meeting transcript: https://notes.granola.ai/t/4887b853-7740-4594-bc7d-57d5d4320c84
Meeting Title: Assessment upload structure and editability for retests and absent students
Date: Sep 30
Meeting participants: Thilak (Me), Rahul (Them)

Me: Like hierarchy. Right, importance level that we either define as like a scale of 1 to 5 or some categories, or like teacher has to offer that information.
Them: Yeah, and it's teacher, it's basically me, uh, but because I'll create those formats for them. But basically it's like, it's just intuitive that a child may do badly on random quiz and that's okay, but if they do badly on like, let's say, sort of a term exam, that's very different. Right. And I think that needs to be Captured in some way that there is a lot of. Formative assessment that we do as part of normal work. Where we want to record it using the assessment tool, but maybe that's not as critical as more summative assessments where you're trying to judge where the child is today. Okay. You understand? So I think that that's, that's what I'm getting at.
Me: Who are the teachers that upload? Like structure and like now it's open to all teachers. Right.
Them: Yeah.
Me: Like even like teachers, classroom admins, and of course you.
Them: Yeah.
Me: Is there something like only classroom admins upload the critical ones, or that's nothing like that?
Them: No, could be anybody. Could be anybody.
Me: So
Them: Be anybody. Basically the plan is, it's almost like I'll create a battery of 10, 12 Excel files. And I'll say for this assessment, go use this file so we can hardcode a lot of things. Yep. Right, so that they are not inventing formats on the fly beyond. I mean, very basic things. But I think when I'm thinking now, it's sort of making sense that as we start using this, we'll suddenly get tons of data. Yeah. And the system needs a way to prioritize.
Me: Okay. Okay. Yeah, in that case we can have a critic— like criticality flag. Or something like that, right? Severity, whatever we choose to call it.
Them: Yeah. See. Yeah, to start with, we could just say we can hardcode that into the metadata of every CSV that we are uploading as assessment.
Me: Based on the format.
Them: Right, it's almost like Yeah, because in the metadata is going to come right at the top of the CSV file, no? So there I can always put one line as criticality colon something.
Me: Yeah, based on the assessment format. So if it is a random quiz, then low.
Them: Right. Yeah.
Me: And if it is a term exam, then like critical.
Them: Yeah. Yeah.
Me: Right.
Them: Yeah. So it's almost like, and then we can leave it. Quite straightforward to say, just look for a criticality flag. If nothing is there, treat it as low. If something is there, treat it as high. I mean, whatever. If it's high, then read it as high, something like that. Uh, the baseball, baseball card then displays everything that is taken as high. Maybe over the last 6 months order.
Me: So in that case, so like we spoke about how baseball card now sort of represents like multiple tabs, right? And like writing. Weekly snapshot and monthly plan. The weekly snapshot is like a 4-month summary, running summary.
Them: Yeah.
Me: So is writing analysis, but specific to writing.
Them: Yeah.
Me: And now you want that That baseball card structure. Which occupies like maybe 70% of the screen. To watch a show. Critical assessments if they are present.
Them: Yeah, because that's what a baseball card is at the end of the day. No, the baseball card is like a set of numbers. Like the original baseball card, like in the historical sense, right?
Me: Yeah.
Them: And I think we would kind of reclaim those roots in a way, right? Now though, the numbers are coming.
Me: Okay. Yes.
Them: Right. Do we put the numbers there?
Me: So you— are you envisioning replacing weekly snapshot? Adding a 4th tab. Like adding a 4th tab to primary and toddlers and a 3rd tab to elementary and adolescent. Elementary or adolescent don't have monthly plans. Right.
Them: Yeah, no, I think it could be like you could just scroll down a little bit. Right. That's why when we looked at it, there was something, there was the notes over time, the stats. Line graph. Something over below that saying notable assessments. And then we get to see all of that data there.
Me: Oh, okay, so
Them: Like a card, it's like a card there.
Me: Okay, let me share. Screen. Yeah, can you see my screen?
Them: Yeah, so literally it's, it's, yeah, like that.
Me: So something like a— not sort of a tab, but another bar that you can click and it expands.
Them: Yeah.
Me: Okay.
Them: And just shows critical assessments.
Me: Okay, so that's just filtered for critical assessments.
Them: Correct. Correct. See, it's almost like if, you know, teacher, if I want to know roughly this student, what is their main data, like in cricket, I'll want to know, okay, what is this guy's economy rate, what is this guy's average, that's all I want to know. Right, it's like that. Right, so that only shows up here.
Me: Okay. Right. Yeah, that depends on— like, the first thing we would need is for you to define each format type. And then in the meantime, I can start working on the UI for that. Like the UI, I mean, I already have enough.
Them: Yeah, anything? Very loosely. Yeah, very loosely. If you click Assessments, um, what this will have is just the title. It will have the result and the value.
Me: Yeah.
Them: It need not even have— yeah.
Me: Yeah, I think from my end, I know what the UI, the schema is going to look like, at least roughly.
Them: Yeah.
Me: I think for the teachers to start uploading notes, you need to send it to them, right?
Them: Yeah.
Me: Yeah.
Them: Yeah, no, that I will do. See, I have the data. I'm going to do it myself. Start, and then we'll see what's the best way to do this with them.
Me: Okay. In that case, I can I have a sense of what the data will look like, so I can show a UI to you in the next week's meeting.
Them: Yeah.
Me: Okay.
Them: Tell me one thing though, if I've done an assessment, um, and somebody was absent. And, you know, they went off for some 2-3 weeks, they came back 2-3 weeks later, and they took that same assessment. Now, um, what do I do? Like, and I've already uploaded the old assessment, can I just add this data? Or because, like, yeah, I'm just curious.
Me: So this is a common case, I would imagine. Where teachers, students take a leave.
Them: Reasonably— no, or yeah.
Me: And come back and give an assessment like that is. Like give a backdated assessment. Like assessment date is in the past, but given assessment given date, like assessment assigned date is in the past, but assessment given date is present because they were on leave.
Them: Correct. Yes. Yes.
Me: And you would want the ability to?
Them: Yeah.
Me: As opposed to like the, like one thing to do is just add a whole new assessment, but then that treats it as a whole new thing. Right, with repeated information such as assessment name and criticality and whatnot.
Them: Yeah.
Me: And of
Them: Yes.
Me: Opposed to doing that, you want to be able to edit. Saying, okay, there was like A new student who like missed out on last week, right?
Them: Yeah.
Me: So on the first upload, that's absent student wasn't present at all.
Them: Yeah. Yeah.
Me: So you want editability, but only in an additive sense.
Them: Correct. Absolutely. That's right.
Me: And any teacher can do this.
Them: Yeah, I mean, that's the best case.
Me: Okay. So editability is present, but only when you want to add a row. And that means add a student for whom they missed.
Them: Yeah.
Me: When the exam was given and now they're being updated because they gave it.
Them: Correct. See, I mean, think about it a little differently, right? I think the— there are different kinds of assessments. There's one assessment which is like a paper where all students take it or supposed to take it simultaneously. Okay. Another kind of assessment where, let's say, I want to evaluate your reading. Uh, so one day I'll come to you. The next day I'll go to your friend. Maybe one week later I'll go to a third person. A month later I'll go to a fourth person. I'm doing the same assessment with you. But I'm not doing it simultaneously. I'm doing it over a period of time. Right? You understand what I'm saying? So, and hence the— it's, it's, it is the same assessment, but it's not contemporaneous. It's, it's not simultaneous. It is happening over a period of time, but at the end of that period of time, whatever it is, it could be 1 month, could be 2 months. Dope. Data is together. Right. Because then from a school point of view, we want to be able to click that assessment and then see all the children there.
Me: They missed. Wait, so what I understood was Let's say for Vedant, we've given him 3 different types of assessments so far. What is given?
Them: Yeah.
Me: 10 different. Actual assessment tests. So there's— and under each assessment type, there's like history.
Them: Yeah.
Me: And is that what you're talking about? Like he gives it.
Them: Uh,
Me: Assessment A, then B, then C, then A again.
Them: No.
Me: Is that what you're talking about?
Them: Yeah, let's maybe look at it in like a real case. Now let's go to assessments. Let's open that particular assessment. Um, save, let's say view assessment. Um, okay, so now this has happened. Okay, so one case is a retest. Where the same assessment is given again to Vedant, okay? Uh, and then let's say he gets a different grade. So the question comes as, how do I record that? Second is, uh, let's say Sandeep was absent for this test. And I need to now add Sandeep's data to this test. Because I need to see how does Vedant stand with respect to Sandeep. I need to see this lineup of children who are supposed to have taken this test, right? Uh, so both I need.
Me: Okay, okay, so you're talking about So, okay, let's talk about Sandeep's case first. I think that might be easier. So if a teacher goes to assessments over here, there's an option saying Logging an assessment for like a student who missed it.
Them: Yeah.
Me: You know, like logging an assessment for a student who was absent when it was given. Some sort of thing like that where it takes them to like a UI where they select a past uploaded structured assessment and they can add a new row there. Okay.
Them: Yeah, exactly. So it's almost like if there was a place where all the assessments I as a user have uploaded, I can go back and add to.
Me: Oh. Okay, okay. So now you want like uploader-based view.
Them: Uploader. Let's keep it simple. I think that's the simplest. It's uploader-based. Right, um, so an uploader, and it works very much like, for example, like Yamini, right? She'll go to a lot of reading assessments. She does it over 2 weeks. Right, she'll go and, you know, assess somebody's reading, 4-year-old's reading on Monday. She'll upload some data. Assessment is continuing still. Then the next day she'll come, she'll add some rows. The next day she'll add some rows. some more rows, and then over, uh, 2 weeks, all of the data is added.
Me: Okay. Supposed to separate. Assessments. You want one that is growing through time.
Them: Yeah. Yes.
Me: Okay, so if a teacher comes to add assessment, it should be unique to them.
Them: Yes. Yes, Thilak.
Me: And it should say, do you want to update? previous assessment you've created, or do you want to create an altogether new one? And that first option should show their history.
Them: Correct. Yes. That would be nice, actually. Maybe that is the way to go.
Me: But that doesn't allow, let's say my mom took reading assessments and another teacher is filling in and wants to update that.
Them: Oh. So let's reduce that then. Let's keep life simple. Let it be at— see, at the end of the day, I think it's reasonable for us from a business point of view to assume that the person who's uploading one assessment is the same person who's going to edit the assessment. Right. We will have some crazy edge case. Like what if that teacher leaves? Right. I think that is, we'll deal with that. We'll figure it out. Right. But that is really an edge case. Like otherwise, even in high school, like the chemistry assessments, the chemistry teacher only will add, right? It's not like some random teacher will come and add it. Right, so it's okay.
Me: Okay, so per— so in this, in this page then. There'll be a section saying, you know, want to upload a previous assessment. Update a previous assessment. And it shows their history.
Them: Yeah.
Me: Of things they've uploaded.
Them: Yeah, but again, this is new, no? Because this is, it's almost like the timeline. Assessments uploaded by an adult. Like, we don't have a page like that right now.
Me: Yes, we do. Yeah, because we, we don't have any page like that in the app because this is a specific note type. Like, it's basically a timeline filtered by a teacher. Filtered by structured assessments.
Them: Yes. Correct.
Me: And the place.
Them: Correct.
Me: Where that timeline lives. Is naturally in this add assessment area. Because the only reason you want the timeline is to update it.
Them: Yeah.
Me: I'm sure you want to view it too.
Them: Yes.
Me: But primarily to update it.
Them: Yeah. Yeah, so it's almost like these adults have an assessment home.
Me: Okay.
Them: Right.
Me: Okay. Okay. Okay, so like your assessments, some sort of your assessments UI.
Them: Yeah, correct. Correct.
Me: Okay.
Them: Yes, yes, yes, yes. And yeah, can I just say, think about it, maybe then all of this should just be restricted to classroom admins. Right. And then, you know, let, but again, not classroom admins because I think that breaks in middle school.
Me: Yeah, I don't think there's an issue.
Them: Uh, no, let it be anybody. Let it be anybody. Let it be anybody.
Me: Okay. Expanding it to anyone.
Them: Any user.
Me: I'll need to think about how to serve it.
Them: Yeah.
Me: Do them. I'll do some brainstorming with maybe Claude Code Design, come up with a few, 10 different, wildly different alternatives.
Them: Yeah.
Me: You know, go down a rabbit hole from there. But that's one alternative, right?
Them: Yeah.
Me: You mentioned 2 things you want to do. Update a preexisting. Structured assessment, right, based on your, based on your past uploaded assessments, you as a teacher.
Them: Yeah. Yeah.
Me: And another thing you want to do is
Them: Yeah.
Me: Uh, So what did you say? I think it's one was
Them: Oh, if somebody takes a retest, what happens? I think maybe that's a tougher problem. Maybe that's not there. Like, I don't know. Right.
Me: All right, if something's happening, just
Them: Maybe it's okay, right? His name just comes the second time saying, you know, same assessment, 2 grades come.
Me: Okay. What? Mm-hmm. What is wrong with just simply adding another assessment for that? Assess for that one.
Them: Because then we lose comparability. See, I'll tell you on the Excel sheet what it gives us. We are able to see, okay, this is how Vedant did last time, this is how he's doing this time, this is how he stands compared The rest of his class. We get all of that richness. I'm trying to get that richness into the app.
Me: Okay, okay. Okay, I think there should be a way to do that within this view assessment. Table. Like each one has their own history and it shows like date given and then like chronological order timeline.
Them: Yeah.
Me: If they've retried the test.
Them: Yeah.
Me: Okay.
Them: Yeah. It's a tricky one. It's actually quite painful because now I'm thinking, okay, if I'm going to add a student to the same assessment, then at what point are you going to do the check and do the mapping with the actual student name and all that?
Me: I didn't understand. What do you mean?
Them: That's, that's non-trivial, right? Suppose I want to add student Abhijna to this.
Me: Okay.
Them: Right? So then how do I actually do it? Like if you're going to give me an on-app option, till now we've done all uploads by CSV, right? But now uploading on the app. It's going to be a bit painful, right? Uh, you'll give me a dropdown, is it? The result you have to somehow understand, you have to have the metadata, the UI depends on the metadata. I mean, it's an absolute nightmare actually. So in other words, the user still has to go and upload a CSV only. But there has to be some kind of an ID of the assessment. I don't know, you really think through this.
Me: Okay. Okay. Okay, so it sounds like there is like your Uh, I think there's a word for this. I think provenance, like source of origin or something. Let's say there is your canonical structure assessment, like the first time you upload this. Assessment. And then everything else is either an absent student being added. Or a student retrying the same assessment. Right. So you're not creating a new one, right? You're only editing it.
Them: Yeah.
Me: So let's say this is the canonical one, and then it says Ashmi Iyer, current grade E.
Them: Yeah.
Me: Total attempts 3, uh, Anik Reddy, current grade A*.
Them: Yeah.
Me: And then number of attempts too, and then with the dropdown and this and that. But yeah, the issue you're talking about is editability, right? Because we don't know if we can't provide an option. For teachers to pick from a dropdown. It has to be freeform in that case. The only thing the teachers would want to update is the grade.
Them: Yeah.
Me: Right, and I guess the date.
Them: Yeah, red and date.
Me: Yeah. So in that case, it should be possible to do it. Via non-CSV route. Because let's say we come up with a UI to say, okay, this student retried. I'll click some button over here. And then under grade on A* to F scale. Enter latest grade and then. Latest date given, something like that.
Them: Yeah, I mean, and then you can say add student also if you're going down that path, you can.
Me: Or yeah, exactly. Add student as another button here. Yeah.
Them: In that sense.
Me: Okay.
Them: Yeah, but then each, uh, Yeah, I mean, I think, but all of this is bounded by classroom. Right. So each assessment is mapped to a classroom, I'm assuming. Like, I don't know how you have set it up. Like, can a teacher who's in 3 classrooms have the same assessment with children from all 3 classrooms? Because the mess starts happening there.
Me: Uh, it's yes.
Them: Yeah, it's classroom-bound.
Me: So nothing is published.
Them: It's bound by classroom.
Me: It's
Them: Like, can I have an assessment with one child in one class and another child in another class?
Me: Yes, I think so. Yes, yes, that should be possible. This classroom optional is just— this was born primarily to help you.
Them: It's not possible. Like,
Me: A super athlete.
Them: Yeah, I understood.
Me: With the reduction of the pool search. But beyond that, there is no enforcement of sticking to one classroom.
Them: Understood. No, understood.
Me: Yeah. But naturally, the only students that a teacher can search amongst, like a student pool, is their purview. So whatever classrooms they have access to.
Them: Understood.
Me: So these are
Them: Got it. No, no, then maybe like, see, we could also implement a system where every child who's eligible for an assessment, their data is uploaded. If it is absent, we write there absent or not done yet. Or NA or whatever. Which means the only option then in that world is for the teacher to edit.
Me: Yeah, so that hinges on teacher adding the comprehensive student list at the start.
Them: Yeah, but what if a new child joins in the middle of the year? Right. I mean, like, so you will have these cases, right? I mean, it, it, there's a reason why Excel is popular, no, because it's just easy to add and remove.
Me: Yeah, so in— I've given that.
Them: Um,
Me: Comfort in the Excel sheet. If we come up with a way to mimic that over here. So in assessments or in a teacher's assessment view, let's say we come up with it in a new page. It shows over here. And in that, in the teacher's assessment upload view, this is what they see. And then they can add, they can see add student or like update attempt, like attempt number 2, attempt number 3, or whatever.
Them: Yeah. Yeah, I think, yeah, I think that's, it's worth thinking through. I think it's quite tricky actually.
Me: Okay.
Them: Um,
Me: Um, yeah, I mean, Granola caught it, so I'll brainstorm. Potential edge cases and if anything seems like a real roadblocker. Then I'll bring it up to you and then we can boil it down to something simple. Otherwise, I think we can come up with something pretty clever. And intuitive. Because the linkage between assessments is crucial. Right. For that. Like traceability through the past.
Them: Yeah. Yeah, I mean, I think the way we're thinking about assessments is that there are a set of assessments that happen every year. For every level of child. Right, and every child in that level must have some data point corresponding to those assessments. So even a 4-year-old will go through 3 assessments in the year. Right. So, um, you understand what I'm saying? So it's, let's say quiz 1, quiz 2, quiz 3. Um, and we'll, I think it's actually very good. It will help the system a lot. Because we'll have Q1, Q2, Q3, and we will define the list of children who are eligible for Q1, Q2, Q3, and if they're absent, they're absent, and that gets recorded.
Me: Yeah. Yeah.
Them: Right? Um, So I would not— maybe adding the student is really like only one new student. Just joins the program or something really crazy happens. But editing, I'm feeling, is actually the critical feature.
Me: Adding a second or third attempt.
Them: Right? And via this retest model.
Me: Right. So
Them: Adding a second or third attempt or absent becoming the first attempt?
Me: Absent becoming the first attempt happens on Like the first. Assessment upload of that type, right? Like the canonical assessment upload.
Them: Didn't follow.
Me: So you're talking about not allowing teachers to add a student in the future? Once they've fixed the pool?
Them: Yeah. Yeah, so Q1, quiz 1 for that year will have a pool of students. That pool is the pool. You can't change that pool. Okay, uh, it's almost like how if you register for a board exam, the guys who have registered get the paper. That's it, right? So we fix the pool, let's say, 2 weeks before quiz 1. Once that gets locked in, then quiz 1, let's say, happens over a week.
Me: Hmm.
Them: All the grades get established. If a child is absent during that week, then we record it as absent. But all children have some value. That quiz 1, it's either the grade or it's absent. And then that's uploaded.
Me: Okay.
Them: The teacher then gets to edit the assessment. So if absent person comes back and they do the assessment, absent value upgrades to, I don't know, B grade. Oh. With the data of when it was taken.
Me: Yeah.
Them: Similarly, a child does a reattempt on quiz 1 for whatever reason, we allow it, uh, then that also— even that to me is less of a thing actually. It is absent going to a grade that is maybe the critical feature.
Me: Okay. Okay. So you're suggesting fixing the student pool? And not allowing.
Them: Yeah.
Me: Addition.
Them: Yeah. I think that's good discipline for everybody in the school. I'm coming from a business point of view, right? Otherwise it's all too casual, right? We just add whenever we want, nothing to it.
Me: Okay.
Them: Right, these are the children, they are going to go through this battery of assessments, that's it.
Me: Okay. Okay. All right. So given that constraint, that simplifies it a lot for me. Then I can think about how to offer.
Them: Mm-hmm.
Me: Like my assessments upload page for each teacher. And they need to add like attempt 2, attempt, attempt N.
Them: Yeah.
Me: For a teacher.
Them: Yeah.
Me: For a student, right?
Them: Yeah. Yeah.
Me: Okay. So once This. Flavor of. Editability comes into assessment notes. What other Pieces missing for data collection. Because right now we have like up to 4 or 5 types. So voice lesson. Media assessments, and now assessments we're tweaking to make it a little bit more. Like, like chained. Time. Right, as opposed to purely independent.
Them: Yeah.
Me: So that is one change that's pending for assessments.
Them: Yeah, no, I think that would complete the data capture. I mean, the next set of data capture would be more around directly from the CCTV and things like that.
Me: Then lesson note practice, this is straightforward. Uh,
Them: Straightforward. This is there for group also.
Me: Yeah, of course. The group. Yeah.
Them: Okay, that's good. So that's also there. The— yeah, I mean, I think the next piece of work, I mean, one is of course the costing. I think that's important.
Me: Yeah.
Them: This assessment stuff we'll figure out. I think we're nearly there, maybe a couple of weeks. The other thing is I want to spend time on how the— now there's a lot of media that is coming. I don't have a handle on how that's being processed, right? Uh, I want to spend some time there, right? Because I, I, I've actually not— like, where would I check? Like, because again, I saw some Amrita's note also, no, that the media is like, sometimes it doesn't analyze it correctly.
Me: Right. Yeah. Yeah.
Them: Right. Something like that. Something to that effect. Right. I don't know actually, because I've not actually seen where it's getting processed. I— right. Um,
Me: Yeah, for us.
Them: I could spend some time on that.
Me: Yeah, I think, let me, let me show my. No, definitely. So can you think of a question that you would want to ask about media notes right now? Because then we can
Them: No, like if I— yeah, I think media notes, it's— see, again, the— I want to
Me: I think you're talking about how to extract more from media notes. Because that's now that we have data capture.
Them: Yes.
Me: Consistent and the volume is like.
Them: Yeah.
Me: Very high. What more can we do as opposed to just— because right now what we're doing is simply, I mean, I'll share my entire screen, but teacher adds a
Them: Yeah. Yeah.
Me: Yeah, can you see my screen? Yes, so media.
Them: Yeah.
Me: Choose file, they pick off, pick an image. No, that's side distorted. Yeah, it says analyzing image, and then all the image classifier does is tag it with like individual activity, group activity, what material it is, but that's very freeform.
Them: Yeah.
Me: There are no bounds there.
Them: Yeah.
Me: We've discussed the LM. Because we didn't know what exactly to explicitly ask it to look at, we just asked, okay, you give tags and save that as metadata. And along with comments. That's, that's all we're doing. So there is just photo tagging going on.
Them: So apart from photo tagging, then the writing analysis, if there is tagging going, saying it's handwritten, then the writing analysis is doing something once a month. Is it? Is that the model?
Me: Yeah, I'll show you writing an LSS and what the LLM thinks. So it gets the input, you know, your early writing, review multiple writing or pre-writing samples, blah blah blah. So that's the system prompt. Oh, it's not showing the images, but do you see this? So after the system prompt is done, uh, as, um, how we provide information is we give previous writing analysis. And then, uh, all the images. So Yeah, you see this. So this along with, um, uh, image 2 of 9, the date, curricular area, language.
Them: Yeah.
Me: Copied? No. Then second image.
Them: Understood.
Me: Along with, uh, number 3, copied, no teacher comment, EA words. So if I look at the image, Yeah, okay, EA words in Kannada. Yeah.
Them: In Canada. Okay.
Me: Yeah, I completely lost that, but this is all we do, and then we— so here the teachers added a long comment.
Them: Yeah.
Me: And we get a structured response. So this is what the LLM sees right now.
Them: Okay. Okay, understood. Right now, I think this— we have not— I think I have to really do more here. See, because as they go into the elementaries, for example, there's a worksheet where they will write an answer to. Right now, that's a combination of structured and unstructured data, right? There's a question and there's an answer that should actually be interpreted in a certain way. Um, you understand what I'm saying? Like, you can actually check if the answer is right. Right. I mean, it's not doing an assessment yet. But I think maybe that's the world we'll get towards.
Me: So one second, right now this is all the information that we show. So a bunch of ratings and summary and actionable items.
Them: Yeah. Yeah. Yeah.
Me: What you're suggesting is there's a flavor of media addition which is Worksheets. So they're not just image analysis. Situations, but rather Compare the answer to this. Ground truth. Question, like answer.
Them: Yeah. Yeah, yeah, yeah, yeah, yeah. So I mean, that it's context, no? So I mean, I feel like the, uh, that needs to be looked at in a certain way. I mean, it's okay that I have to think through. I think that's a much I think this is for me to get a sense of what we are doing right now, because the teacher view on writing is that something is missing here, right? It's not, it's, it's not giving us enough. It's doing something we're not understanding what it's doing. There is, there's some disconnect.
Me: Okay.
Them: Right on the writing piece. I think a lot of it is because enough context on how that writing was captured is not being understood or not being shared with the LLM.
Me: Okay.
Them: Right. We'll get to that. I think that, that I think is a bigger project. We'll get to it. I think right now we have these other priorities. Hey, sorry, it's 7. I have to go, go now.
Me: Okay. Okay. Let me— I think Yeah, whatever else questions I have, I'll shoot them to you. And this week I'll send you the cost report.
Them: Yeah.
Me: Okay.
Them: Yeah. That'll be helpful. Yeah.
Me: I'll see.
Them: Mm-hmm. Cool. See you. Thanks. Bye-bye.

[Post-meeting voice addendum from Thilak - Granola started late:]
Soul generation context assembly has to change drastically. Right now for each month we pass in past year's data and I believe previous month's Soul (confirmed in code: soul.js passes previous soul + 365-day notes window). We have to move to previous month's Soul plus new notes since that previous Soul's generation. This creates an induced memory compaction: the past 12 months get compacted into one Soul and the latest notes are added to create a new Soul. This should cut Soul generation costs drastically.
