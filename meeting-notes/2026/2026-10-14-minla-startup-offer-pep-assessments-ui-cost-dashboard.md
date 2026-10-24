---
type: meeting_record
title: Minla startup offer, PEP assessments UI, and cost reporting dashboard
date: 2026-10-14
participants: [Thilak, Rahul]
source: Granola
areas: [timelines-and-media, observation-capture, ai-tools-and-chat, admin-and-access]
topics: [assessments-page, your-assessments-ui, absent-vs-not-ready, pdf-question-paper, bulk-upload-api, hub-and-spoke-ingestion, medical-pdf-analysis, langfuse-cost-dashboard, coachpepper-multimodal, minla-labs]
status: issues-drafted
issue_refs: [313, 253, 255, 265, 327]
takeaway_count: 6
thilak_takeaway_count: 3
rahul_takeaway_count: 3
---

# Minla startup offer, PEP assessments UI, and cost reporting dashboard

## Meeting Notes / MOM

### Minla Labs Offer
- Offer finalized with Watson; Thilak starts Monday (2026-10-19)
- Minla Labs: stealth-stage revenue automation startup for service orgs (spas, dental clinics)
  - Takes booking data and staffing numbers, forecasts revenue, suggests and executes improvements
  - Full loop: launch ad campaigns as part of the improvement cycle
- 7th hire; team of ~50-year-old serial entrepreneurs with multiple successful exits
- 6-hour interview (9am-3pm); positive feedback with noted improvement areas
- Office in Palo Alto; commute or relocation likely
- Founder-funded; plan to raise Q1 2027 once self-valuation is strong; has the network but avoiding early undervaluation
- A few clients signed; payment status to be confirmed Monday
- H1B support promised; fallback options L-1 or Indian org

### Srivatsan Intro Email
- Intro email went to spam on Rahul's side
- Rahul to reply directly to Srivatsan to complete the introduction
- Context: mutual connections exist; Thilak made the intro reference when job searching

### Assessments Page Design (Your Assessments UI)
- Teacher view: list of uploaded assessments with criticality flags (high/low) and pending-student chips
- Clicking an assessment shows the full uploaded document as a scrollable table
  - Side-scrollable columns for multiple result types
  - Sort by column (ascending/descending) sufficient; no conditional formatting needed
  - PDF question paper to be viewable alongside answer data as a repository (embedded PDF viewer)
