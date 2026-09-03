import type { Course } from "./catalogue";

/**
 * Productivity and design courses.
 *
 * Chosen to serve the same person the compliance courses do. A compliance
 * officer spends most of their week deciding what to work on, writing things
 * other people have to act on, and putting findings on a slide — so these are
 * not a change of audience, they are the rest of that person's job.
 *
 * Same caveat as the rest of the catalogue: demonstration material, written to
 * be genuinely useful, not reviewed by a subject-matter expert.
 */

export const FOCUS: Course = {
  slug: "working-deliberately",
  title: "Working Deliberately: Attention, Priorities and Finishing Things",
  subtitle:
    "Why busy days produce so little, and the small number of changes that fix it.",
  description:
    "Most professionals are not short of effort. They are short of uninterrupted time, clear priorities, and any reliable way of deciding what not to do. This course is about those three things: how attention actually works and what interruption costs, how to choose between tasks that all feel urgent, and how to run the meetings and inboxes that consume most of a week. Practical rather than aspirational — no system to adopt wholesale, a handful of habits that hold up under a real workload.",
  category: "Professional Development",
  level: "BEGINNER",
  modules: [
    {
      title: "Attention, and what interrupts it",
      description: "The mechanics before the tactics.",
      lessons: [
        {
          title: "What an interruption really costs",
          minutes: 8,
          body: `The cost of an interruption is not the length of the interruption. A colleague asking a two-minute question does not cost you two minutes.

Work that requires holding several things in mind at once — reading a contract, reconciling a report, writing an assessment — depends on a mental model you build up as you go. An interruption discards it. Rebuilding takes far longer than the interruption did, and the rebuilt version is usually worse: you resume with less of the context you had, which is why people re-read the same paragraph three times after being interrupted.

This has three practical consequences.

**Batching interruptions costs less than spreading them.** Six questions answered in one twenty-minute block costs one rebuild. The same six spread through the morning costs six.

**Notification settings are not a matter of taste.** A device that interrupts you every few minutes makes work requiring sustained attention impossible, regardless of your discipline. This is not a character failing to be overcome.

**Some work genuinely does not need protection.** Answering routine email, approving expenses, filing documents — none of these hold a fragile model in mind, and doing them in fragmented time is fine. The mistake is treating all work as the same kind.

The useful distinction is not "important versus unimportant" but "does this require me to hold something in my head?" Protect only the second kind, and protect it properly.`,
        },
        {
          title: "Making time that cannot be taken",
          minutes: 8,
          body: `Everyone agrees uninterrupted time is valuable and almost nobody has any. The reason is structural: in most organisations, an empty slot in your calendar is a slot someone else may book.

So the block has to exist as a commitment rather than as an intention.

**Put it in the calendar, with a name.** "Focus" is easy to override. "NDPA gap assessment — drafting" is not, because the person about to book over it can see what they are displacing.

**Choose the hour deliberately.** Most people have two or three hours a day when demanding work is genuinely easier. Find yours by noticing when you last did good work, not by adopting somebody else's schedule — the advice to rise at five serves people whose best hours are early, and ruins it for everyone else.

**Ninety minutes is usually the right length.** Long enough to build up context and use it, short enough to defend and to sustain.

**Protect one thing, not everything.** Attempting to make the whole day sacred fails within a week and takes the habit down with it. One reliable block beats five aspirational ones.

And the part people skip: **decide the night before what the block is for.** A protected hour spent deciding what to do with the protected hour is an hour spent deciding. Name the specific piece of work, and start on it immediately.`,
        },
        {
          title: "The myth of multitasking",
          minutes: 6,
          body: `People do not multitask on cognitive work. They switch between tasks quickly and pay a cost each time.

That cost is real and measurable. Every switch requires loading the new task's context and setting aside the old one, and the residue of the previous task degrades performance on the next. Someone answering messages while reviewing a document is doing both worse than they would do either alone, and — this is the part that makes it persistent — feels more productive while doing so, because activity feels like progress.

Three consequences worth acting on.

**A meeting attended while working is a meeting not attended.** You will miss the thing you were there for, which is generally the one moment the meeting needed you.

**Two open pieces of demanding work is one too many.** Finish, or park deliberately with a note about where you were, then start the next.

**"I work better under pressure" is usually not about pressure.** It is about a deadline finally removing the option to do anything else. What helped was the single focus, not the adrenaline — and it is available without leaving things until the last night.

None of this argues for rigidity. Interruption is often the right call; a colleague blocked on your answer should interrupt you. The point is to know what it costs so you spend it on purpose.`,
        },
      ],
    },
    {
      title: "Deciding what to do",
      description: "Prioritisation is mostly the discipline of dropping things.",
      lessons: [
        {
          title: "Urgent is not important",
          minutes: 9,
          body: `The most useful distinction in prioritisation is between urgency and importance, and the reason it is useful is that urgency announces itself while importance does not.

An urgent task has a deadline, a person waiting, a notification. An important task is one whose outcome matters. They overlap sometimes, and the trouble is entirely in the two cases where they do not.

**Urgent and not important** — most email, most meeting requests, most interruptions. These consume the day precisely because they arrive with a claim on your attention. Ask: if this were never done, what would actually happen? Often the honest answer is "nothing much".

**Important and not urgent** — the assessment nobody has asked for yet, the process that should be documented, the skill you keep meaning to build. Nothing forces these to happen, so they do not, until they become urgent through neglect and are then handled badly under pressure. Almost all preventable crises live here.

The practical technique is not a matrix on a wall. It is a question asked once a week: **what is important and not yet urgent, and when this week am I doing it?** Then put that in the calendar as a block, because otherwise the urgent will take the time.

One further point on the word "priority". If everything on a list is a priority, nothing is. A list of twelve priorities is a list of twelve tasks with no decision made. The decision is the work.`,
        },
        {
          title: "Saying no, and the cost of not",
          minutes: 8,
          body: `Every commitment you accept is capacity removed from the ones you already made. That is arithmetic, not attitude — and it means saying yes to everything is a way of quietly failing at things you already promised.

The difficulty is that refusing feels rude and accepting feels helpful, in the moment. The cost of accepting arrives later, distributed across the work you now cannot do properly.

Some ways to decline without damage:

**Say what it would displace.** "I can take that, but the quarterly assessment moves to next week — which would you rather?" This turns a refusal into a decision, and hands it to the person who is entitled to make it.

**Offer a smaller version.** "I cannot lead it, but I will review the draft." Often the smaller version is what was actually needed.

**Say when rather than no.** "Not this week; I could start on the 14th." A commitment you can keep beats an immediate yes you cannot.

**Buy time honestly.** "Let me look at what I have on and come back to you this afternoon." Almost nothing genuinely requires an answer in the moment, and answers given in the moment are the ones that later go wrong.

And be aware of the asymmetry: agreeing is pleasant now and expensive later, while declining is uncomfortable now and free later. Our instincts are calibrated for the wrong half of that.`,
        },
        {
          title: "Finishing",
          minutes: 7,
          body: `Started work that is not finished has almost no value, and it is not free — it occupies attention, requires re-loading every time you return, and slowly turns into a list you feel bad about.

Some things that help.

**Limit work in progress.** More things started does not mean more things done; it means everything is done more slowly and several will never be done at all. Take fewer things at once and see them through.

**Define "done" before you start.** Work with no finish line does not end, it drifts — the report keeps improving, the process keeps being refined. Write down what completion looks like. It also stops the other failure, where something is quietly abandoned at 80% and nobody notices for a month.

**Make the first step small enough to be trivial.** Not "write the assessment" but "open the document and list the section headings". Most procrastination is not laziness; it is an unclear next action. A task you cannot start is usually a task you have not broken down.

**Prefer finishing one thing to advancing three.** Five things at 80% deliver nothing. Four at 100% and one untouched deliver four.

**Park deliberately.** When you must stop mid-task, spend two minutes writing where you were and what comes next. It is the cheapest thing in this course and it saves the most time.`,
        },
      ],
    },
    {
      title: "Meetings and messages",
      description: "Where the week actually goes.",
      lessons: [
        {
          title: "Meetings worth attending",
          minutes: 8,
          body: `A meeting is the most expensive way an organisation can spend an hour: multiply the hour by everyone present. Most are called out of habit.

**Before calling one**, decide what decision it exists to reach. A meeting to share information should have been a written update — people read faster than they listen, and can do it when it suits them. A meeting to make a decision is a good use of the time, provided the people who can make it are present.

**Send the material in advance and expect it read.** The alternative — presenting it in the room — spends everyone's hour on something each of them could have done in five minutes.

**Name who decides.** A meeting where nobody can decide produces another meeting.

**Write down what was decided, and who does what by when.** A decision nobody recorded gets re-litigated within a fortnight.

**As an attendee, it is legitimate to ask what a meeting is for**, and to decline where the honest answer is that you would have nothing to contribute. This is easier in some organisations than others; where it is hard, sending a colleague or asking for the notes is usually available.

**End early when the work is done.** An hour booked is not an hour owed.`,
        },
        {
          title: "Email and messages",
          minutes: 8,
          body: `Email is other people's requests arranged in the order they arrived, which is almost never the order in which they matter.

**Process in batches, at set times.** Two or three passes a day is enough for nearly every role. Continuous monitoring means continuous interruption, and no message is answered better for being answered in ninety seconds.

**Handle each message once.** Reply, do it, delegate it, schedule it, or delete it. Reading something, deciding not to deal with it, and leaving it to be read again later is the single largest waste in most inboxes — that message will be read four times before it is answered.

**Do not use the inbox as a to-do list.** It is a list of what other people want, sorted by when they wanted it. Move anything requiring real work onto whatever list you actually plan from.

**Write so that action is obvious.** Put the request in the first line, name who it is for, and give the deadline. A message where the ask is buried in paragraph four gets a slow answer or none.

**Match the channel to the urgency.** Something needed within the hour is a call. Email that is genuinely urgent is a channel mismatch, and treating all email as urgent is how people end up unable to think.

And the point that makes the rest work: **a slower average reply time is usually a fair trade** for being able to do the work people are writing to you about.`,
        },
      ],
    },
  ],
  quiz: {
    title: "Working deliberately — check",
    description: "Six questions. 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Why does a two-minute interruption cost more than two minutes?",
        options: [
          "Rebuilding the mental model the work depended on takes longer",
          "Because politeness requires a longer conversation",
          "Because the task must be restarted from the beginning",
          "It does not — two minutes is the full cost",
        ],
        correctAnswer: "Rebuilding the mental model the work depended on takes longer",
        explanation:
          "The interruption discards context that took time to build, and the rebuilt version is usually thinner than the original.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "All work needs protecting from interruption equally.",
        correctAnswer: false,
        explanation:
          "Work that holds nothing fragile in mind — routine approvals, filing — survives fragmented time. Protect the work that does.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which quadrant do most preventable crises come from?",
        options: [
          "Important and not yet urgent",
          "Urgent and important",
          "Urgent and not important",
          "Neither urgent nor important",
        ],
        correctAnswer: "Important and not yet urgent",
        explanation:
          "Nothing forces this work to happen, so it is deferred until neglect makes it urgent — and then it is done badly under pressure.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "A colleague asks you to take on work you cannot fit. What is the most useful reply?",
        options: [
          "Name what it would displace and let them choose",
          "Accept, and try to absorb it",
          "Refuse without explanation",
          "Accept, and quietly deprioritise it later",
        ],
        correctAnswer: "Name what it would displace and let them choose",
        explanation:
          "It turns a refusal into a decision and gives it to the person entitled to make it.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Five tasks at 80% complete deliver more value than four finished and one untouched.",
        correctAnswer: false,
        explanation:
          "Unfinished work delivers almost nothing and still costs attention. Four finished is four delivered.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "What is the strongest reason not to use your inbox as a to-do list?",
        options: [
          "It is a list of other people's requests sorted by arrival time",
          "It is difficult to search",
          "Messages can be deleted accidentally",
          "It cannot be shared with colleagues",
        ],
        correctAnswer: "It is a list of other people's requests sorted by arrival time",
        explanation:
          "Arrival order is almost never priority order, so planning from the inbox means working to everyone else's ordering.",
      },
    ],
  },
};

