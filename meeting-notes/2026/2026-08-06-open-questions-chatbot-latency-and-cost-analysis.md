---
type: meeting_record
title: "Open questions prompt rollout, chatbot development, latency optimization, and cost analysis"
date: "2026-08-06"
participants: ["Thilak"]
areas: ["ai-tools-and-chat", "admin-and-access", "analytics-and-notifications"]
topics: ["open-questions", "soul-prompts", "chatbot", "latency", "job-monitoring", "llm-costs", "model-strategy", "usage-analytics"]
status: "issues-drafted"
issue_refs: ["#211", "#229", "#233", "#234", "#235", "#241"]
source: "Granola transcripts: https://notes.granola.ai/t/1f860230-f48e-46a5-b1c6-93541179b506 and https://notes.granola.ai/t/6a0925ff-e6d5-4ff4-8b39-a603501f9397"
---

## Meeting Notes / MOM

This was one meeting split into two Granola recordings. The discussion covered the rollout of incident-specific open questions, chatbot readiness, latency instrumentation, scheduled-job observability, AI spend, lower-cost model evaluation, and a possible persistent analytics layer.

## Decisions

- Open questions should be enabled for Primary and Toddler programs only for now; other programs should wait until the soul prompt issue is fixed or the next planned soul rerun around August 23.
- Chatbot access should first be opened to the second reviewer, then released more broadly once latency and remaining interaction issues are addressed.
- End-to-end latency measurement is the immediate technical priority.
- Scheduled bulk jobs need durable per-worker completion marks, expected-vs-actual verification, and alerts when outputs are missing.
- Cost decisions should be based on a per-function breakdown for soul, plan, and report generation, with lower-cost models such as Kimi evaluated against quality requirements.
- OpenRouter access should move to the PepSchool account or be shared through an appropriate team-access mechanism.
- The existing usage visualization should be reproduced by program, with longer-term consideration for reusable, multiplayer analytics functions.

## Drafted Issues
### Created
- #241 — Add AI spend analytics and budget guardrails

### Augmented
- #211 — Build reusable backend service APIs for agent-driven features
- #229 — Monitor scheduled jobs with provider-neutral health checks
- #233 — Polish Coach Pepper chat startup and streaming
- #234 — Instrument and baseline Coach Pepper chat latency
- #235 — Apply measured Coach Pepper latency fixes

### Skipped
- Open-question prompt coverage: investigate ad hoc during the current session; create a separate issue only if the investigation reveals a material problem.
- Open-question rollout gating: handle ad hoc, then verify production deployment/accountability rather than create an issue.
- Chatbot reviewer gate: handle ad hoc, then verify production deployment/accountability rather than create an issue.
- Missing chatbot term report: dropped.
- Lower-cost model qualification: dropped as a separate issue.
- OpenRouter account migration/access: dropped.
- Practice Notes prioritization: dropped from this meeting's issue triage.

## Open Questions

- Why did the incident-specific question prompt reach Primary but not Elementary and other programs?
- Can existing questions be reformatted cheaply, or is a targeted soul rerun required?
- Which lower-cost model is acceptable for each bulk pipeline and for chatbot inference?
- Should reusable analytics functions be implemented as a shared UI, persisted jobs, or both?

## Post-Meeting Additions

- The project board has no `Backlog` status option; #241 was added to Pep OS project #3 with the closest available initial status, `Todo`, without changing the shared board configuration.
- Accountability follow-up after issue drafting: confirm that open questions are restricted to Primary and Toddler, the chatbot is opened to the second reviewer, and both changes are pushed to `master` and production after the ad hoc session.
- Accountability follow-up: verify that the non-Primary soul/open-question prompt investigation was actually performed and record or fix any concerning result ad hoc.

## Raw Transcript

### Granola recording 1 — Open questions prompt rollout, latency optimization, and cost analysis

Meeting participants: Thilak

Me: Yeah. Hello.

Them: Hey, hey.

Me: Okay, I switched to hotspot for now. I think the Wi-Fi network is being unreliable.

Them: Okay, no problem. No, it's okay. I think the will. The graph is good. I think we'll maybe like again later that some product feedback now, because if they're doing that, then they are basically, I mean, maybe there's a world where they just turn on recording and they talk for 45 minutes and then the AI automatically picks up each child that they were talking about and distributes the notes.