- Grade entry and multi-attempt tracking inline (e.g., 48% → 58% → 67%)
- Two distinct no-grade states confirmed:
  - **Absent**: child chose not to attend; grade expected later
  - **Not ready yet**: teacher's discretion; child not developmentally ready; more relevant in lower/preschool grades
  - Upper grades (9th/10th): absent rarely used; no "not ready yet" concept (if you're in class, you take the test)
- Edit permissions expanded: admins AND classroom admins can edit grades (honest mistakes like transposed digits)
  - Teachers: uploader-only additive edits (absent → grade, attempt N); unchanged from prior meeting
  - Admins: full grade correction
- Trends deferred: critical assessments happen only a few times a year; show latest grade only for now
  - Student dashboard chip shows latest critical assessment grade; no trend visualization yet
  - Trend design is a separate problem to solve once real data flows
- Priority: ship the assessments page first; refine student dashboard display after data accumulates
- Assessment grouping: don't force-fit monthly-plan dimensions (maths/reading/language/practical life) onto critical assessments; just use the assessment name as-is from the database

### Cost Dashboard Walkthrough
- Langfuse dashboard live; Rahul has access (rahul@pepschoolveto)
- Past month total: ~$250
  - Soul generation: $83 (largest; expected to drop ~4x after #314 context window optimization)
  - Report completion: $36 for ~450 reports
  - Coach nudge: ~$2 (chat stream pipeline)
  - Other: writing analysis, baseball card (4x/month), weekly digest, speech-to-text, PDF extractor
- Soul cost reduction math done in session: switching to latest-month notes + previous soul cuts input tokens 70-75%; $83 → ~$20-30
- Average cost per run: ~10 cents per soul (≈ ₹10/month per student); Rahul found this figure clear and sufficient
- Per-student ledger script: **moved to icebox** per Rahul's explicit decision - current dashboard granularity is sufficient
- Langfuse MCP tools exposed: Thilak's agent can modify dashboard without manual Langfuse UI config; Rahul also has access to do so
- Coach completion pipeline = the nudge pipeline (coach-review traceName in Langfuse)
- Weekly digest shows higher avg cost per run because it runs once per week per admin, not per student
- "agent-iteration" trace label noted as needing a better name (minor ops cleanup)

### PepOS as Hub-and-Spoke Ingestion Architecture
- Vision: PepOS is the central student data repository; AI-based apps (20+ potential spokes per program) push data directly
  - Examples: screen-based reading assessments, writing correction pipeline, oral assessment scores, meeting summaries
  - Goal: eliminate manual CSV bulk-upload step for machine-generated data; bulk upload becomes an HTTP API
- Firebase's unstructured DB is well-suited: varied schemas from different spokes can be accommodated
- External app can write either assessment data OR a text observation against a student (e.g., "child struggled with words of this type")
- Current workaround: Rahul manually triggers bulk upload after getting Claude to generate a CSV in the right format - this pain to be eliminated
- Rahul clarified: teachers keep their current UX; this ingestion layer is exclusively for agent/system-to-system data flows
- Human needs are ~80% catered to; this is the non-human ingestion layer

### Medical PDF Analysis
- Thilak to work on medical PDF analysis this week (issue: #255)
- Rahul's take: "that is easy, it's just a straight transcription" - already text data

### CoachPepper Multimodal Confirmed
- Confirmed: CoachPepper has media tools and uses a multimodal model; can analyze uploaded photos/handwriting
- Rahul to test image/handwriting analysis independently and report back by mail
- Use case: urgent writing feedback without waiting for monthly writing analysis run

## Decisions

- Two distinct no-grade states: **Absent** (child no-show, grade expected later) and **Not Ready Yet** (teacher discretion, child not developmentally ready); upper grades: neither concept applies in practice
- Admin and classroom admin can edit grades for honest mistakes; teachers retain uploader-only additive edits
- Assessment table: side-scrollable columns, sort per column; no conditional formatting needed
- PDF question paper embedded viewer alongside CSV data in assessment page
- Trends deferred - student dashboard shows latest critical assessment grade only
- Ship assessments page first; student dashboard display refinable once real data flows
- Assessment grouping: use assessment name as-is; no force-fitting to monthly-plan dimensions
- Per-student ledger script: moved to icebox - Langfuse dashboard granularity is sufficient
- Bulk upload to become an HTTP API for machine-to-machine ingestion (human teachers unaffected)

## Post-Meeting Reflection

### Thilak's Explicit Takeaways

#### Takeaway T1 - Work on medical PDF analysis this week
- Commitment: "that's something I'll work on this week"
- Why it matters: Rahul considers it easy but it's been sitting in #255; explicit week deadline given
- Expected deliverable: Medical PDF async processing pipeline implemented and deployed
- Tracking refs: #255
- Completion evidence: Medical PDF uploaded through assessment flow triggers async processing; result stored and accessible
- Baseline at meeting close: 0% (existing issue but implementation not started)
- Next-meeting follow-up: Is the pipeline live and tested?
- Carry forward: Yes

#### Takeaway T2 - Build the Assessments page and backend
- Commitment: "the first thing is to work on this and I'll work on the backend for it too"
- Why it matters: Core feature for all assessment data workflows; Rahul can't test data ingestion until UI exists
- Expected deliverable: Your Assessments page (teacher view, table, multi-attempt, PDF viewer, absent/not-ready states, admin edit)
- Tracking refs: #313
- Completion evidence: Teachers can view uploaded assessments, add attempts, see PDF question papers, mark absent/not-ready
- Baseline at meeting close: 10% (UI brainstorm complete; mockup shown in meeting; no code written)
- Next-meeting follow-up: Demo the working assessments page
- Carry forward: Yes

#### Takeaway T3 - Expose bulk upload as HTTP API for machine-to-machine ingestion
- Commitment: "I'll think about this too" (after Rahul described the hub-and-spoke vision)
- Why it matters: Unlocks 20+ external AI apps to push data to PepOS automatically; eliminates Rahul's manual CSV step
- Expected deliverable: Bulk upload endpoint exposed as a callable HTTP API; external apps can POST structured data
- Tracking refs: #327
- Completion evidence: Rahul's pipeline can push data directly to PepOS without manual CSV trigger
- Baseline at meeting close: 0%
- Next-meeting follow-up: API design reviewed with Rahul
- Carry forward: Yes

### Rahul's Explicit Takeaways

#### Takeaway R1 - Reply to Srivatsan's intro email
- Commitment: "I'll reply"
- Why it matters: Intro was made by Thilak; completing it is a courtesy and potentially valuable connection
- Expected deliverable: Rahul replies to the email found in spam
- Completion evidence: Srivatsan and Rahul have connected
- Baseline at meeting close: 0%
- Next-meeting follow-up: Did the connection happen?
- Carry forward: Yes

#### Takeaway R2 - Explore assessment format definitions and ingestion pain
- Commitment: "I'll spend some time... seeing if I have some Excel sheets somewhere and I'll get Claude to convert it into the format"
- Why it matters: Rahul feels the ingestion path for teachers is still painful; exploring whether strict format definitions or flexible front-end handling is the right approach
- Expected deliverable: Rahul has a clearer view of how many formats are needed and whether format strictness can replace front-end flexibility
- Completion evidence: Rahul reports back with a proposed path (strict formats vs. flexible UI)
- Baseline at meeting close: 0%
- Next-meeting follow-up: What did Rahul find about format flexibility vs. UI?
- Carry forward: Yes

#### Takeaway R3 - Test CoachPepper image/handwriting analysis
- Commitment: "I'll just check it out once... I'll try it out and I'll drop you a mail"
- Why it matters: Rahul wasn't sure if CoachPepper could analyze handwriting; now confirmed multimodal; wants to validate quality for real use
- Expected deliverable: Rahul tests CoachPepper with a handwriting photo and sends feedback to Thilak by email
- Completion evidence: Rahul's test email received; feedback on quality documented
- Baseline at meeting close: 0%
- Next-meeting follow-up: Was image analysis quality good enough for use?
- Carry forward: Yes

## Drafted Issues

Created:
- #327 - Expose bulk upload as HTTP API for machine-to-machine ingestion (feature, P2-high) - hub-and-spoke architecture; external AI apps push observations/scores to PepOS without manual CSV

Augmented:
- #313 - Added Oct 14 decisions: absent vs "not ready yet" schema distinction; admin+classroomadmin grade edits; side-scrollable table with sort; PDF question paper viewer; trends deferred; assessment grouping = name-as-is
- #253 - PDF viewer confirmed for v1 (upload alongside CSV, embedded viewer); AI context extraction remains icebox
- #255 - Thilak committed to implementation this week (2026-10-15 week)
- #265 - Per-student ledger moved to icebox per Rahul's explicit decision (dashboard granularity sufficient)

Skipped:
- Classroom timeline filter fix - already shipped (PR #326 merged)
- Langfuse dashboard walkthrough - already done, T1 complete
- CoachPepper multimodal confirmation - verified in conversation, no code change (Rahul testing independently as R3)
- Rename "agent-iteration" Langfuse trace label - minor ops detail
- Minla Labs / Srivatsan / personal items - not PepOS work

## Open Questions

- How should the bulk upload API authenticate external callers (service accounts, API keys)?
- Should "not ready yet" be stored as a first-class enum value on the observation doc or just as a grade of null with a reason field?
- What is the exact timeout/retry policy for medical PDF async processing?
- How does Rahul want to trigger the bulk upload API from his external pipelines (manual curl vs. agent-driven)?

## Raw Transcript

Chat with meeting transcript: https://notes.granola.ai/t/fe2443d5-116c-4c76-ac38-4d7f85fa7427
Meeting Title: Minla startup offer, PEP assessments UI, and cost reporting dashboard
Date: Oct 14
Meeting participants: Thilak (Me), Rahul (Them)

Me: Hello? Hello? 
Them: One second, one second. 
Me: Oh sure. 
Them: Hey, hi. Sorry, my system was hanging. 
Me: Okay, yeah, it looks better. And it was pretty choppy to start with. Can you hear me well? 
Them: Uh, yeah, I think it's my system. I don't know what's happening, but yeah, it seems fine. Oh, I lost you. 
Me: Yeah, hello. Okay, let me also rejoin. Hello? Okay. Yeah, can you hear me? 
Them: Yeah. 
Me: Okay. So I have, I think, 2 things to bring up. 
Them: Yeah. 
Me: Like PEP work related, but I think before that I'll fill you in for some, like, what's been happening in my life. But I met with Watson today and we Finalized the offer, so I should start work at this new startup. On Monday. 
Them: Oh, that's great. Yeah. 
Me: Yeah, yeah, yeah. So I feel the previous one shut down early last month. 
Them: Oh. 
Me: The founder went through a lot of life-threatening surgeries. 
Them: Oh. 
Me: So she decided to shut down temporarily. 
Them: Okay. 
Me: And Like, it's like best wishes to her, but it really puts me, like, puts my back against the wall, right, with unemployment days ticking. So yeah, glad to have like some other opportunity, which it's like Significantly better, I think. Just the I would like to fill you in and It's currently a stealth startup, but they're Like, it's called Minla. I mean, I've told you a little bit about them, right? Minla Labs, and they're working towards some sort of revenue automation. 
Them: Yeah. Yeah. 
Me: For service organizations. So they take in booking data, staffing, Numbers, number of chairs, forecast revenue, and if you're not meeting goals, suggest actionable items for you to meet your goals. And in the process, create ad campaigns and launch them as well. So the full loop, suggest improvements and make the improvements. Targeting spas, dental clinics, and whatnot. 
Them: Yeah. 
Me: But I think what I'm really excited about personally is just the, I think the team that they've set up so far. I will be the 7th hire. 
Them: Okay. 
Me: And it's all like I had a 6-hour interview last week. I was supposed to have a 1-hour break. But some ran long. So it was 9 to 3 nonstop and I got grilled. So in the feedback today, he said, yeah, it was positive. We know We got a better understanding of your strengths and especially weaknesses too. So we'd want you to work on these things, but I think we want to go ahead with it. 
Them: Mm-hmm. 
Me: But they're all like seasoned professionals. Everyone's like around 50 years old. 
Them: Nice. 
Me: Multi, like serial entrepreneur. You know, multiple Successful startups bought up, like individually and as a team. So they have the experience. 
Them: Mm-hmm. Mm-hmm. 
Me: Sure. And yeah, I think what was promising was he said, yeah, listen, like we'll do our best with H1B next year and the year after that. If you don't get it, go back, we'll still employ you. We'll eventually have an Indian org though. 
Them: Mm-hmm. 
Me: And if required, get you here, get you back here on an L-1, or if you want to continue working there, I mean, we can see, but they said very flexible and they're all, I think all Indians who've like settled down in the US, L-1 or born here. 
Them: Okay. 
Me: And yeah, pretty lean, and it's going to be like an insane learning experience. I'm really excited about this for sure. 
Them: Have they raised capital? 
Me: Um, No, it is founder funded now. 
Them: Okay. 
Me: They are planning to do it once they have a valuation, like a self-valuation that they think is worth it because they could— he has the network to raise capital, but he doesn't want to do it now because you tend to be undervalued if you don't have that much customers. So they're in the general customer acquisition phase. And the plan is to raise in Q1. But I think 
Them: Revenue is there. Revenue is there. 
Me: Sorry? I don't know. They've signed a few clients. I don't know if they are paying. I'll find out on Monday once I get the work email and I'll understand what the actual partnership is. 
Them: Yeah. 
Me: Like how many? Like actively clients we're shipping, like active clients we're shipping to right now? But it should be in Palo Alto, so I'll have to make the commute there. Potentially move. Yeah, so like exciting times. It has been very busy, so I haven't been able to put in a lot of work into Pep. But I do have 2, rather 3 things to bring up. Oh, and before I do, Did you get the intro email? Set between you and Srivatsan. 
Them: No, I didn't get it. 
Me: Okay, that's what I was wondering because he said he didn't see it too. So either I messed up somehow or it went under the radar. Let me tell you when I sent it. I sent it Monday morning, so it should have come Monday night your time. 
Them: Oh, let me check spam. I mean, I didn't get it in my inbox for sure. Oh yeah, it's gone to spam. 
Me: Okay, okay, no one knew. Yeah. That's fine. 
Them: Well, I wonder why. 
Me: Yeah. Yeah, I think I left it saying, asking you to provide him some time so he can pick and as per your convenience meet. 
Them: Oh, okay. Yeah, it's gone to spam. I'm just seeing it. 
Me: Okay. 
Them: I wonder why. 
Me: Yeah, there's no attachment. 
Them: Look at it unless you've been 
Me: Maybe, yeah, I'm not sure. Yeah, I mean, this is, I think, the first time I'm emailing you with this one. With this new email ID. Yeah, exactly. It's not like my email has a bad rap as well, right? 
Them: Oh, but still. This, I mean, Yeah, that's fine. 
Me: Yeah. Anyway, I, yeah. 
Them: So should I still reach out to him, or is it moot, or 
Me: I mean, I think it's official, but I think just to wrap up, like since we, I made the intro. Yeah, I think it might be perfunctory. But I think it's like, it can still go a long way that if he talks to you and gets a little bit of yeah. 
Them: Sure, sure, sure. I'll reply. 
Me: Awesome. Thanks. 
Them: I'll reply. Ah, because I was wondering that I had not received it. Okay. Sounds good. I'll write to him. 
Me: Awesome, awesome. So let me screen share now. Okay. Yeah, can you see my screen? 
Them: Sorry, one second. I'm just seeing this Srivatsan's profile. 
Me: Sure. 
Them: Oh yeah, we have a lot of common people actually. Okay, cool. 
Me: Yeah, you have like mutual followers. 
Them: Yeah, and like, I know people who probably went to college with him and so on. 
Me: Yeah. Yeah. That's cool. 
Them: Oops. Yeah. 
Me: But yeah, he did mention, you know, like there's no two ways about you spending a lot of effort into finding stable work over the past year. But I think they found it very attractive that like I was able to build this app up. Like dedicatedly over the past year. You know, just like prove value and just get that hands-on experience right straight out of graduation. So yeah, I just, I don't know, I don't think I can Expression of gratitude. 
Them: No, absolutely. Yeah. 
Me: Like to thank you for the opportunity. Yeah. 
Them: Oh good, I'm glad it worked out. Actually, I didn't realize that that job had gone. 
Me: Yeah. Yeah, I figured I was, yeah, I had a few, like because my back was to the wall this time without any cushion, like I was just doing interview after interview, so I was confident something would go my way. I think I went through 4 or 5 separate pipelines. And each time I was getting closer to the final round. So this one was like, yeah, I was confident I would get it. So yeah. 
Them: No, that's good. I think the key thing there is on basically the, like, I feel the market is still quite tight on money. 
Me: Okay. 
Them: Um, like, it's, it's not that clear. Uh, if it's going to be easy to raise capital. Um, So I feel like that, I guess, in the next 1 year you'll know. 
Me: Yeah, yeah. Yeah, and it'll be great exposure to work with these people who have a lot of startup experience, the great network and whatnot. 
Them: Mm-hmm. 
Me: Yeah. Sorry, one second. Yeah. Yeah, I'll start. 
Them: Yeah. 
Me: Can you, you can see my screen, right? 
Them: Yeah. 
Me: Okay, so first I did some brainstorming for the assessments page. So in homepage there's assessments. But if you're a teacher and you've uploaded up to 5 so far, this is how I'm proposing you see it. But what's more interesting is if you enter one, it shows that entire document. As a table. 
Them: Sorry, can you just go back? I mean, I lost the train there. One second. 
Me: Okay. 
Them: Oh, this is your assessments at a teacher level. 
Me: At a teacher level, yeah. So I'm Kavya and I look at my assessments I've uploaded. 
Them: Okay. Yeah. 
Me: And I'm able to see that I've uploaded 5, 3 of high priority. 
Them: Yeah. 
Me: High criticality, 2 of low criticality. 
Them: Yeah. 
Me: With that flag. And Chip saying some students haven't been logged yet, like either absent or pending. So there's like 2 further flags. So let's say we're talking about this assignment, Term 1 Mathematics. They see the entire file upload here. 
Them: Yeah. Yeah. Yeah. 
Me: Along with the ability to add grades right here. 
Them: Okay. 
Me: And add a second or even a third attempt for students right here itself. So here it says Ishaan, 3 tries. So you see 48% to 58% to 67%. 
Them: Hey, one second. Sorry, one second. 
Me: Yeah. 
Them: One sec. Sorry. 
Me: Yeah, no worries. Yeah, your cook is like 6 AM on the dot every day. Yeah, yeah, I'm used to it at this point. But picking up Point is they see the entire document they've uploaded. 
Them: Yeah. Okay. 
Me: And this is the space for them to cross-compare, but also per student check the history if they've added multiple attempts. 
Them: Okay. 
Me: And with the ability to add like more attempts. As required. Okay. 
Them: Okay. 
Me: And if the scores are also present, then they're able to see this graph. Of scores and grades. Obviously, this is all demo data. But if the scores are in a way, if it's like continuous, then we're able to plot it, right? 
Them: Yeah. 
Me: Beyond that, yeah, so based on our meeting 2 weeks ago, my understanding was there needs to be a page where teachers can see your assessments, like literally this. 
Them: Yeah. 
Me: And on top of that, they need to be able to cross-compare students. But also simultaneously see each student's growth. Right. 
Them: Yeah. 
Me: So this is the UI. I was able to brainstorm. 
Them: But tell me this, so because the Excel sheet, the CSV upload has different Columns potentially for results. Like, does it then the UI kind of takes that into account? Like, or does it just have the main result? Like, because we have those multiple columns, no? Like, 
Me: Yeah, yeah. So here it will be side scrollable. 
Them: Why is it? 
Me: And that's where I need to get clarity from you as to What types of results usually in your— I think you said that you'll provide about 12 formats. Of Excel sheets. 
Them: Yeah, it could be more. I need that to be flexible. 
Me: Yeah. 
Them: Um, You know, otherwise it's, yeah, I need some flexibility. 
Me: Yeah, yeah, but I mean, this is, this is just dumb UI that's showing it, right? And at best we have a side scrolling thing with result 1, result 2, result 3, right? And if feasible, I mean, this, none of this changes too. We can add, like we can show result 1, result 2, and date taken over here. I understand that this is a lot to ask for because sometimes the data might not be conducive. But I think baseline 
Them: No, maybe like one thing that is worth thinking of actually is I like that median, that distribution. Like, I feel like, uh, Like, if you go back to that table now, Um, like in Excel, there's this conditional formatting, for example. Um, you know, you know, conditional formatting, no? So it kind of highlights the ones in green and red and so on. Even if that is painful, I think here sort is helpful. Um, 
Me: Obviously you want sort by 
Them: Just sort, just the by column. There's one tab that scrolls, you know, up. 
Me: Up and down button. Yeah. 
Them: Yeah, that's all. I think that itself is good enough actually. Um, So then we can kind of look at that also. The other thought I'm having now is helpful to have the assessment Question paper. Here. Right, um, because then it's just— then it's perfect because then everything's a repository. Everything is just sitting here, uh, people can look at the paper and, you know, use their judgment. 
Me: So what they can do is either like upload Like the answer and the question over here. 
Them: Yeah, exactly. 
Me: And then in assessments they can see question paper and then this is all of the answer data. 
Them: Got it. 
Me: Right. 
Them: Correct. 
Me: Okay. And that question is just like a PDF. 
Them: PDF. 
Me: Yeah. So I'll have a viewer here so they can, they can just view the PDF version. 
Them: Yeah. 
Me: But yeah, point is for this to be interactive and For them to just easily add another attempt for result 1, result 2, how many other columns there are. The same for absent students, right? So we mark absent and then add another grade on top of that. 
Them: Yeah. Yeah. 
Me: Now for the student dashboard, Yeah. So Yeah, what we spoke about was some, something that's expandable. 
Them: Yeah. 
Me: Right. So notes over time is like this. 
Them: Yeah. 
Me: The baseball card is here. And that's scrollable. It's smaller. 
Them: Yeah. 
Me: But critical assessment. So you wanted like the cricket score, right? 
Them: Yeah. 
Me: The table of stats. So here the main thing is there needs to be clear grouping of assessments. For us to eventually show per student. So, and that is what I need clarity from you on. So I have a list of questions to ask you. 
Them: Yeah. 
Me: If we're able to Bucket assessments in this way, then we can show just per student. Like latest assessment grading over here. 
Them: Yeah. 
Me: Or just show critical things, right? So here, I mean, this is critical assessments and there's 8 files uploaded. And, you know, right over here you see latest data, and if you expand it, you can see the trajectory. Over time. 
Them: Yeah. 
Me: Yeah, so I did have questions to ask. Yeah, so Build a Formats you're going to create. Be conducive for this grouping of maths, reading, language, practical life. Which is basically fetched from the monthly plan. Right, the dimensions per program. 
Them: Um, so for primary, uh, it will broadly be math and English, but English can have English split as reading of English and writing of English. Right. And similarly, math could have, you know, just conceptual knowledge and fluency, which is speed. Right. So yeah, I feel like, I think I would be less specific here in the sense that I'll just say critical assessment. I'll just pull whatever is there in the database for that particular child based on how that assessment is defined. Instead of force-fitting a language practical life framework onto it. Right, just use that name only. Whatever name is there, you dump it here. 
Me: Okay, but in that case, how do we— do we just show the latest assessments? 
Them: No, it can be— you can scroll down. No, yeah, it could be the last. 
Me: I mean, we'll first filter out the critical ones. And if that is more than 4, then I'm guessing we show the 4 latest ones over here, like with the name and the score. 
Them: Yeah. Yeah, I feel like the trends makes it more complicated than it needs to be, actually. 
Me: Okay, so this, yeah. 
Them: Yeah, yeah, yeah, I think. And I mean, it's really like a dump, right? It's for somebody to get a quick feel of the numbers, the trends per se we'll come back to— because the trends, I don't know, I feel like, uh, I think it's important, but I don't have a feel right now on how to do it. For example, if you are testing somebody's reading, reading evolves over a 6-month timeline. Right, so it's literally like a mapping of reading 6 months ago versus reading today. Um, but there'll be in the interim a bunch of small, small assessments that happen. So, um, It's not seeming obvious to me how to capture the trend here. 
Me: So this chip that we have here, the sole purpose is to highlight the critical assessments. The latest critical assessments grade. For this student. 
Them: Yeah, yeah, yeah, yeah. I feel like, uh, and we could use latest liberally, right? I mean, because critical assessments don't happen that often. 
Me: Okay. 
Them: Uh, they'll happen like, you know, Maybe. I don't know, I don't want to put a number on it, but it'll happen a few times a year. 
Me: Okay. 
Them: So right now let's get into a repository, right, where everything is displayed. Trends, I think, is a separate problem. I don't want to solve the trends problem right now. 
Me: Yeah, yeah, I would imagine the first priority is this one. Year assessments. Yeah, it's coming up with this page so teachers can start to look at all their assessments and add question papers and look at the table at once. 
Them: Yeah. Yeah. 
Me: And then once we start to get data, we can understand how better to show it in the UI and the student dashboard. 
Them: Yeah. Yeah. 
Me: Okay. So that makes it clear. Okay, this— all of these are to be decided. So when a teacher comes across a student, Who hasn't done the assessment. 
Them: Yeah. 
Me: Guesses you want the teacher to select between absent or not done. I mean, 
Them: Yeah. So absent means it's in a way the child decided to not do it. 
Me: Do we want to differentiate? 
Them: By being absent, not done means the teacher decided that the child is not ready. 
Me: Okay, so just there's Oh, so okay, so not ready yet is a better label. 
Them: Yeah. 
Me: In that case, okay. Do you foresee the teachers Skipping grading a student for any other reason? 
Them: No. 
Me: Okay. 
Them: Just not ready yet or absent. 
Me: Okay. And for absent, the expectation is that the assessment will eventually come, just later. 
Them: Yeah, I mean, and again, maybe I Yeah, I mean, that's it. That's what it is, right? It's that because we want these— this data to be Uploaded regularly. And again, there are a lot of nuances here. Like, unfortunately, we are trying to solve a lot of problems simultaneously, which is high school here looks very different from preschool because high school will be uploading assessments every week. Preschool upload assessments every month. 
Me: Okay, the 3 weeks. Yeah. 
Them: Or every 3 months. Right. And so I'm trying to hold both of those in my head at the same time, but actually they're very different things. Right. It's like high school is like your 9th and 10th, right? Where constantly there are things coming. Yeah. Yeah. And so there, the absent thing would be used much less commonly, right? Because the teacher would just give it the next day and then collect the data. 
Me: It's a lot more structured assessment level. Yeah. 
Them: Right. And there's no concept of not ready yet because if you're in the class, you take the assessment. Right. You understand what I'm saying? 
Me: Yeah. Yeah, yeah. In the lower grades, it's a lot more. Dynamic. 
Them: There's a lot more discretion, correct? There's a lot more discretion. It's not there in the upper grades. 
Me: Yeah. Yeah, the teacher has to make the call as to whether the student goes through or not. Yeah, okay, okay. 
Them: Um, hmm. Yeah. Yeah. Yeah. 
Me: Okay, otherwise we're still sticking to append only. Right, where teachers Either update absent data, absent students' grades, and that's all the change they can make. Right. 
Them: Uh, maybe here, I don't know, because in this UI it seems like it's easy to edit. 
Me: Yeah. 
Them: So is there a world where admins can edit? 
Me: Yeah, I mean, I— yeah, of course. Because there are, like, I can foresee issues where teachers write 27 instead of 72 in the Excel or 71 instead of 70 and they want to fix it. 
Them: Yeah, edit is good to give for the admin. 
Me: Super, and classroom admins. 
Them: Yeah. 
Me: Cool. Okay. 
Them: Because this will all be honest mistakes. It will not be anything malicious. Right. So it's good to have that. 
Me: Okay, that's cleared. Yeah, I think everything else is answered. So the first thing is to work on this and I'll work on the backend for it too. Secondly, So I got feedback from teachers and also explicitly my mom. For Nishul. Regarding, uh, wait. Yeah, regarding the filters. So whenever teachers would filter by teacher, they wouldn't Oh, hold on. Yeah. So whenever they filter by teachers or even notes, they wouldn't see the actual latest data. 
Them: Yeah. 
Me: Again, there was an issue with pagination there, so fix that. So now there's an apply filter button. So you had 84 notes in the past days. Is restricted to 36 notes. 
Them: Oh, nice. 
Me: Just by this teacher. And now I think this timeline, the filter at least is cleaned up. 
Them: Yeah, nice. 
Me: And no timeline issues and we're fetching all the data. 
Them: Nice. 
Me: We need. So we're able to filter by multiple teachers and even Like lesson notes. 
Them: Yeah. 
Me: Yeah, basically so that this filter button is fixed now. 
Them: Yeah. 
Me: Oh. Beyond that, Did you, do you have access to this dashboard? 
Them: Oh. 
Me: Sent an invite. If you haven't, go to your email. And look for. 
Them: No, I, I said, uh, I logged in that day. Logged in means I accepted the invite, and then after that nothing happened. 
Me: Okay, I'll ask you to screen share. I'll take you through it now anyway, and we can try to set it up on your system. But 
Them: One second. Huh? Yeah, I'm there. Yeah, I'm there. I'm there. 
Me: Do you see what I'm screen sharing now? 
Them: One second. Aha, I see. Oh, that dashboard. One second. 
Me: Yeah, so go to dashboard and then you'll see Pep School AI usage dashboard. 
Them: Yeah, I got it. Yeah, I have this. 
Me: Awesome. So this is for your full perusal, but the cost reporting I've broken down into 2 segments. 
Them: Pennis. 
Me: First is whatever Langfuse already offers through their data visualization platform. And the other is custom insights that we need to extract because there's still some drawbacks with this dashboard. To highlight the things that it offers, first is just total cost. You can firstly filter by days. 
Them: Mm-hmm. 
Me: By time windows in the top right. So we've spent $250 in the past month. You can see top usage per pipeline. 
Them: Oh, okay. 
Me: So clearly sole generation is at $83, then report completion because of this month's 
Them: Mm-hmm. Oh, that's very cheap. Yeah, it was just $36 for some 450 reports. 
Me: For how many ever we created. Yeah. 
Them: Okay. 
Me: And then monthly plan completion, which runs once. Beyond that, writing analysis. So this shows a lot of media. 
Them: Yeah. 
Me: Being logged. 
Them: Yeah. 
Me: Baseball card, which is 4 times a month. 
Them: Yeah. 
Me: I mean, so is the writing completion, but this has a stricter gate, doesn't always run, right? Minimum 3 new notes per week. 
Them: Yeah. Yeah. 
Me: So The data is available here. I did the math on sole generation. When I switch to the updated assembled context that we agreed upon last week, 2 weeks ago, where instead of passing the entire past year of notes, we provide just the latest month's notes along with the previous SOL. That cuts down. 
Them: Yeah. 
Me: Input tokens by about 70-75-ish percent. 
Them: Okay. 
Me: So this cost should be slashed by almost 4 times. 
Them: Okay. 
Me: So 80 can be expected to drop to around 30. 20 to 30-ish. Once we do that, Otherwise, 
Them: Sorry, how much does the chatbot cost? The CoachPepper chatbot, is that there here? 
Me: Coach complete. So that's split up into chat stream iteration 1. Yeah, this is $2. 
Them: Yeah, maybe just go through the line items once, you know, from the top bar onwards, uh, so that I see. Okay, that's SoulGen. Next is 
Me: Sure, 3, then report completion. 
Them: Report, okay. Okay. Okay. 
Me: Writing analysis baseball card, which is 4 times a month. 
Them: Okay. 
Me: Report readiness. 
Them: Ah, okay. So that's part of the report. 
Me: We can't really just explicitly Right. 
Them: Yeah. Yeah, okay. 
Me: Coach completion and that. 
Them: This is the chat, yeah. 
Me: I don't remember coach completion. Is it not this? Wait, there is a separate text cleanup, I think. Hold on, latency. PDF report, chat stream, no. I'm blanking on what this pipeline is. 
Them: Okay. 
Me: Yeah. Let me quickly ask. Because this is a very funny brain fade. But beyond that, the chat stream is chat stream. So because it's agentic, there's Multiple calls it makes across 2 levels roughly. So to sum up, it's essentially $2 for the past month. 
Them: Okay. 
Me: Chat stream 1 and chat stream 2. This agent iteration, I'll name it better, but this is your weekly digest. For super admin and classrooms. Again, because that is multiple layers of LLM calls. So you have layer 1 and layer 2. Over here. 
Them: Yeah. 
Me: Beyond that, I think we get into the nuances. So this is speech-to-text. Text cleanup, so Polish AI. This, so this is just eval metrics I have in the backend. And report judge, yeah, media PDF, the name. And the PDF Essence Extractor. Yeah, and then we— yeah, this is a $0. 
Them: Yeah, fair enough. That's all trivial. Okay, got it. 
Me: So this shows you just average spend. So as expected, last ending of a month and starting of a month is the peak for us. 
Them: Okay. 
Me: So sold generation and monthly plan. At the bulk of this. 
Them: Got it. 
Me: Beyond that, You see weekly spikes of writing analysis and baseball cards, so gray and red. And you see report, generate student report over September 15th. So if I just go into past 90 days, I don't know if it will show. That specific data. Yeah, okay, we lose that depth of data. We can Yeah, we can customize it. So Let me do. Okay, this clicks. I think the paid Tier allows us to customize the windows. 
Them: That's okay. 
Me: Yeah, beyond that. Daily spend by model. But yeah, this is what Langfuse is able to offer us right now. So the main component it's missing is per-student ledger. Right. So that has to be done through a script. Langfuse very weirdly, and it's a feature because they're open source there, I've seen a lot of requests for this, but they don't allow filtering by sort like metadata that isn't either your observation ID or like a specific set of 5 fixed fields. So I'm unable to filter by students. 
Them: Hmm. 
Me: The data is available, so I'm working on a script to expose that data. So we'll essentially have to 2 outputs for cost report. 
Them: Hmm. 
Me: This is something you can check whenever you want. And then the second I'll expose as a tool call for you to talk to your agent and run whenever you want, but that will have a repeatable script that it runs to run— do all the intelligence. 
Them: Got it. 
Me: Oh. 
Them: I'm also trying to understand this average cost per run. Um, what does that mean? 
Me: So compared to the Average cost per run. So if you look at report readiness, How do I explain it? Baseball card runs 4 times a month, right? And it's per student as well. So we have about what, 400 kids? 
Them: Yeah. Yeah. 
Me: That get it. So the total cost by $1,600. In that case, because each run is tagged that, right? So because Weekly Digest Super Admin is run 4 times, Um, it's, uh, Clarify that. 
Them: Understood. Understood. I'm surprised that's so expensive. Okay. For run. 
Me: Yeah. 
Them: So then is this is, this is same as saying to generate one SOL, I'm spending 10 cents. Is that correct? 
Me: Yeah. Yes. 
Them: That's what it means, no? 
Me: Yeah. Yeah, because each run is for one student. Essentially. 
Them: Yeah. So basically, yeah, got it. 
Me: The visibility. 
Them: It's like Rs 10 per month. 
Me: Yeah, exactly. And Weekly Digest is more because we run it— it is per admin. I mean, we run it once and email it to all admins, right? So it's one run a week. 
Them: Yeah. Yeah. 
Me: So that's what that amounts to. Yeah, and these, the values vary drastically because of the number of times we're running them. Beyond that, Yeah, I think runs— this is runs per pipeline. So looks like photo classification is the highest number of, um, highest pipeline frequent, like highest, most frequently used pipeline. 
Them: Okay. 
Me: Beyond that, I don't know what coach we— so text cleanup as expected, Whisper translate, these are like basically mirror numbers for each other. Okay, I don't know what coach completion is. Oh, okay. A coach completion is the nudge pipeline. 
Them: Understood. 
Me: Yeah, yeah, yeah. I, uh, so that, that is, this is what Coach of You is here to, um, otherwise baseball card, um, report readiness. Soul generation, yeah. So here it's showing as 781 because we run about 450 per month. And then I think this month I had to run Remedial. 
Them: Yeah. 
Me: Um, a remedial pipeline to pick up the students for whom it failed. And that cost not an additional 50 because the money is saved by not spending it on those students for whom it failed. Um, but that just differentiates, like, this is ad hoc manual runs. 
Them: Got it. 
Me: So the goal is for this to be lesser and lesser because that's lesser manual work for me. For automated pipelines. Yeah, but this is more stats from my end. Uh, yeah. Again, I'll let you explore all of this, but now that you have access to it, I think this should help you deep dive. 
Them: Yeah, this is helpful. But now it is capturing all the spends, no, like from the app, there's nothing that is not here. 
Me: Yes, yeah, I have every single thing that we make an API call to attach to LangFuse. 
Them: No, that's good. 
Me: Yeah, this should be all-inclusive. 
Them: Okay, that's good. 
Me: Yeah. 
Them: That's good. 
Me: So there was the Your Assessments page. The feature, the classroom filter fix. And this cost report. So this actually you should be able to edit through your agent as well because LangFuse exposes MCP tools. To mess with this dashboard. 
Them: Yeah. 
Me: So you don't have to work on resizing. Are coming up with new. Dashboards because it can get pretty complicated deciding what kind of graph, what metadata to use, what granularity and whatnot. So I think That you can interface with your agent. 
Them: Yeah. Yeah. Yeah. 
Me: And given you're logged into rahul@pepschoolveto, you should be able to mess around with it too. 
Them: Yeah. That sounds good. 
Me: So that's all I had to bring up. 
Them: Cool. 
Me: Let me see if I wanted to ask you anything else. So the cost report, the script. For student per student ledger, that's still missing. And then So now I'll work on the year assessments. 
Them: No, I think per student ledger is not needed anymore. I think this is good enough, right? Because like, I just, I've seen now it's 10 cents for one report generation, right? That's the number that I wanted. 
Me: Like Okay. 
Them: Beyond this, per student is not needed. 
Me: Okay. Yeah, I'll still put that issue. I'll just move it to the icebox then. 
Them: Yeah. 
Me: So that when we do have, when we like somewhere in the future find ourselves, find time where we're just like, okay, what, like we're a little free now, which I don't see happening head on. But if we get there, then I can get to it. 
Them: Yeah, I think the next piece of work, maybe like I'll see assessments, I've not really spent time yet. 
Me: Yeah. 
Them: I'll spend some time in terms of seeing if— because I'm forcing this pain of ingestion. Right. Which is that, like, I have to really see what I will do is I'll have some Excel sheets somewhere and I'll get Claude to convert it into the format that goes into this thing. Right. But our teachers can't do that. So ideally, that can be managed on the front end itself. Right. For the majority of teachers, or I have to go down the path of defining all formats more strictly. But I feel we lose some flexibility that way. Um, Let me see. I'll think through that. 
Me: Okay. 
Them: Right. And yeah, we're also having a bunch of other processes where we will start writing directly to PepOS. Um, I mean, and, and, you know, Where, for example, there is, let's say there is a screen-based assessment somebody takes that's generating data about how they performed. Maybe in that assessment or in general saying maybe there's some gaps in some area. So on that app, if it generates an output, I want that output to get pushed directly to PepOS. Right, which I think should be quite straightforward, no? 
Me: Yeah, what app are you talking about? 
Them: We are building various things, right? Like for suppose we want to do something like, so for example, I'll just give you a high-level picture. So one thought we have is the correction process is very, very painful for teachers. Right. So the idea is to kind of move all the correction to AI. Um, which then means that every assessment could get— or not even assessment, any piece of writing, for example, um, will get more fine-tuned. Uh, first it'll get transcribed and all of that, and then there'll be some feedback that is going to the child. At the same time, there's feedback going to teacher, and then there is feedback going to PepOS saying in this particular activity, this child performed like this, blah blah blah blah. Um, Right now, and now Obviously I don't want the teacher to go take that and paste it into PepOS because the system should just talk to the system, right? So it's like literally like I mean, I think I'll be able to write directly to PepOS. No, I mean, we're not exposed that yet, but we should start thinking about exposing some services like that where we can write directly. Right now, the bulk upload is what I use. Like, but even that is, I'd say generate a CSV in this format because my bulk upload feature needs that format, and then I do manually. 
Me: Okay. 
Them: But I feel again something can be exposed there. 
Me: Okay, okay, okay. And this assessment correction pipeline. Will live outside PepOS. That is an app I'm guessing you're building. 
Them: Yeah. Yeah, yeah, yeah. So a lot of small, small things have gotten built now. Like for example, we have our whole meetings tool where every meeting is logged. Now from there, I may want to get a summary and put it into PepOS. So I'm feeling increasingly like PepOS is the source of truth, right? That all of the— it has all of the important information. And there are— it's like the hub and spoke where PepOS is the hub and there are multiple spokes talking to it. Right. Feeding it data, right? So now to feed it data, it needs to kind of write to the database. Which of course comes with risks and all that. But I mean, I think we should have a pipeline of some kind, some kind of staging area. I don't know. 
Me: Okay. And what timeline are you thinking of for like these individual apps that act as contributors of data are already built? 
Them: They're all already there. Like, there's many that are already there. 
Me: So the only thing is just Okay. 
Them: Um, I mean, just that now we're feeling that the data is now in silos, right? And slowly we're consolidating everything. So all the human needs are now taken care of, but now there are the various agent needs because there are different, different AI-based products that we have. All of those products now we wanted to collect data and log it against that child in the central database, which is PepOS. 
Me: Okay, okay, okay. So, okay, I need to work on some sort of, like you said, exposing. 
Them: I mean, I think it's just like, it's if you made the bulk upload like an API, uh, it's basically done. 
Me: Okay. 
Them: Right, uh, to me it's just that. Right, right now actually it's there as a feature except that I have to do that one manual step of going and actually executing the bulk upload. 
Me: Right, right. Okay. You want to be the one. To do this. 
Them: Yeah, yeah. 
Me: Or do you foresee other teachers? 
Them: No. 
Me: Connecting data to. 
Them: This is, this is the agent work, no? So this is all, uh, no, no teachers. Teachers will do whatever they're doing right now. Now see, we're now creating the ingestion pipeline for non-humans. I think human needs, I think we're more or less now catered to. 
Me: Okay, okay. And So how many pipelines are you looking at ingesting data into? 
Them: I mean, it could be 20 spokes. Each program could have 7-8 spokes. 
Me: So teachers use that app and it automatically gets sent to Pepos. 
Them: Correct, correct, correct, correct, correct, correct. So even things like the reading assessment and all, no, I'm seeing a world— see, right now I'll tell you, like, we have real problems, human problems, right, where one teacher's standards while conducting an oral assessment may be different from another teacher's standards. You may wait for a few seconds more. Right, so not to avoid all that, I obviously want to go to some kind of screen-based, uh, you know, where the child— there's a passage there on the screen, the child reads out the passage, the AI gives a score. Right, that's fairly trivial to do now. But now once that score is generated, I want that score to get pushed directly to PepOS, not live in that app. That app is just doing the front-end data collection, right? But the actual repository is PepOS. 
Me: Yeah. Okay. Yeah, I think that's where the Firebase data. A database of choice being unstructured by nature will come in handy. 
Them: Yeah. 
Me: Because then I don't have to be anal about all the data has to be in this format. It's just Here is some data, whatever schema you've picked, dump it here under this student. 
Them: Yeah, yeah, it need not even be assessment. It could be an observation also. It could be an observation saying that this child struggled with words of this nature, which is fantastic. Right, and it goes and writes an observation against that child, which is just amazing actually. 
Me: Okay, then I'll think about that too. I was thinking beyond whatever I spoke about, I think next thing was the media The medical PDF. Analysis. But along with that, I'll think about this too. 
Them: Yeah, to me that is easy. That's just a straight transcription. It's already text data. I mean, there's nothing there actually. I mean, I feel like just convert it to text. 
Me: Yeah, so that's something I'll work on this week. 
Them: Yeah. 
Me: And then, um, And then work on this. Just handle Like inputs from all your pipelines. 
Them: Yeah. Yeah. 
Me: And then you 
Them: I can finally tell me like one thing, like in Coach Pepper, can I say go look at, can I ask it to look specifically at media? And analyze media. 
Me: Yeah. Yeah, India. 
Them: I can say look at the last 3 images and particularly give me feedback on this. Can I say that? 
Me: Yes, it has media tools. Let me— you want to try it now? 
Them: Yeah, can you just show that now? So, you know, actually not today. I'll try it out and I'll drop you a mail. I have to run, unfortunately. 
Me: Yes, it has tools access and the model there is multimodal. 
Them: Okay. Okay. 
Me: So it should be able to analyze image data as well. 
Them: Okay, awesome. I'll, but I'll just check it out once because somebody asked me this. I wasn't sure. 
Me: Yeah, try that and let me know. 
Them: Because instead of waiting for writing analysis, if I want an urgent feedback on a piece of writing, then you're saying I can upload a photo and ask about it. 
Me: Yeah, yeah, yeah. Yeah, yeah. 
Them: It should work. 
Me: Yes. 
Them: Okay, I'll just try that out because again, I'm a little bit— I'm wondering how good is the transcription there of handwriting. But anyway, I'll try it out and then we'll talk. So I gotta run now. Sorry, I have an early morning thing. 
Me: Yeah, yeah. Okay. Next queue. Okay. 
Them: Yeah, see you. Bye. 
Me: I'll see you. Bye.