export const WRITING: Course = {
  slug: "writing-that-gets-read",
  title: "Writing That Gets Read",
  subtitle: "Emails, reports and recommendations that people act on.",
  description:
    "Professional writing fails in predictable ways: the point arrives too late, the ask is unclear, and the reader cannot tell what they are supposed to do. This course covers the structures that fix that — leading with the conclusion, writing for a reader who is skimming, making recommendations someone can actually approve — and the sentence-level habits that make dense material readable. Aimed at people whose writing has consequences: assessments, findings, board papers, and the email that decides whether a thing happens.",
  category: "Professional Development",
  level: "BEGINNER",
  modules: [
    {
      title: "Structure",
      description: "Where the point goes, and why.",
      lessons: [
        {
          title: "Put the conclusion first",
          minutes: 8,
          body: `Most professional writing is organised like a detective story: background, then analysis, then — finally — what the writer thinks. That order suits the writer, who arrived at the conclusion that way. It does not suit the reader.

Lead with the conclusion. State what you found and what you want, then support it.

Three reasons this is not merely stylistic preference.

**Readers stop.** Attention decays through a document. Anything at the end is read by fewer people than anything at the start, and the most senior reader is often the one who stops earliest.

**Context is easier to read once you know what it is for.** Background before a conclusion is a list of facts with no organising idea; the same background after the conclusion is evidence, and the reader can weigh it as they go.

**It forces you to have a conclusion.** A document that meanders to its point usually meanders because the writer had not decided. Writing the conclusion first exposes that while it is still cheap to fix.

The shape that works for almost any professional document:

> **What I am telling you.** One or two sentences.
> **What I want you to do.** The decision, approval or action.
> **Why.** The evidence, in descending order of weight.
> **What I considered and rejected.** Briefly, to show the work.
> **Detail.** For the reader who wants it; most will not.

This is uncomfortable at first because it feels abrupt. It reads as confident, not rude.`,
        },
        {
          title: "Writing for someone who is skimming",
          minutes: 8,
          body: `Assume your reader is skimming. They almost always are — not from disrespect but from volume.

Writing that survives skimming shares some properties.

**Headings that say something.** "Findings" tells the skimmer nothing. "Three controls are not operating" tells them the finding. A reader should be able to read only your headings and come away with the argument.

**Short paragraphs, one idea each.** A paragraph is a unit of thought. When it holds three, the reader keeps only one, and you do not choose which.

**The first sentence of each paragraph carries the point.** Skimmers read first sentences. Bury the point in the middle and it is not read.

**Lists for things that are genuinely a list.** Three parallel items belong in a list. Prose forced into bullets, each a paragraph long, is harder to read than the prose was.

**Bold sparingly, and only on the words that matter.** Everything emphasised is nothing emphasised.

**No more than one idea per sentence** where the material is dense. Two clauses joined by "and which" is a sentence the reader will have to read twice.

The test: give the document to someone for thirty seconds, take it back, and ask what it said. If they cannot tell you the conclusion and the ask, the structure is wrong — not their attention.`,
        },
      ],
    },
    {
      title: "Sentences",
      description: "Where dense material becomes readable, or does not.",
      lessons: [
        {
          title: "Say who does what",
          minutes: 8,
          body: `The single most common failure in professional and regulatory writing is losing the actor.

> "It was determined that the controls in question were not being operated in accordance with policy."

Determined by whom? Operated by whom? Not operated by whom? The sentence describes a failure while carefully naming nobody, which is often exactly why it was written that way.

> "The finance team did not run the monthly reconciliation between March and July."

Same fact, and now actionable. Somebody can respond to the second sentence.

The habit to build: **subject, verb, object.** Who did what to what.

Passive voice is not always wrong. "The database was breached on 14 March" is fine when the actor is genuinely unknown, and sometimes the actor is not the point. But passive constructions are the standard way of writing about a problem without saying whose it is, and readers notice — usually as a vague impression that the document is evasive, which then colours how they read the rest.

The related habit is avoiding nominalisation: turning verbs into nouns. "We made a determination" is "we determined". "Implementation of the remediation was undertaken" is "we fixed it". Each nominalisation adds words and removes an actor.`,
        },
        {
          title: "Cutting",
          minutes: 7,
          body: `First drafts are long. Good writing is mostly what happened after.

Things that can nearly always go:

**Throat-clearing openings.** "I hope this email finds you well. I am writing to follow up on our conversation regarding..." Two sentences before the reader learns anything. Start with the thing.

**Hedges stacked on hedges.** "It could potentially be possible that there may be some risk." Say what the risk is and how likely you think it is. Stacked hedging does not make you careful; it makes you unreadable, and it hides whether you actually have a view.

**Words that do no work.** "In order to" is "to". "At this point in time" is "now". "Due to the fact that" is "because". "Utilise" is "use".

**Sentences that restate the previous sentence.** Common at the end of paragraphs, where the writer was thinking rather than concluding.

**Adjectives doing the job of evidence.** "Significant improvements" tells the reader nothing. Say how much.

The technique: write it, then cut a quarter. Not by deleting content — by saying the same things in fewer words. The first pass is easy and the document improves noticeably. A second quarter usually starts costing meaning, which is the sign you have reached the useful floor.`,
        },
      ],
    },
    {
      title: "Documents that get decisions",
      description: "Recommendations, findings, and the email that unblocks something.",
      lessons: [
        {
          title: "Making a recommendation someone can approve",
          minutes: 8,
          body: `A recommendation that cannot be approved as written is not a recommendation; it is an invitation to a meeting.

What an approvable recommendation contains:

**The specific action.** Not "we should improve access control" but "remove standing administrator rights from the twelve accounts listed, and grant them on request."

**Who does it, and by when.**

**What it costs** — money, time, or disruption. A recommendation with no cost stated reads as either trivial or unconsidered.

**What happens if it is not done.** The reason for acting, stated plainly and without inflation. Overstating consequences works once.

**The alternatives you rejected, and why.** This is the part most people leave out, and it is the part that most raises confidence. A reader who can see you considered the cheaper option and can see why you set it aside does not have to ask.

Two failure modes to avoid.

**The menu.** Three options with no recommendation pushes the decision back to someone with less context than you. If you genuinely cannot choose, say what you would need in order to.

**The buried ask.** A carefully argued document where the actual request appears in the last paragraph, hedged. The reader has to hunt for what you want, and some will not.`,
        },
        {
          title: "Writing about bad news",
          minutes: 7,
          body: `Findings, incidents and audit results are read by people who may be embarrassed by them. That changes how to write, not whether to.

**Be specific and unsentimental about the facts.** Vagueness reads as either incompetence or as a cover, and it removes the reader's ability to fix anything.

**Separate the fact from the judgement.** "The reconciliation was not performed for five months" is a fact. "Controls in this area are weak" is a judgement. Keeping them apart lets someone dispute the judgement without disputing reality, which is a far more productive argument.

**Write about the system, not the person**, unless the person is genuinely the finding. "There is no owner for this control" is more useful and more likely to be acted on than naming someone who was never told it was theirs.

**Do not bury it.** A serious finding placed in the middle of a long document, in cautious language, reads as though you were hoping it would not be noticed — and that is how it will be read later if something goes wrong.

**Say what would fix it.** A finding without a route out invites defensiveness. A finding with one invites work.

And a note on tone: the temptation with bad news is either to soften it into meaninglessness or to sharpen it to demonstrate rigour. Both are about the writer. Plain and specific serves the reader.`,
        },
      ],
    },
  ],
  quiz: {
    title: "Writing — check",
    description: "Six questions. 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Why should a professional document lead with its conclusion?",
        options: [
          "Readers stop partway, and the most senior often stops earliest",
          "It makes the document shorter",
          "It is the traditional format for reports",
          "It avoids the need for supporting evidence",
        ],
        correctAnswer: "Readers stop partway, and the most senior often stops earliest",
        explanation:
          "Anything at the end is read by fewer people. Leading with the conclusion also forces you to have one.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which heading is doing its job?",
        options: [
          "Three controls are not operating",
          "Findings",
          "Analysis and observations",
          "Section 4",
        ],
        correctAnswer: "Three controls are not operating",
        explanation:
          "A skimmer should be able to read only the headings and come away with the argument.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "\"It was determined that the controls were not operated correctly\" is good professional writing.",
        correctAnswer: false,
        explanation:
          "It describes a failure while naming nobody. Say who did what — the passive version cannot be acted on.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "What most raises a reader's confidence in a recommendation?",
        options: [
          "Showing the alternatives you rejected and why",
          "Stating it more forcefully",
          "Adding more supporting detail",
          "Offering three options without choosing",
        ],
        correctAnswer: "Showing the alternatives you rejected and why",
        explanation:
          "A reader who can see the cheaper option was considered and set aside does not have to ask.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "When writing up a serious finding, softening the language helps it be received.",
        correctAnswer: false,
        explanation:
          "Cautious language around a serious finding reads as though you hoped it would not be noticed — and it will be read that way afterwards if something goes wrong.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which pair separates fact from judgement correctly?",
        options: [
          "\"The reconciliation was not performed for five months\" / \"Controls here are weak\"",
          "\"Controls here are weak\" / \"This is unacceptable\"",
          "\"Performance was suboptimal\" / \"Improvements are needed\"",
          "\"There were issues\" / \"They should be addressed\"",
        ],
        correctAnswer:
          "\"The reconciliation was not performed for five months\" / \"Controls here are weak\"",
        explanation:
          "The first is checkable; the second is an interpretation of it. Keeping them apart lets someone dispute the judgement without disputing reality.",
      },
    ],
  },
};