Me: Okay.

Them: Right? Because that's clearly that's what they're doing.

Me: Yeah. Yeah. Yeah. Yeah. It depends. I think you have to, like, make a call is to whether you want to make the app more conducive to the teacher's current behavior, which is like their refusal to turn on that, like, switch in their brain to observe and instead do it at home. Like, I don't know where that comes from. I think. Yeah, I'd have to be in person to, like, pick up on that behavior. Like, either make the app or like you said, you know, okay, if. If they're doing this and if they can't behave any other way, we'll just ask them to just speak endlessly. And then if you have the transcript, the intelligence is all there, right? The data is all that we can asynchronously process it. Or like we enforce it through the app for them to not observe things within the school. And whatever put guardrails, whatever that looks like.

Them: Yeah. I mean, I don't know. I will, will. It's good data to, to chew over. Yeah.

Me: So. Yeah. Would you. Yeah, would you say that is. It's still closed off to everyone. Would you say it's ready to push and open up? I still have to work on the latency and.

Them: So the chat. Go ahead. To me for sure. Just push it to me today. I'll play questions I want pushed. Is it pushed?

Me: Okay. Okay. Yes, it's open to everyone.

Them: Oh, okay.

Me: Every teacher. Yeah, you can see.

Them: When can we. I want to. So. Okay, so this is next time. Just let me know so that I can send a note to them.

Me: I just. I just did it today, like a few hours. I was going to tell you on call.

Them: Understood. Understood. So I'm just seeing once.

Me: Let me just again double check. I'll log into test teacher and see if they can view it. Foreign. Yeah, I made the code change. I'm going to push it along with the chatbot. So now that I know the chat has to be released just to you too. I'll open the gate. So not only I can see it, but you can see it too. And then along with this push that I do after the meeting, our teachers will see open questions.

Them: This that bullet point thing. Is there a fix here saying likely soon or it's going to be a while?

Me: If that is the only concern you have, like, if. If that. Yeah, if that is the only barrier holding you back from releasing it everywhere, then I can. I can work on a fix immediately.

Them: Yeah. I want them to have a. I think for me, actually, more than that, it's latency.

Me: Okay.

Them: Also just on the questions. No, I'm seeing a difference between the, like, remember we made that change in the questions in, in saying, tell me about give me an specific example. You made that change, remember? In the prompt.

Me: In for open questions to make it softer and more conducive, like, easier to digest. Are you talking about that?

Them: Yeah. In, in questions, we made the change saying, like, instead of being open-ended and give me some gyan, you tell me about a specific incident.

Me: Right?

Them: Right. I'm. When I look at the questions, I'm feeling like that got reflected in primary, but it's not got reflected in the other programs. I'm wondering why.

Me: Okay. Can you show me an example?

Them: I'll just share my screen. Yeah. So you see here, this is some three year old. Right? This is describe a recent experience. Good questions. Tell us in recent story time describ a recent song game. It's very specific. Think of a recent time, so on, so on, so. Right. You see that? Good all stars? Let's look at. This is very different. Like, look at this. What helps adia keep her dignity and stay connected during correction of feedback. This is a very different kind of. It looks like the prompt didn't apply here. Like maybe the prompt went only for that program.

Me: Let me.

Them: Next question, for example, what kind of questions help are they speak? Like, because remember, we made you, like I said, you make the change and you made the change that and immediately it looked much better. But it seems to have flown only into primary.

Me: I should be able to trace that the function that ran. And see what all students it does. So let me take a look at that.

Them: Yeah. Because the questions are certainly different. And I'm trying to avoid this thing of them giving their gyan, right? I want incident specific. Right. Otherwise the, the questions will just go down a path of them, you know, just giving random.

Me: Okay. Okay.

Them: Yeah. So even in elementary, I think it has not gone. This is. Yeah, it's happened well in primary. This is definitely a question, a big difference. I think that whatever change you made hit only the primary prompt.

Me: I'll. Yeah. I'll take a look at that.

Them: Yeah, please, that's. Yeah, that's important before taking this live. Yeah. We push it out.

