---
type: meeting_record
title: "Chat backend and practice notes - streaming, scoping, and LLM integration"
date: "2026-07-30"
participants: ["Thilak"]
areas: ["ai-tools-and-chat", "observation-capture", "timelines-and-media", "analytics-and-notifications"]
topics: ["chat-streaming", "agentic-chat", "open-questions", "practice-notes", "brain-architecture", "workflow-primitives", "meeting-notes-retrieval", "structured-data"]
status: "issues-drafted"
issue_refs: [217, 211, 227, 212, 228]
source: "Granola"
---

## Meeting Notes / MOM
- Chat backend has been rebuilt: streaming is working, tokens arrive incrementally, the backend can make tool calls, and the chat is deterministically scoped to one student.
- Frontend chat polish remains: visible thinking/loading states, token-by-token rendering, pre-programmed seed questions, and better desktop real-estate use later.
- Open questions need prompt-level simplification so teachers answer with incidents and anecdotes rather than judgment-heavy summaries. Rahul approved simplifying at the soul-generation prompt level instead of adding a translation layer.
- Practice Notes were clarified as a fourth note type in the UI, but Rahul prefers the database/LLM concept to behave like an extension of the parent lesson note. Orphan practice should create a dummy lesson note to attach to.
- Longer-term architecture discussion covered brain wiring, monthly planning, composable primitives such as soul/monthly report/stats/email, structured CSV-style data ingestion, and a meeting-notes archive so agents can retrieve past product context.

## Decisions
- Keep student chat strictly single-student for now; no cross-student tool calls from a student chat.
- Prioritize latency over low-probability hallucination risk; deterministic backend studentId injection supports both safety and speed.
- Class-level/admin chat remains a future separate entry point scoped to managed classrooms.
- GPT-5.5 is the current chat model.
- Open questions should be simplified in the soul-generation prompt itself; simplified teacher-facing questions become the source of truth.
- Open questions should show only the top 3 questions per heading in the UI, even if many are generated underneath.
- Practice Notes should appear as a fourth note type in the UI.
- Practice Notes should attach to the parent lesson note semantically for LLM continuity; orphan practice should create a dummy lesson note.
- Any teacher in a classroom should be able to add practice to another teacher's lesson note.
- Lesson note title standardization/subject fields are real issues, especially in adolescent, but should be deferred.

## Drafted Issues
### Created
- #228 - Design school-level Coach Pepper chat

### Augmented
- #217 - Added Jul 30 chat frontend polish context: streaming backend working, visible thinking/loading state, token rendering, seed prompts, teacher parent-email usage.
- #211 - Added Jul 30 backend API service/primitives context, including dynamic stats calculator as a future backend primitive rather than a standalone chat issue.
- #227 - Added Jul 30 Practice Note decisions: fourth UI note type, semantic attachment to parent lesson, dummy lesson for orphans, classroom-wide ability to add practice, defer lesson-title standardization.
- #212 - Added Jul 30 brain wiring context: Rahul can experiment locally now; monthly-plan brain wiring needs evaluation/safety before prod.

### Skipped
- Dynamic stats calculator standalone issue - folded into #211 context.
- Meeting-notes retrieval archive issue - already in progress via this archive workflow.
- Structured assessment CSV ingestion from this meeting - dropped for this triage run.
- Open-question prompt simplification issue - ad hoc prompt work to be done directly before the next soul-generation run.

## Post-Meeting Additions
- Soul regeneration schedule confirmed in `functions/students/soul.js`: `regenerateSoulsMonthly` runs at `0 2 1 * *` in `Asia/Kolkata`, i.e. 2:00 AM IST on the 1st of every month.

## Open Questions
- What exact frontend chat polish belongs in the next issue versus later desktop layout work?
- Should the chat agent get a calculator/stat-query tool for dynamic teacher questions that precomputed stats cannot anticipate?
- How should Practice Notes be persisted: embedded extension data on the lesson observation, subcollection under the lesson observation, or separate observation docs with links/backlinks?
- How should a dummy lesson note be shaped when a Practice Note has no existing parent lesson note?
- What are the final per-program Practice Note dimensions?
- What folder architecture should make meeting notes and transcripts queryable by future agents?