export const DESIGN: Course = {
  slug: "design-fundamentals-for-non-designers",
  title: "Design Fundamentals for Non-Designers",
  subtitle: "Why your slides and documents look amateur, and the few rules that fix it.",
  description:
    "You do not need to become a designer to stop producing work that looks untrustworthy. Most of the difference between an amateur document and a professional one comes from four things — spacing, hierarchy, restraint with type, and restraint with colour — and all four can be learned in an afternoon. This course covers those, plus how to present data without misleading anyone. For people who make slides, reports and dashboards that others have to read and believe.",
  category: "Design",
  level: "BEGINNER",
  modules: [
    {
      title: "The four things that matter most",
      description: "Almost all of the improvement is here.",
      lessons: [
        {
          title: "Space is not wasted",
          minutes: 8,
          body: `The most common instinct of the untrained is to fill the space. It is also the single largest cause of work that looks amateur.

Space does three jobs.

**It groups.** Things placed close together read as related; things separated read as distinct. This is not a convention — it is how vision works, and it operates before anyone reads a word. A label sitting equidistant between two charts belongs to neither, and the reader has to work out which.

The rule that follows is the one most often broken: **space between groups must exceed space within them.** A heading closer to the paragraph above than the one below it labels the wrong section, and readers will follow the spacing over the meaning.

**It creates emphasis.** An element with room around it is more prominent than one surrounded by clutter, without being made bigger or louder. Space is the cheapest emphasis available.

**It signals confidence.** Dense, edge-to-edge material reads as though the author had a great deal to say and no idea what mattered. Generous margins read as selection.

Practical: **increase every margin you were going to use.** The instinct to fill is strong and consistently wrong. If a slide is too full, the answer is a second slide, not a smaller font.

And align things. Elements should sit on a small number of shared lines — left edges especially. Most amateur layouts have six near-alignments where they should have two exact ones, and the eye registers the near-misses as untidiness without being able to name why.`,
        },
        {
          title: "Hierarchy: making one thing the most important",
          minutes: 8,
          body: `A reader needs to know where to look first. If everything is the same weight, they must read all of it to find out what matters, and they will not.

Hierarchy is created by contrast — in size, weight, colour, or space. The critical rule is that **contrast must be obvious or it is noise.** A heading at 15pt above body text at 14pt is not a heading; it is a paragraph that looks slightly wrong. Make it 24pt. Half-measures read as mistakes.

Three levels is usually enough: the one thing (a title, a headline figure), the supporting structure (section headings), and the body. Four is workable. Six means you have not decided.

The most useful question when a slide or page is not working: **what is the one thing a reader should take away?** Then make that visibly the most prominent element, and demote everything else. A slide with six equally sized boxes has no answer to that question, which is why it does not work.

Two habits to unlearn:

**Emphasis by accumulation.** Bold *and* italic *and* underlined *and* red is four signals for one idea, and the result reads as shouting rather than as important.

**Uniform bullets.** Five bullets at the same size say the five things are equally important. They rarely are. Promote the one that matters and let the others be smaller, or move them off the slide entirely.`,
        },
        {
          title: "Type: fewer choices, better choices",
          minutes: 8,
          body: `Typography goes wrong through variety, not through bad taste.

**Use one typeface. Two at most.** A single well-chosen family with a range of weights covers every need. Two is a deliberate pairing — usually one for headings and one for body. Three or more is what a document looks like when several people edited it.

**Get the body size right, then leave it.** Around 11–12pt for print, 16–18px on screen, and considerably larger for anything projected. The most common error in presentations is body text sized for a laptop and shown on a screen at the back of a room.

**Line length matters more than people expect.** Roughly 60 to 80 characters per line. Longer, and the eye loses its place returning to the left margin; much shorter, and the return happens too often to read comfortably. This is why full-width text on a wide monitor is tiring, and why margins are not decoration.

**Line spacing wants about 1.4 to 1.6.** Single spacing is too tight for anything but short blocks.

**Avoid centring anything longer than two lines.** Centred text has a ragged left edge, so every line starts in a different place and the eye has to search for each one.

**Never set body text in all capitals.** Capitals remove the word shapes readers use to recognise words at speed. They are fine for a short label and painful for a sentence.

If you take one thing: pick one family, set the body properly, and create hierarchy with weight and size rather than with a new font.`,
        },
        {
          title: "Colour, used sparingly",
          minutes: 8,
          body: `Colour is the easiest thing to overdo and the one that most quickly makes work look untrustworthy.

**Use one accent colour, deliberately.** Neutrals — greys, near-blacks, off-whites — carry the bulk of the design, and one colour marks what matters. A document where six things are coloured has no accent, because nothing stands out from anything.

**Never use colour as the only signal.** Around one in twelve men has some form of colour vision deficiency, red-green most commonly. A chart where the only difference between "compliant" and "breach" is red versus green is unreadable to them and to anyone printing in greyscale. Add a label, a shape, or a pattern as well.

**Check contrast.** Light grey text on white is a common way of making a document look modern and an uncommon way of making it readable. Body text needs a contrast ratio of at least 4.5:1 against its background; free checkers will tell you in seconds.

**Let red and green mean something.** In documents about risk, they carry meaning. Using red because it looks lively costs you the ability to use it for a warning.

**Take colours from somewhere.** Your organisation's brand palette, or a published set. Colours picked one at a time from a picker rarely sit together, and the result is the specific muddiness of a document assembled by hand.

The reliable default: near-black text, white or off-white ground, one accent, and grey for everything secondary.`,
        },
      ],
    },
    {
      title: "Showing data honestly",
      description: "The place where design decisions become truth claims.",
      lessons: [
        {
          title: "Choosing the right chart",
          minutes: 8,
          body: `Chart choice follows from the question, not from taste.

**Comparing quantities across categories** — a bar chart. Almost always. Bars are read by length, which people judge accurately.

**Change over time** — a line chart, with time on the horizontal axis.

**Parts of a whole** — a bar chart, usually. Pie charts are read by angle and area, which people judge badly. A pie with more than three or four segments cannot be read; one with two is a sentence.

**Relationship between two variables** — a scatter plot.

**One number that matters** — write the number, large. A single-value chart is decoration around a fact.

Rules that hold across all of them:

**Start bar charts at zero.** A truncated axis exaggerates difference, and it is the most common way a chart misleads without containing a false number. Line charts showing change may sometimes be truncated, but say so.

**Label directly where you can.** A legend makes the reader look back and forth, holding a colour in mind. Labelling the lines removes that work.

**Remove what is not carrying information** — heavy gridlines, boxes, 3D effects, drop shadows, background fills. Every one of them is ink the reader must look past.

**Sort by value, not alphabetically**, unless the category order means something. Sorted bars answer "which is largest" instantly; alphabetical ones make the reader do it.`,
        },
        {
          title: "Tables people can read",
          minutes: 7,
          body: `Tables are more common than charts in professional work and get far less attention.

**Right-align numbers**, and use consistent decimal places. Digits then line up by place value, and the eye can compare magnitudes down a column without reading the numbers. Left-aligned numbers of different lengths cannot be compared at a glance.

**Left-align text.** The opposite reason: text is read from its left edge.

**Lose the vertical lines.** Alignment already separates columns; the lines add clutter. Horizontal rules earn their place where rows are long, and even then a light one is enough.

**Do not fill the cells with colour.** If a value needs attention, mark that value.

**Round.** Nobody reconciles to four decimal places by eye, and the extra digits crowd out the ones that matter. Say ₦4.2m rather than ₦4,217,384 unless the exact figure is the point.

**Put the comparison next to the thing being compared.** A column of values and a column of last year's values, adjacent, does the arithmetic for the reader.

**Order rows meaningfully** — largest first, or worst first. Alphabetical order is the order of the labels, not of the content.

A table designed this way is often clearer than the chart someone would have made from it, and takes less time.`,
        },
      ],
    },
  ],
  quiz: {
    title: "Design fundamentals — check",
    description: "Six questions. 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "A heading sits closer to the paragraph above it than the one below. What happens?",
        options: [
          "It appears to label the section above",
          "Nothing — readers follow the wording",
          "It becomes more prominent",
          "It improves the flow of the page",
        ],
        correctAnswer: "It appears to label the section above",
        explanation:
          "Proximity groups things before anyone reads a word, and readers follow the spacing over the meaning.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Your heading is 15pt and your body text is 14pt. What is the problem?",
        options: [
          "The contrast is too small to read as hierarchy",
          "Headings should always be a different typeface",
          "Headings should be centred",
          "There is no problem",
        ],
        correctAnswer: "The contrast is too small to read as hierarchy",
        explanation:
          "Contrast must be obvious or it reads as a mistake. Half-measures look like errors rather than structure.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Using red and green alone to mark compliant and breached is acceptable if the colours are clear.",
        correctAnswer: false,
        explanation:
          "Around one in twelve men has a colour vision deficiency, and greyscale printing removes the distinction entirely. Add a label or shape.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "You are comparing quantities across eight categories. Which chart?",
        options: ["A bar chart", "A pie chart", "A line chart", "A stacked area chart"],
        correctAnswer: "A bar chart",
        explanation:
          "Bars are read by length, which people judge accurately. Eight pie segments cannot be read by angle.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Truncating a bar chart's axis is a reasonable way to make small differences visible.",
        correctAnswer: false,
        explanation:
          "It exaggerates difference and is the most common way a chart misleads without containing a single false number.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "How should a column of currency figures be aligned in a table?",
        options: [
          "Right-aligned with consistent decimal places",
          "Left-aligned to match the labels",
          "Centred for balance",
          "Alignment makes no difference",
        ],
        correctAnswer: "Right-aligned with consistent decimal places",
        explanation:
          "Digits then line up by place value, so magnitudes can be compared down the column without reading each number.",
      },
    ],
  },
};

export const SKILL_COURSES: Course[] = [FOCUS, WRITING, DESIGN];