Them: And maybe you can make the change. Push it, push both to me, this and chat. I'll take a quick look and then I'll say whatever. Right? And remind me once the questions, the whole soul prompt we are changing.

Me: Yes. The open question.

Them: Because these open questions are coming from.

Me: Correct.

Them: Right. So then effectively what we are saying is that if the prompt has not happened for, I mean, you can always push this to primary. But I'm saying for the other programs, then the soul generation has to happen again with the correct prompt and then it can be pushed. No, that's, that isn't that the cycle.

Me: Yep. Yep. Yeah.

Them: So that we can.

Me: And the soul affects chatbot. I don't think it touches anything else reads soul currently.

Them: Got it. Yeah, that makes sense. That will affect the chatbot. Yeah. I mean, again, like later we'll get into questions like what if people ask irrelevant things?

Me: Yeah, that. Yeah, we'll find out through usage.

Them: Yeah, we'll find out through usage.

Me: Okay, I have a few more things to show to you. Anything else you wanted to talk about?

Them: Okay. This is fine. Yeah, go ahead.

Me: So, yeah, this week the UI chat UI is polished emulator is all set up. What I'm currently working on is the latency system and trying to optimize it. So I expect that to be like dropped significantly. I can't give a number right now because I don't know what the estimates are, right? Because I don't know how bad it on averages right now. But I'll give you updates through the week on that. So that's a primary priority. Beyond that deployed telemetry. Yeah. After that, if nothing else comes up, ad hoc. Then practice notes, because I think gathering knobs on that front and opening that up to the teachers again, since it's just a data logging, like another scope to log extra data, I think that should be prioritized more.

Them: Before that, the, on the reports, we had a quick chat exchange about we need a logging system to know which reports have not got generated, not reports, which plans have not got generated. That's really business critical.

Me: Yes, I forgot. That's something I'm working on too. Let me share my screen. So. health checks. This is a job monitoring. Essentially what we need is a job monitoring platform for these scheduled functions. We need to know. We need proof that it ran. We need proof that it ended. And we need to run some sort of verification verification test at the end. Health checks.io has like a good free tier to help, like enforce that.

Them: The same agent can't report back? I mean, like, I just, I'm not sure how this works, but it's going to do some work. Like, why can't it say finally generated for so many students?

Me: So how cloud, what the function that runs in the backend, like it's called cloud functions. Firebase has a limit of 540 seconds on it. Because our student count has now gone past like 450. I think last month I had to before prior last month I was dumping all students into one 540-second function and doing it like in batches in that entire function. Now that it's if I were to do that basically exceeds 540 seconds. When we ran it in that issue too where some students got I think 70% of the students got something and 30% missed out.

Them: Yeah.

Me: So then I moved to a dispatcher and worker system. There's one function that fetches all students and dispatches workers. These workers take the information, run the LLM call and output to that specific child. The second it writes it, the function finishes. So because it's spread out I can't have each function report back centrally. What I have to work on is when each worker finishes running, once it has outputted to the database and, for monthly plans, exported to Google Drive, it leaves a completion mark in a jobs table. With a buffer, say 30 minutes after the expected end time, a verification function checks whether the number of items created matches the expected number of students. If it only ran for 300 out of 450, it alerts us by email or Telegram.

Them: But ideally, it should run again. No, like, I mean, if it's run for 300.

Me: So why it didn't run the past few times is we ran out of credits. I have a retry mechanism up to three times, and because we ran into credit limits the only fix for that is for us to add more money.

Them: What is our current spend right now?

Me: OpenRouter and OpenAI are split. OpenRouter was roughly 160 for June/July, and OpenAI was roughly 210 for June/July, with around 30 dollars of remaining balance.

Them: So we're at roughly 200 a month.

Me: Yeah.

Them: I feel like the time has come to start looking at where this money is getting spent.

Me: Yeah, because we've focused more on building features and there is likely a lot of optimization scope.

Them: And you are seeing that out of this 200 a month, 50 is only soul?

Me: These are bulk scheduled functions. Soul, monthly plan, and baseline reports run for every child and create expenditure peaks. Soul and open questions together for roughly 450 children cost about 54 dollars on one run. We also ran soul twice in one month because we wanted a new set of questions.