## Raw Transcript
Me: I'm seeing money. On. Can you hear me?
Them: Yeah.
Me: Awesome one second. So I was just checking the feedback and I think flow she asked for feedback saying can there be a place where all media for one student can be viewed at once? So I like replied saying that feature exists in the timeline and I was just trying to visually describe it on text. So hopefully she reads the feedback and it's clear. But yeah I'll get you stuff now Granola running.

Me: The chat. Now is revamped fully. So now streaming is also there and that should basically improve ux because previously we would wait for the entire message save it in the database and issue it. Now we get one by one we get each token. It's agentic now. It has two laxes. It can dive deeper into the observation history. It starts off only with the soul. And it does all of that on its own. It is coped to only one student though. And this is something that I wanted to ask you about.
Them: What do you mean?
Me: Currently if you've noticed the chat option actually says under maintenance because I had to make some changes in the in production to test it. So I it's still not like ready to push out to all the teachers still some visual polish left.
Them: Yeah.
Me: But I can show you functionality in the meantime. But yeah what I wanted your thoughts on was. Okay can you see my screen?
Them: Yes.
Me: Yeah so if we go to coach for me it shows up like this I think for you it just says. Oh sorry I should had the wrong one up one second. Yeah. Right so this is adhya garbala right so if I ask it to talk to me about aakasharul kumar in the system prompt I say kindly reject the user because what I'm doing in the back end is. In the process of the agent making tool calls again I don't know if you want the chat to be forcibly scoped to just one student that is invisible to pull invisible and not not even just invisible but like the tool cards shouldn't be allowed to be made to other students just so that it's scoped to one kid so how how are you envisioning this per child chat like do you not mind some level of crosstalk? And the reason I'm asking this is on the off chance of hallucination because if the agent has the ability to output student IDs for the purpose of tool calls. On the off chance and that is wrong we might prompt it with a question about Adya agarwal and get a response for akash arul kumar. And that I think the whole point of this setup is to avoid that confusion. But I think this becomes null and what if you don't mind crosstalk which is what I want to like pick your brain about.
Them: No, I think contextually a teacher would typically have conversations about a single student. Either they're having a conversation about a single student or they're having a conversation in general about the whole class. Like that. You know, operating on either extreme. You're not operating in the middle. So you understand? No. So it's almost like, I mean, it's worth thinking about, do I want chat at a whole class level?
Me: Yeah.
Them: And maybe that's a question for another time.
Me: Yeah I think that is on the table anyway like I'm imagining a new chat button over here. And then we I think to start off is a super admin classroom admins point is to empower proactive users right and this chat will be school wide or rather scoped to whatever the classroom admin whatever classrooms they manage. Right so my mom will get just the lowest lung toddler.
Them: Yeah. Yeah. Yeah. Yeah. Yeah.
Me: And psy will get adolescent so on and so forth so this chat that would be like a fifth button over here will be school right?
Them: Yeah.
Me: But yeah my question is specifically for this.
Them: No, that's then keep a student level. That's fine.
Me: Okay so deny teachers seeking information like this like they won't try to jailbreak it but if they switch contexts and they get curious we well what I'm trying to do is redirect them to another chat.
Them: So the challenge here is what is it? Is it that you're worried about the like the 5% chance of hallucination?
Me: Yeah.
Them: Or does it make it substantially slower? I'm more worried about speed, actually. Like, I don't really care about like 5% hallucination.
Me: I don't think.
Them: I think usage needs to be fast. Otherwise you won't get usage.
Me: Yeah yeah so the priority is latency for sure right.
Them: Yeah.
Me: I don't think forcibly scoping the agent to just one kid reduces latency in fact it helps it if anything because the student ID is something I'm adding unintelligently in the back end you know there's like hard like for this chat it's a hard coded student ID I can double check again but I'm confident it doesn't affect latency.
Them: No, but if you, if it had to go and read, everybody's soul, then you'll have to go do a check on. Does it pertain to this classroom? Does it pertain to scope? You know, you get into all kinds of things.
Me: In the case that it does accidentally suggest two student IDs or five student IDs if it's derailed for whatever reason then in that case yeah because of its fetching yeah.
Them: Simple for now. Yeah, I would keep it simple. Just individual student.
Me: So in this case it's forced to it's forced to look at just one student okay okay.
Them: Yeah. Now I'm guessing that like I'm trying to understand how this is set up. So the back end, like what is the information available to it?
Me: You can fetch past observations past all the data but only for this kid and how I'm ensuring that is the agent in its quest to find more data it makes a tool call right typically in that tool call the client or the user ID for which the data is required is also passed by the agent to prevent that from being non adhya agarwal related I am asking the agent not even to output that because that is something I'm injecting through the code directly so that is 100% deterministic right.
Them: Yeah. So I mean, soul should not even be available to this particular chat, right? I mean, in the sense that.
Me: Yeah her soul is always given as like a prefix like in every message.
Them: But even her observations should not be available. No, I mean like, no, nothing tagged as adhyagarwal should be available in a chat about akash. This is about akash. No, it's an akash.
Me: Oh no no this is about Adya this is yeah.
Them: Okay, so in okay, so in adhya's chat, everything about adia should be available. Nothing not about. They should be available. Correct.
Me: Yes yes yes yes what I am giving by default is the soul and I can decide what more information to give but everything else is available via tool call and I think an argument to like why don't we just dump everything because the context size is like 1 million tokens or at least 250 like 128k tokens I mean unless teachers have really really long conversations we might break it again just latency right it might help for a for this agent to be sufficiently informed and then if a teacher asks a deep question it can just fetch relevant information.
Them: Yeah. How like can we see like speed? Like just like ask something. Like and it doesn't see the media.
Me: No I haven't added that as a tool call yet.
Them: Is the media, the analysis of the media?
Me: Yeah oh okay okay yeah it's part of observations yeah you can't see the image and actually I should be able to see the image too. But it can because media observations are just like it's part of the same collection.
Them: Okay.
Me: What do you what do you want me to ask.
Them: Just saying like how is the child's writing? What do they need to do next?
Me: Yeah so the UI needs to be polished for sure.
Them: Yeah we need to show some sign that it's thinking whatever.
Me: Yeah. Yeah yeah and so the back end like a lot of the stuff I had to work on was just streaming and the back end is working now let me share my entire screen one second I'll just show you this thing because I think this will give you a good idea. One second I'll just screen share it's asking me to give permissions I restart. Yeah. Yeah can you see my entire screen. Yeah so if you locate this. So what I focused on was streaming right here yeah so you see bit by bit it's like fetching writing analysis and now that we know it's doing that I it should be pretty simple to show some UI for it. But yeah.
Them: You can just output that only like fetching right analysis.
Me: Exactly but polishing the UI should be very simple but this is the bigger achievement here because every every token comes individually and that's what you we just need a faster refresh rate. But now that the back end this is what I struggled with the past couple weeks but yeah now that we get this it should be the issue is more about how do we render it in the UI and point is we just want to show token by token.
Them: Okay. Yeah.
Me: Right. Yeah.
Them: What model is being used.
Me: I think this is 5.5.
Them: Okay. Ila is giving some unexpected insights about. Oh still doing. Oh.
Me: I mean I think it's done. I don't know why this is.
Them: Okay.
Me: Okay.
Them: I'm also thinking about how old teachers use it often they will do something and then they'll copy and paste it and put it into email. That's what they'll end up doing they'll want to what should I tell the parents they can ask like we can even have. Some pre-programmed like questions. Right like that they can just tap and it just goes and does something.
Me: I have that too like in the UI that's a simple UI fix but like in a new chat how like how chat GPT offers three four questions about the various domains right like the seed the prompt we can come up with our own equipment but the I think my inspiration is just to very closely mimic chat GPT because I know teachers are most familiar with that so that is the goal.
Them: Yeah. Yeah. What second system prompt I want to see. Which is share it with me separately I can take a look. It's trying very hard to be helpful. Which is okay this same was just go sl.
Me: Yeah.
Them: Okay keep going keep going. Keep going. Keep going. Wow quality is good.
Me: Yeah. So. I'll share the system round with you I'll polish the UI there should be a few more latency optimizations I can make but yeah the back end plumbing is like more or less done.
Them: I guess maybe now though there's a question of like on the website like on the larger browsers. We don't is should be now start thinking about expanding the real estate that we use and so on.
Me: Yeah yeah.
Them: Because obviously be you know we're optimized for mobile which is okay. Anyway there's something to think about.
Me: That's been on it's yeah that issue is ice boxed for now I am I think I'm just waiting for your college to when to bump that up priority because I think beyond this chat plumbing that I was working on the majority of this week was spent on the emulator test suite so that's a pure back end change that's actually almost done.
Them: Yeah.
Me: Too now any future pushes that involve like an addition of practice note which I'll talk about in a second because that will mean updating rules and extending whatever teacher rules currently to a fourth note right.
Them: Okay.
Me: And historically while editing rules all teachers have noticed like as as of you right suddenly the timeline vanishes or it's a zero or some numbers are off so that should be caught now because all the scenarios are generated and you know there's a setting one and then some operations and setting two and there's a whole like production emulation flow going on.
Them: That's a separate service that we are using like how does that work the ml.
Me: That firebase provided.
Them: Provides it oh nice okay.
Me: Yeah I think only the only external service we're using is recent for email and open router for like the llm gateway everything else there's still a lot more for me to use in firebase. Like there's something called event tracking where you can like track user flow like where they're clicking in the app and I have that very basic like fundamentally like just the basic setup that's something I can work on too but again just depress that deprioritize that for now. I did get time to think about the practice notes and I do have some so I realized I think most of the UI and ux I'm clear on because for the most part it should like faithfully stick to less notes right I think the only difference is we mandate linking the practice node to a pre-existing lesson node and if not a pre-existing lesson or not a free form less entitle which we'd hope that they don't resort too often but either way they can do that.
Them: Yeah.
Me: And everything else is the same big student individual group ratings that we can you will eventually come up with and I can add it in the system. What I was and I think this is the more interesting part how do we present this data to all of the llm pipelines we have up and running now, right, because it's not. I think just adding it like here's text like chronologically can actually like we'll be missing out a lot of information think what's some what's a better way to do it is here's a lesson note and then we can like add a link like when we assemble the prompt to the llm and we fetch all nodes to present to it there's a less note and immediately for that if you know that there's like a follow-up practice note we can show that right so there's natural continuity for the llm to see. And I think there can be some gains as to how we present it and I think that is more of the design choice that I think we need to talk about. But UI/UX side I think it's mostly sorted.
Them: From what I understand like a lesson note effectively somewhere is like some row on a database. Right I mean that's what it is. So the practice note is actually like a column pertaining to that same row it's like you have the row saying lesson note and you have an extra column there. With certain dimensions which is. A follow-up or practice note pertaining to that row. Right I mean I would do it like that like does it make sense?
Me: Okay okay okay okay that that actually conflicts with okay so how I was thinking of it anything how we were talking about it in the last meeting was it's a fourth type of note. And by that by extension.
Them: Yeah.
Me: You would think that it's a new role in the database it's a whole new note. Right so this lesson note here and then this practice note but what you're suggesting is it at least how we present it to the users is a fourth time.
Them: Yeah. That's only UI correct I think I'm drawing the distinction between what it looks like versus what it is.
Me: Okay and I understand it has to look like it's a new note because it's a path that the teachers will take off right like we said we don't want them to find the lesson note and that's clunky so this easy access to it so add note button and fourth type fourth node type.
Them: Correct. Yeah correct. Some practice notes may be orphans where they know there's no lesson note on it but some practice happened anyway I mean that's okay so we'll create a new sort of dummy lesson note for that.
Me: Okay. But then you want that content to be present in that same lesson note as an extension.
Them: I would do it like that. Yeah because then I think the llm will make sense of it because it'll know okay the lesson was given on this day now this observation happening on this day it'll the all the metadata is already there.
Me: Right. Right yeah if we treat it as separate nodes then it's going to be chronologically sorted and we lose some semantic information because to us it's linked. But it won't look like that the llm okay that's clear I think that brings up another question.
Them: Yeah yeah.
Me: Can one teacher add a practice note to a lesson note created by another teacher? Yeah.
Them: They can the lesson notes then I don't know how it is right now because somebody thinks I or somebody came to me saying that the media. Not I mean he it's slightly adjacent point but he had gone and done a class so he created a lesson note. And I think there's a refresh we do on the lesson note which doesn't reflect immediately in the tagging.
Me: I spoke to him about it he expressed the concerns so I locked them so yeah he said the lesson didn't come immediately and he had to wait some time and then tag it later.
Them: Right. Yeah. Yeah. Which I think is okay I mean I don't think it should come immediately.
Me: It should be simple to add a refresh button there too just as we have in the timeline added there too.
Them: Yeah. Yeah so I think that's a smaller point but I also then got the doubt of is the lesson not what is the scope of the lesson not access right is it seen by everybody in the classroom.
Me: Yes just like any other note yeah like if you create one any side will be able to see too yeah but I will not be able to edit your lesson note like he won't be able to edit the lesson notes content but now what we're essentially suggesting is him is an edit so so we are expanding like loosening the rules a little bit there okay.
Them: Everybody in the classroom will see it. Yeah so then. Correct so then. Correct. Practice note is an edit. Yeah. Yeah. Because anybody can see that practice and report that practice right I think the bigger problem we have is actually when I see how they are using it the way I mean in in in actually almost all classes the way they are titling their lesson notes they're using it's not at all streamlined.
Me: Yeah.
Them: Right so. You see the all some people are writing the whole text of the lesson in the lesson note title.
Me: And how long is that going up.
Them: Some like like 100 words.
Me: Like. What?
Them: Yeah people have done all kinds of things right and again then see we have to really think of them as like you know non-tech people. Right.
Me: Sort of like like I think there's a concept of like adversarial users in some apps that really had a one in a million but they exposed the edge cases and it feels like this is like this is.
Them: Yeah. Yeah. And so when you go and try to tag a media note you suddenly see some giant giant lessons you know you get it all these weird intellig.
Me: Some places look weird that you won't even like it's hard for you to think about right now because that is what the like heavy tale is right like it's like re it's really an edge case.
Them: Ence. Yeah. Yeah. Then I thought okay it's not such an edge case also because. I mean I don't know I feel like for example in the adolescent. Like there's no provision to tell the subject you're doing. So people just write their lesson title assuming that everybody understands which subject you're working on. So for the human which is especially difficult to understand if they're reading the time back. You understand?
Me: Okay.
Them: Nobody saying physics I studied some velocity time graph it is dumping whatever they have done there. And these are learnings it's okay I think we'll figure it out it's not not an important thing but I think keep it simple now let the lesson node just add. Practice node just add to the lesson node.
Me: So do you want another field in less nodes for adolescent called subject.
Them: Right. Yeah I mean I think we'll do it I want to think through it a little bit say I want to get to a world where the lesson titles are all.
Me: Okay.
Them: On a speaker right you just select it and then you run with it in the most ideal world it's coming out directly from the plan. Right that is full control at the end of the day so I think till all of that happens I don't want to touch it for now right way it's okay let them do their stuff at least now again the usage again I think is good overall.
Them: Will the chat have metadata can they ask how many observations have I made about adag. An.
Me: It has access to the stats. But I think that is overall stats I don't know if so remember how I told you a couple months ago we switched to precomputed stats that you can refresh which is how it's really quick now that works because there's a formula that runs every night or whenever you manually trigger it and it outputs like 100 fields right those 100 fields some of them can be last one week last one month for the stature for this program whatever so if in that case in a chat setting it's not dynamic right because you can't foresee all the stats that the teacher might ask because they might ask a weird combination right how many notes have I and are like another teacher made in combination or like point is you can't foresee stats.
Them: Yeah. Yeah. That's the tool call no so there's no tool called possible where it goes and I'm again thinking of all scenario so because that is a common use case for them not so much how many but you know like.
Me: Currently.
Them: When the generating reports there will be like I want to know what is the status and reportedness will give me something. But I don't know they may at the meta level they will ask questions for sure.
Me: Yeah. And right now they will get stats from the precomputed folder so the hope is that it is from within that which makes the agent's job easy to respond. If it's not then it is going to do manual counting.
Them: Okay.
Me: So in that case I might have to think about how to. Yeah maybe give it tools to do the math as opposed to like fetch the notes and then run a count on it you know like but yeah you that that's a good point you raise. So I'll try to give like the agent essentially like a calculator.
Them: Yeah and we can keep adding these I feel like as it stands right now it will cover 70 80% of the use case.
Me: Yeah. Yeah yeah yeah.
Them: Right and that's good place to start.
Me: Yeah right now it's it's mostly yeah observations term report baseline report open questions.
Them: I get to chat from the timeline no so I go to the child and then I go to chat that's the path.
Me: Yeah because it's like child specific.
Them: Got it.
Me: So that's the yeah that's the chat update practice note yeah we spoke about the lesson note edit.
Them: Hey just give me one minute. Sorry.
Me: Some clear and practice not to at least for now. Open questions that is still gated to just super admins should I open it up.
Them: No I like it I. I wanted to modify the prompt there. Because I feel like. That too many questions. On the UI side.
Me: How many I'll screen share how many do you how many do you think would be ideal.
Them: Like. The top three per heading.
Me: Okay so from what I understand then you want it's it's okay that we have let's say let's say this is like 80 questions okay it's okay that we have 80 questions but the AI should face the brunt of the 80 questions and the teachers rather should like have it easy and see like three questions for each section.
Them: Yeah yeah and also like I. It's I mean the feature is good it's just it's right not the prompt level where they want to understand this language the language is quite difficult for general teachers to understand. Right it's extremely it's talking like you know when I work with claude code it talks in a certain way you know it's very terse and very.
Me: Is jargon there's monkey like the level of English is a little polished.
Them: How does adya process long oral instructions or excellent discussions or visual anchors they will not understand.
Me: Yeah it needs to be like either dumbed down or explained through an example.
Them: Yeah exactly exactly. Which means there is some massaging needed. From soul is generating the right questions but again this is a new problem like problem in the sense that the soul's questions cannot be put forth like this it needs to be translated for teachers.
Me: How are you presenting. Okay so some sort of layer to make it palatable.
Them: Yeah and I think the related point here is this forces judgment from teachers when we want we want observations from teachers. Right this is forcing more summary style response that's there's a slight issue there. You see the difference.
Me: Yeah I do it's it's not directed enough.
Them: It should be more like tell me a time when you saw X right it needs to be massaged that's what so I needed to know how do I do that massaging.
Me: Okay. So you want like another.
Them: Right. So filter it's just a simple simple filter. Even if there actually 80 questions it's okay the problem is not the length the problem is it's just very difficult like you know I see it no man not an easy question to answer.
Me: Okay. Do you want to run through it now like I can just take a screenshot of it.
Them: Yeah.
Me: And dump it in chat GPT and ask it to simplify it.
Them: Yeah. Yeah. And simplify it for teachers and make it more example oriented right make it more.
Me: Yeah.
Them: I mean the question should be framed so that the teachers are giving you incidents and anecdotes not judgments.
Me: Anything else you want me to. This one.
Them: And yeah that's fine yeah I can't see it anyway go ahead.
Me: Oh my bad. One second. Tell us about time they all seem to lose track of what is happening what yeah this essentially the same thing right.
Them: Yeah much better. Very good. Essentially the same thing but it's just it's not talking like a doctor.
Me: Yeah yeah exactly because this what like mental drift or whatever is boiled down to what did she do and the teachers indirectly answer that as in response to this question by saying or she daydreamed or whatever right and.
Them: Yeah. Yes it goes as an observation nicely it goes into an observation.
Me: Yeah yeah yeah it should be our job to understand what that they are still answering this but just with a dumb question like this.
Them: Right. Yeah. Yeah. It's much better immediately much better.
Me: Okay. Okay so an extremely lightweight layer on top of.
Them: I mean I guess the question is then in the soul generation process itself why can't we reduce just modify the prompt to generate this only.
Me: Yeah.
Them: Because that is intent no the intent was to create a set of questions for teachers. But we're just saying use this language when you create that set of questions.
Me: So how I was thinking about it was in the what the agencies is this high level English right but then what we show to the teachers is simplified but what you're suggesting now is the simplified is the source of truth.
Them: Yeah because the the simplify or the end use envisaged was always to go take these questions and put in front of teachers by way of the interview. Right so we are saying that okay for that end use anyway this is not a good question to ask. Let's modify the question.
Me: Okay so you're saying even for the agent processing if it doesn't have a front end these simplified questions will do.
Them: Yeah. Yeah. And I think that if you just change that it's ready to be pushed it's a great feature actually I think it will unlock a lot of their thoughts.
Me: Okay. Okay I think soul an open questions would be generated day after on the first.
Them: Yeah so literally if you add this.
Me: So I'll try to do it right now and then I'll run a sample of it I'll send it to you and then it should be bulk generated anyway in two days.
Them: Yeah. Yeah and then it can be a feature for all users.
Me: Okay. Okay so I'll make the prompt change for the soul simplify questions send a draft to you if you give me an okay I'll let the let it run I'll update.
Them: Yeah yeah. I don't need to see it also because literally you have just shown it to me right I mean I just saw it that's all just make that change send it off.
Me: Good.
Them: That'll be great actually so then that will go live.
Me: Okay then once I update the prompt I massage it it runs for all teachers yeah I can open it up right now it's still gated by super admins and open it up.
Them: Yeah.
Me: Otherwise that's it so chat back end done front end polish remaining emulator done practice notes clarifying questions asked yeah that's all I had to bring up.
Them: Okay sounds good so we'll try to get this live anyway I think new plan generation will happen the the that architecture stuff sorry just give me one minute now just give me one minute.
Me: Yeah. I think you had a question regarding the brain architecture.
Them: So that. That's more or less done can I start using it?
Me: Yeah you pull it and you can start to mess around with it you can push as well it's not wired up yet.
Them: That wiring is what I want to ask because I think on the planning view like we are thinking a lot in that direction. Right because we want to give. The lot more MD files coming on planning.
Me: Monthly plan.
Them: Monthly plan not for this one but for next month.
Me: Okay okay yeah in that case yeah you can continue to play around and start to augment it right build it up and then as I think about some evaluation layer before just as a safety check so if for you to push before it goes to prod and wire it up that should be done by next month and whatever you need access to is set up so you just have to pull from master and you'll see the folder structure in your ID in your terminal so you can start messing around with it.
Them: Okay. Yeah. No sounds good I think the other model is like the way you did the test bench. Now like I'm feeling like maybe that's one world where. We build a suite of different front ends. That goes and talks to the same backend. Like for example right now I'm using codex to kind of say okay if I want to generate parent summaries we're experimenting in one of the classrooms to say I want to send a parent summary every month. With images embedded. In an HTML format. Can we pull it off and obviously you know on codex it's been fairly easy. So now it seems like I can just build a separate. Product. Right or a sort of a mini product that is exclusively for. Let's say parent summaries that is effectively completely distanced or separated. From this code base.
Me: What do you mean separated.
Them: Right. It's a different project it's just it's just leveraging the data. It's like it's just going directly to the database and extracting the data because the app right now like we said it's like it's front end for data collection.
Me: Yeah yeah so what I'm understanding is this soul generation monthly brand generation report generation at the end of the day it's just a function that runs on a schedule right and that function makes an llm call to make the llm call it fetches data it assembles it it gets a response if it's a tool call it runs another function if the response gives it to the UI.
Them: Yeah. Yeah.
Me: At the end of the day it's a function right what I have understood from all our conversations in the past I think two three weeks and this is with respect to creating that sort of API service that codecs can fetch and tap into email and what generation and HTML whatever all of that you're talking about is outputting one function right that runs let's say once a month outputs an HTML to all parent emails given this input information given your prompt that you iterated with.
Them: Yeah. Yeah. Yeah. Yeah. Yeah imagine that yeah.
Me: And given your like your validation right you you would have seen outputs you would have you know given a green signal so at the end of the day you you want to create that one function right so that's I like correct me if I'm wrong but that's what you mean by like separate from.
Them: Yeah. Something like. That. Yeah I mean it's like see I'm saying like what are the important primitives that we can offer to any. Approved user to build whatever they want. Right the soul is a good primitive. Right email is a primitive as a as a communication service. So now imagine that if that is available to a approved user on the front end maybe they say I want the soul of these 10 children to be emailed to me every week and it just happens they click two buttons and it just happens. So similarly monthly report is a primitive. Right. Because that monthly report I can use that monthly report and say monthly report I want to chat with the monthly report we can create that I want to send emails using the monthly report we can create that. Like you understand no so.
Me: Oh so you're thinking of this as. Some sort of custom like like imagine like a drawing board where you're like I pick this block which is input sold I pick this block which is email to myself on a schedule of once every two weeks and then I pick this block to confirm it and then each of the block is the primitive that I should have to build up which we have all the code we haven't we haven't wrapped it up like that right and that's something you want to sorry what okay.
Them: Yeah. Yeah. Yeah exactly. Yes. Exactly that yeah exactly that and similar stats is a prim. Itive yeah. Stats.
Me: Okay. And what purpose is each teacher wants a different thing right so you want to offer a teacher the ability to come up with their own like workflow essentially.
Them: Yeah we want to get there yeah. I mean yeah exactly workflow and beyond the point C we already have all the data right right now there's not much more data structure data is left we'll get that also.
Me: Yeah.
Them: After that it's over right I mean you've got all the data. So I mean I'm just thinking a lot right in terms of how do we know. Like I'm just because I'm doing this parent report or whatever right what am I doing there's a prompt I have I'm running it like in a really brute force way across all children. You know and whatever it's generating something for me but you know like we have to really make it easy you have to make it like a calculator actually where instead of multiplications and monthly report is there right and we are just tapping some things and some things are coming for us.
Me: So is this how you envision it for yourself too? Because initially I think we spoke about it from year length where you wanted to play around with it on your codex but now I think we're expanding to like this custom workflow creation for teachers right.
Them: Yeah no that's also that again I'm wondering. Like that seems fairly easy for just codex you just do it on its own right I'm saying because the valuable thing is still the. Getting all the data in place. Right and we still have let's say maybe like practice note we have the structure data that I'm still seeing like good few months of work. To get that in which I think we should still prioritize. I'm just thinking aloud for myself actually like if because I'm finding that I'm going to codex many times and I'm creating little products for myself. Right now like okay but. Obviously I don't want I also don't want to use codex I would prefer like just give me a nice front end I'll just go ask for what I want get it. And that's where the thought came from right that then if I'm thinking like that then other teachers may also think like that. S one one line of one line of thought. Because otherwise I'm like I'm having the experience of a tech savvy teacher in a way right I will say go do this then send an email you go set a resend all of that I'm saying but teachers are not savvy they won't even know what is HTML.
Me: Yeah yeah yeah.
Them: Right. And see it will start becoming important because at some point we will need to generate custom reports we will need to do a bunch of such things anyway so that's just some food for thought.
Me: I've been creating like I create a new project for this like back in API services layer like that whole space of concepts and I'm just building up context in it right now so I'll add what we spoke about today to that too.
Them: Yeah. Yeah. I think that's yeah we'll ahead I think for the teachers now I think questions will be fantastic like really unusual form of data gathering right which I think it's going to work. And this this thing about the. The structured data I think once we get that also live along practice node anyway I think will fairly straightforward to do. I mean then we are more or less done I think with. Ingestion right there it's just enough enough stuff. And I want to move more towards how do we influence teachers how do we get them the data chat will be a game changer just I'll if you know if you once we push it out.
Me: The latency is like as the apps these apps right like 0.5 seconds one second.
Them: Yeah yeah point for second one second latency with 5.5 in the back end no teacher can ever say I didn't know what to do. Right that's completely gone. Right because then we are leveraging the intelligence on tap right. Really. So yeah I mean I feel like. I think it yeah I mean now it's only about. Using using the intelligence more and more. Right.
Me: Yeah I augment the project with the information we spoke about and beyond practice note I think you said structure right that's a set that's assessments like assignments.
Them: Assessments like anything where there is a csv kind of a table. List of children list of scores and maybe list of comments something. Right we need a way to get that in.
Me: Yeah. Yeah. I also just started like with this week I'll start to save all of our meeting like moms and transcripts in a way that's accessible to the agent because from my conversations with it I am realizing that I wanted to go back three weeks because I remember conversation we had very vaguely and I wanted to tap into that because there was a lot more like golden nuggets of information.
Them: Yeah.
Me: Right and luckily because of how I've done things it's embedded in like issues I create right I basically distill whatever you talk about now into issues.
Them: Yeah.
Me: There's anecdotes like of whatever we've spoken about so that is still what I'm doing right now is coming up with some folder architecture to save everything but I think the push there also is just to work on infra that we just gather all the data that we can and the point is it will just be there for the agent to intuitively find whenever it deems necessary whenever it requires right this moms I think it's mostly important to me maybe on an off chance to you too I don't see anyone.
Them: It's important this yeah it'll be helpful for me also.
Me: Yeah.
Them: Yeah.
Me: Exactly point is to gather as much information and just the agent should be able to fetch and we'll decide what we want to do with it but that's the most important thing like make everything like queryable right like meeting notes and just whatever we can think of right so.
Them: Yeah.
Me: I think that mindset of thinking about the product development really changes things because then you're worrying about not worrying but trying to. Build in data collection mechanisms earlier right and then as you go you improve schemas or whatever. So. Yeah. That's all I want to.
Them: Sorry 640 sorry I have to run now we'll connect again next week and realize the time okay thanks see you.
Me: Shut off.