Them: If I have to spend, I'm happy to spend on the soul. The question then becomes frequency. Do we want it once a month for all children?

Me: That once-a-month decision was based on vibes rather than measured cost or benefit. We need to understand the cost of each run before deciding frequency.

Them: Soul is the memory of the child. If the soul is good, it permits us to have a lower quality model on chat. We don't need a frontier model directly for teacher chat.

Me: We need to find a balance between frequency of soul updates and the model level used for teacher-facing inference.

Them: Give me a table: cost per plan, cost per soul, cost per report. The absolute dollar amount spent on these three would help decide where to cut back. I am guessing Kimi could cut cost by at least five times.

Me: I'll pull the numbers using Codex and the OpenRouter API, including token estimates, and create a breakdown.

Them: Is there a way to add me as a user on the OpenRouter account?

Me: I'll try to migrate it to the PepSchool account; if that is not possible, I'll find a way to share access appropriately.

Them: We will have to look at Kimi and other models actively. GPT-5.4 is happening for everything and is the killer. Let's benchmark the right model for each task before the bill grows.

Them: Open questions for the other programs may cost another fifty dollars if we rerun soul for all students. Could we do a targeted rerun for specific programs or students, or just rewrite the current open questions into a format that forces incident-specific answers? That may be nearly free compared with full soul generation.

Me: I'll analyze the tradeoffs and follow up on WhatsApp. If the cheaper patch is painful or unsafe, we can wait for the end-of-August soul rerun.

Them: Can we chat again Monday evening my time? There is more to discuss.

### Granola recording 2 — Chatbot development, streaming, UI polish, and latency optimization

Meeting participants: Thilak

Me: Hello.

Them: Hi, morning. Can you hear me?

Me: I have a few things to show you. The emulator function that validates security-rule changes is up and running. I tested it by intentionally breaking a rule and it tripped.

Them: Nice.

Me: The biggest thing is the chatbot. It can pull reports through tool calls, has copy, friendly timestamps, feedback UI in progress, prompt starters, and a ChatGPT-like interface. Streaming is also in place, so responses appear token by token instead of arriving as one lump after the full generation.

Them: What is actually happening at the backend?

Me: It creates a chat ID, authenticates that the user is eligible before fetching data, fetches the student and relevant observations, assembles the prompt, and sends it to OpenRouter. The first message is especially slow because creating the chat and Firestore work take significant time. The teacher's data access is protected even though it is unlikely that a teacher would inspect the console directly.

Them: You stopped it, but it didn't stop.

Me: The stop/interrupt button is present but not working correctly. Retry and the UI behavior still need fixing.

Me: Tool-call loading quips are hard-coded so the user sees feedback such as “digging into the past” or “skimming reports” while work is happening. The UI is intended to feel familiar by following ChatGPT patterns.

Them: Is it good at follow-up questions?

Me: It keeps roughly 30 previous chat messages in the context window, so follow-ups are supported.

Them: The bullet point issue is still there. What model are we using?

Me: There is a small attempted fix, but it may be model-specific. The current model configuration has not yet been upgraded from the earlier setup. OpenRouter is only a gateway: we can choose OpenAI, Claude, Mistral, Kimi, or other available models by changing the model name.

Them: This needs some fine tuning, but teachers will teach us through usage. Are the chats stored in the database? Can we query them?

Me: Yes. Chats are stored and can be queried for usage analysis.

Them: Can you reproduce the usage visualization by program? It looks like the pattern is especially strong in Primary and may differ in other programs.

Me: The first visualization was created by prompting Codex rather than building a custom UI. It showed that low-friction logging increased work done at home: there was a clear weekend drop, Sunday-evening pickup, and for one teacher more than 90% of notes since June 1 were created outside school hours. We can break this down by program.

Them: I want a multiplayer analytical tool where one person can create a visualization or function and another can reuse it, rather than re-prompting Codex and burning tokens every time.

Me: The current stats page is an inspiration because it stores precomputed collections for quick reads. A more open-ended system could persist a dataset or generated visualization and let people rerun or transform it. Another idea is a daily agent with access to the dataset that looks for surprising and actionable insights.

Them: That is useful. Take care.
