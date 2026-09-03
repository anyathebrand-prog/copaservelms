/**
 * Publish the demonstration course catalogue.
 *
 * Three free courses with real content, so the platform can be shown to
 * somebody without the tour consisting of "and here a course would go".
 *
 * IMPORTANT — this is demonstration material. It is written to be accurate and
 * useful, but it has not been reviewed by a Nigerian data protection lawyer, a
 * compliance officer or a security practitioner. Before anyone is certified on
 * the strength of it, a subject-matter expert has to own the content: a
 * certificate asserts that its holder was taught something correct, and that
 * assertion is only as good as whoever stands behind the material.
 *
 * Idempotent. A course that already has enrolments keeps its content, so
 * re-running this cannot delete somebody's progress.
 *
 *   npx tsx --env-file=.env scripts/seed-courses.ts
 *   npx tsx --env-file=.env scripts/seed-courses.ts --remove
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../app/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Lesson = { title: string; minutes: number; body: string };
type Module = { title: string; description: string; lessons: Lesson[] };
type Question = {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE";
  prompt: string;
  options?: string[];
  correctAnswer: string | boolean;
  explanation: string;
};
type Course = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  featured?: boolean;
  modules: Module[];
  quiz: { title: string; description: string; passingScore: number; questions: Question[] };
};

// ---------------------------------------------------------------------------
// 1. Data protection
// ---------------------------------------------------------------------------

const NDPA: Course = {
  slug: "ndpa-practitioner-introduction",
  title: "The Nigeria Data Protection Act: A Practitioner's Introduction",
  subtitle: "What the NDPA 2023 requires, who it binds, and what to do on the day something goes wrong.",
  description:
    "Nigeria has had a data protection regulator since 2019 and a data protection Act since 2023, and most organisations still process personal data as though neither existed. This course covers what the Act actually requires of a Nigerian organisation: who it binds, what makes processing lawful, what a data subject can demand of you, and what has to happen in the first seventy-two hours after a breach. Written for the person who will be asked to answer for it — a compliance officer, an operations lead, a founder — rather than for a lawyer.",
  category: "Data Protection",
  level: "BEGINNER",
  featured: true,
  modules: [
    {
      title: "What the Act is, and who it binds",
      description: "The shape of the law before the detail.",
      lessons: [
        {
          title: "Why Nigeria has a data protection law",
          minutes: 8,
          body: `Before 2019, Nigeria had no general data protection law. Personal data was governed by a patchwork: sectoral rules from the Central Bank for financial institutions, the NCC for telecommunications, and very little else. An organisation that lost a database of customers had no particular obligation to tell anyone.

The Nigeria Data Protection Regulation (NDPR) of 2019 changed that, issued by NITDA under its enabling Act. It was subsidiary legislation — a regulation rather than a statute — and that mattered: its legal footing was contested, and its enforcement machinery was thin.

The Nigeria Data Protection Act 2023 replaced that arrangement with primary legislation. Three things follow from it being an Act of the National Assembly rather than a regulation:

First, it is not seriously arguable that it binds you. A regulation can be challenged as exceeding the powers of the agency that issued it; an Act cannot.

Second, it created a dedicated regulator — the Nigeria Data Protection Commission — rather than leaving data protection as one responsibility among many at an IT agency.

Third, it carries sanctions with real weight, calculated against turnover rather than as a fixed fee. A penalty of a few hundred thousand naira is a cost of doing business. A penalty measured as a percentage of annual gross revenue is not.

The practical consequence for most Nigerian organisations is that data protection stopped being a policy document and became an operational obligation.`,
        },
        {
          title: "Controllers, processors, and data subjects",
          minutes: 9,
          body: `The Act allocates duties by role, and almost every mistake in applying it starts with getting the role wrong.

A **data subject** is the living individual the data is about. Only individuals — a company is not a data subject, and data about a company is not personal data.

A **data controller** decides why and how personal data is processed. If you decided to collect it, and you decided what to do with it, you are the controller. Most obligations under the Act fall here.

A **data processor** processes personal data on a controller's behalf and on its instructions. Your payroll bureau, your cloud provider, the agency running your customer survey — these are processors, provided they are genuinely acting on your instructions rather than pursuing their own purposes.

The distinction is not a matter of what a contract calls the parties. It is decided by who actually determines the purpose. A marketing agency that decides for itself which segments to target with your customer list has stopped being your processor and become a controller in its own right, whatever the agreement says.

Two further points that catch organisations out:

You remain responsible for your processors. Engaging one does not transfer your obligations; it adds a requirement to bind them contractually and to satisfy yourself they are competent.

There is no "we only hold a little data" exemption. The Act applies to processing, not to volume. A twelve-person firm holding staff records is a controller.

The Act also identifies a **data controller of major importance** — broadly, one processing personal data of a significant number of data subjects, or handling data of particular sensitivity. Those organisations carry extra duties, including registration with the Commission. Whether you fall inside that definition is one of the first questions worth answering, because a good deal of what you must do depends on the answer.`,
        },
        {
          title: "The Nigeria Data Protection Commission",
          minutes: 6,
          body: `The Act establishes the Nigeria Data Protection Commission (NDPC) as the regulator, headed by a National Commissioner.

Its functions are what you would expect of a data protection authority: it registers data controllers of major importance, issues guidance and subsidiary regulation, receives complaints from data subjects, investigates, and imposes sanctions.

Two of its powers matter more than the others in practice.

**It receives complaints directly from individuals.** A data subject who believes you have mishandled their data does not need to sue you; they can complain to the Commission, which can investigate at no cost to them. This changes the risk calculation considerably. The realistic path to enforcement is not a customer hiring a lawyer — it is a customer filling in a form.

**It can order remedial action, not only fine you.** An order to stop a particular processing activity can be considerably more disruptive than a penalty, because it interrupts the business rather than costing it money.

The Commission also inherited responsibility for the ecosystem NITDA built under the NDPR, including the licensing of data protection compliance organisations that audit and file on behalf of controllers.

If you take one operational point from this lesson: know who at your organisation would receive a letter from the NDPC, and make sure it would not sit unopened.`,
        },
      ],
    },
    {
      title: "What makes processing lawful",
      description: "You need a reason, and it has to be one the Act recognises.",
      lessons: [
        {
          title: "The lawful bases",
          minutes: 10,
          body: `You may not process personal data because you happen to have it. You need a lawful basis, identified before you start, and it must be one the Act recognises:

**Consent.** The data subject agreed, freely, specifically, and on the basis of adequate information.

**Contract.** The processing is necessary to perform a contract with the data subject, or to take steps at their request before entering one. Processing a customer's address to deliver what they bought sits here.

**Legal obligation.** A law requires it of you. Retaining transaction records for the period AML rules specify is not something you need consent for.

**Vital interests.** Necessary to protect someone's life. Rare, and genuinely about life and death.

**Public interest or official authority.** Necessary for a task carried out in the public interest or in exercise of official authority vested in you. Principally relevant to public bodies.

**Legitimate interests.** Necessary for your legitimate interests or a third party's, except where those interests are overridden by the data subject's rights and freedoms.

Three things practitioners get wrong here.

The basis is chosen before processing, not defended afterwards. Deciding retrospectively which box the activity fits is the reasoning of someone already in trouble.

You cannot switch bases when the first becomes inconvenient. If you relied on consent and it is withdrawn, you must stop — you may not then declare the processing to be in your legitimate interests instead.

"Necessary" means necessary, not convenient. If the purpose can be achieved without the personal data, or with less of it, the processing is not necessary.`,
        },
        {
          title: "Consent, and why it is the weakest basis",
          minutes: 9,
          body: `Consent is the basis everyone reaches for first and the one that most often fails.

To be valid it must be **freely given** — a real choice, not a condition of service where the processing is not necessary for that service. **Specific** — to a purpose, not a blanket permission. **Informed** — the person knew what they were agreeing to. And signalled by a **clear affirmative act**. Silence is not consent. A pre-ticked box is not consent. Continuing to use a website is not consent.

It must also be as easy to withdraw as it was to give. A consent obtained in one click and withdrawable only by writing a letter is not valid consent; it was never really freely given.

That last requirement is what makes consent fragile as an operating basis. Consent can be withdrawn at any time, and when it is, the processing must stop. If your business depends on continuing to process, you have built on a basis the data subject can remove at will.

So the practical rule is: use consent where consent is genuinely the honest description — marketing email, optional analytics, anything the person could reasonably decline without losing the service. For processing you must do to deliver what someone asked for, contract is the better basis, and it does not evaporate when they change their mind.

You must also be able to demonstrate consent, which means recording what the person was shown at the moment they agreed. A version number is not enough unless the text behind it is immutable, and marketing copy never is. Store the wording.`,
        },
        {
          title: "Sensitive personal data",
          minutes: 7,
          body: `Some categories of personal data carry a higher risk of harm when mishandled, and the Act treats them accordingly. These include data revealing racial or ethnic origin, religious or similar beliefs, health status, sex life, political opinions, trade union membership, and genetic and biometric data.

Processing these requires more than an ordinary lawful basis. You need a specific additional condition — typically explicit consent, a legal obligation in the field of employment or social security, protection of vital interests, or processing necessary for the establishment or defence of legal claims, among others the Act sets out.

Two Nigerian-specific points worth holding on to.

**Religion and ethnicity are frequently collected without thought** on employment forms, in customer records, and in surveys. In a country where both have been the basis of violence, a database that pairs names with either is a materially more dangerous asset than one without. Collect it only where you can articulate why you need it.

**Biometric data is increasingly routine** — BVN-linked verification, fingerprint attendance systems, facial recognition on devices. Convenience has made it normal, but it is still sensitive data, and unlike a password a fingerprint cannot be reissued after a breach.

The operational test is simple: if you would struggle to explain to the person why you hold this particular field, you probably should not be holding it.`,
        },
      ],
    },
    {
      title: "Rights, obligations, and breaches",
      description: "What people can demand of you, and what you owe them.",
      lessons: [
        {
          title: "What a data subject can demand",
          minutes: 9,
          body: `The Act gives individuals a set of enforceable rights. In practice you will meet these as requests arriving by email, often from someone who is already unhappy.

**Access.** They may ask what personal data you hold about them, why, who you have shared it with, and for a copy.

**Rectification.** Inaccurate data must be corrected.

**Erasure.** They may ask you to delete their data. This is not absolute — where you have a legal obligation to retain records, or need the data to establish or defend a legal claim, you may refuse. But you must answer, and you must say why.

**Restriction.** They may ask you to stop processing while a dispute about accuracy or legitimacy is resolved.

**Objection.** They may object to processing based on legitimate interests or public interest, and to direct marketing. For direct marketing the objection is absolute — there is no balancing test. Stop.

**Portability.** Where processing rests on consent or contract and is automated, they may ask for their data in a structured, commonly used, machine-readable format.

**Not to be subject to solely automated decisions** producing legal or similarly significant effects, including profiling — with exceptions, but with a right to human intervention.

Three operational points.

Have a route for these requests that does not depend on one person's inbox. A request sent to a general address is still a valid request.

Verify identity before disclosing anything. Handing someone else's data to a convincing stranger is itself a breach.

Answer in time. The Act and the Commission's guidance set the periods; the failure mode is not usually refusal but silence, and silence is what generates complaints.`,
        },
        {
          title: "What a controller must actually do",
          minutes: 10,
          body: `Beyond responding to requests, the Act imposes standing obligations. These are the ones that determine whether an investigation goes well or badly.

**Process lawfully, fairly and transparently.** Transparency in particular means people are told, at the point you collect, who you are, what you will do with the data, on what basis, who else will see it, how long you will keep it, and what rights they have. A privacy notice nobody can find is not transparency.

**Collect for specified purposes** and do not then use it for something incompatible.

**Minimise.** Collect what you need, not what might one day be useful.

**Keep it accurate** and correct it when it is not.

**Do not keep it forever.** Retention must be limited to what the purpose requires, or what law demands. "We never delete anything" is a policy failure, not a neutral default.

**Secure it,** with measures appropriate to the risk.

**Be able to demonstrate all of the above.** This is the accountability principle, and it is the one that turns the others from aspirations into records. If you cannot show what you decided and why, you are in the position of asserting compliance rather than evidencing it.

Several controllers must also **designate a Data Protection Officer** — required for data controllers of major importance, public bodies, and where core activities involve large-scale processing of sensitive data. The DPO must be able to act independently and report to the highest management level; appointing someone who reports to the person whose processing they are supposed to challenge defeats the purpose.

A **data protection impact assessment** is required before processing likely to result in high risk. New surveillance, large-scale profiling, and processing sensitive data at scale are the obvious triggers. Doing one after launch is doing a post-mortem.`,
        },
        {
          title: "Breaches, and the first seventy-two hours",
          minutes: 8,
          body: `A personal data breach is a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to personal data. Note what that includes: losing a laptop, emailing a spreadsheet to the wrong recipient, and a ransomware attack that encrypts your records are all breaches. It is not only "we were hacked and data was stolen".

**Notify the Commission where the breach is likely to result in a risk to the rights and freedoms of individuals** — and do it without undue delay, within seventy-two hours of becoming aware of it. If you cannot assemble the full picture in time, notify anyway and follow up; a late complete report is worse than a prompt partial one.

**Notify the affected individuals** where the risk to their rights and freedoms is high, and do it in plain language. The purpose is to let them protect themselves — change a password, watch an account, be alert to a call that uses details only you held.

**Record every breach**, including the ones you decide not to report. The record of a decision not to notify, with the reasoning, is what demonstrates the judgement was made rather than avoided.

The seventy-two hours run from awareness, not from the end of the investigation. This is the single most common operational failure: an organisation discovers something on Friday, spends ten days determining exactly what happened, and reports on day twelve. The clock had been running the whole time.

What to have ready before you need it: who decides that something is a breach; who contacts the Commission; who can approve communication to affected people; and where the record lives. Working that out during an incident is how the deadline gets missed.`,
        },
      ],
    },
    {
      title: "Data that leaves Nigeria",
      description: "Most Nigerian organisations transfer data abroad without noticing.",
      lessons: [
        {
          title: "Cross-border transfers",
          minutes: 8,
          body: `If your database is hosted in London, your email in Ireland, and your CRM in Virginia, you are transferring personal data out of Nigeria. Most organisations do this without ever having framed it as a transfer, because it does not feel like sending data anywhere — it feels like using software.

The Act permits cross-border transfer, but on conditions. The primary route is that the destination provides an **adequate level of protection** — assessed against factors including the rule of law and respect for rights in that country, the existence of a competent supervisory authority, and international commitments it has entered into.

Where adequacy is not established, transfer is still permitted on other bases the Act sets out, including where the data subject has consented having been informed of the risks, where the transfer is necessary for the performance of a contract with them, for reasons of public interest, or for the establishment or defence of legal claims.

Practical guidance for a Nigerian organisation:

**Know where your data physically is.** Not which vendor you use — which region. "AWS" is not an answer; "eu-west-2, London" is.

**Write the basis down before you are asked.** The question arrives from a customer's legal team during procurement, or from the Commission during an investigation, and in both cases the answer needs to already exist.

**Check what your processors do downstream.** A vendor in one country may sub-process in another. Your obligation follows the data.

None of this makes hosting abroad wrong. Most Nigerian organisations have sound operational reasons for it. What the Act requires is that you know you are doing it and can say on what basis.`,
        },
      ],
    },
  ],
  quiz: {
    title: "NDPA knowledge check",
    description: "Eight questions on the material. You need 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which instrument is Nigeria's primary data protection legislation?",
        options: [
          "The Nigeria Data Protection Act 2023",
          "The NDPR 2019",
          "The NITDA Act 2007",
          "The Cybercrimes Act 2015",
        ],
        correctAnswer: "The Nigeria Data Protection Act 2023",
        explanation:
          "The NDPR 2019 was subsidiary legislation issued by NITDA. The 2023 Act is primary legislation and established the NDPC.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt:
          "A payroll bureau processes staff data strictly on your written instructions. What is it?",
        options: ["A data processor", "A data controller", "A data subject", "A joint controller"],
        correctAnswer: "A data processor",
        explanation:
          "It processes on your behalf and on your instructions. Had it decided the purposes for itself, it would be a controller regardless of what the contract called it.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Engaging a data processor transfers your obligations as controller to them.",
        correctAnswer: false,
        explanation:
          "It adds obligations — to bind them contractually and to satisfy yourself they are competent. You remain responsible.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt:
          "A customer withdraws consent to marketing email. You would prefer to keep sending it. What may you do?",
        options: [
          "Stop sending it",
          "Continue on the basis of legitimate interests instead",
          "Continue until the end of the current campaign",
          "Ask them to confirm the withdrawal in writing",
        ],
        correctAnswer: "Stop sending it",
        explanation:
          "You may not switch basis when consent becomes inconvenient, and objection to direct marketing is absolute in any case.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "A pre-ticked consent box is valid provided the wording beside it is accurate.",
        correctAnswer: false,
        explanation:
          "Consent requires a clear affirmative act. A pre-ticked box records the absence of an objection, not the presence of agreement.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt:
          "You discover on Friday that a spreadsheet of customer records was emailed to the wrong recipient. When does the seventy-two hours begin?",
        options: [
          "When you became aware of it on Friday",
          "When the investigation concludes",
          "When you confirm the recipient opened it",
          "When the affected customers complain",
        ],
        correctAnswer: "When you became aware of it on Friday",
        explanation:
          "The clock runs from awareness. Notify within the period even if the picture is incomplete, and follow up.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which of these is sensitive personal data under the Act?",
        options: [
          "An employee's religious affiliation",
          "An employee's staff number",
          "An employee's office extension",
          "An employee's job title",
        ],
        correctAnswer: "An employee's religious affiliation",
        explanation:
          "Data revealing religious belief is a special category and needs an additional condition beyond an ordinary lawful basis.",
      },
      {
        type: "TRUE_FALSE",
        prompt:
          "Hosting your database in London means personal data has left Nigeria, and you need a basis for the transfer.",
        correctAnswer: true,
        explanation:
          "It is a cross-border transfer whether or not it feels like one. Know the region your data sits in and record the basis before someone asks.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. Cybersecurity
// ---------------------------------------------------------------------------

const SECURITY: Course = {
  slug: "cybersecurity-for-nigerian-workplaces",
  title: "Cybersecurity for Nigerian Workplaces",
  subtitle: "How attacks actually start, and the handful of habits that stop most of them.",
  description:
    "Almost no organisation is breached by someone defeating its encryption. It is breached because a member of staff was convinced to do something — click, pay, approve, or read out a code. This course is about that: how the deception works, why intelligent people fall for it, and the small number of habits that remove most of the risk. Written for people who do not work in IT, with Nigerian examples rather than imported ones.",
  category: "Cybersecurity",
  level: "BEGINNER",
  featured: true,
  modules: [
    {
      title: "How attacks actually start",
      description: "Almost always with a person, not a system.",
      lessons: [
        {
          title: "Phishing, and why it still works",
          minutes: 8,
          body: `Phishing is a message designed to make you act before you think. It survives decades of awareness training because it does not attack your knowledge — it attacks your circumstances.

The messages that succeed share a shape:

**Authority.** It appears to come from someone you would not question — the MD, the bank, the regulator, IT support.

**Urgency.** There is a deadline. The account will be suspended, the payment must go today, the portal closes at five.

**Plausibility.** It refers to something real. A supplier you actually use. An invoice number that looks like your invoice numbers. A colleague's name spelled correctly.

**A single action.** Click here. Approve this. Send the code.

The reason intelligent people fall for it is that the message arrives at a moment when acting quickly is reasonable — late in the day, during a genuine payment run, while travelling. Awareness does not help much at 4:50pm on a Friday. Habits do.

Three habits that do most of the work:

**Verify out of band.** If a message asks for money or credentials, confirm through a channel you chose, not one it offered. Call the number you already have, not the number in the email.

**Distrust urgency itself.** Legitimate requests survive a fifteen-minute delay. The urgency is usually the attack, not the context.

**Look at the actual sender address, not the display name.** Display names are free to set. On a phone, the address is often hidden behind the name — expand it.

And an organisational one: make it normal to check. If asking "is this really you?" is treated as insulting, nobody will ask, and the control does not exist.`,
        },
        {
          title: "Business email compromise",
          minutes: 9,
          body: `Business email compromise is phishing that has done its homework, and it is the variant that costs Nigerian organisations the most money.

The pattern: an attacker gains access to a mailbox — often through a password reused from an unrelated breach — and then does nothing for weeks. They read. They learn how your invoices look, who approves payments, when your MD travels, how your finance lead signs off emails, which suppliers you use.

Then they act, usually in one of two ways.

**Supplier redirection.** A genuine supplier's invoice arrives, but the account details have been altered. Everything else is real, because everything else *is* real — the attacker forwarded a legitimate document with one field changed.

**Executive impersonation.** A message from the MD, sent while they are demonstrably travelling, asking for an urgent transfer and apologising for being unreachable.

What makes this hard is that nothing looks wrong. There is no misspelled domain, no broken English, no suspicious attachment. The email is genuine, or a faithful copy of one.

The controls that work are procedural, not technical:

**Never change payment details on the strength of an email.** Any change to bank details is verified by phone, to a number held on file from before the request, and confirmed with a second person.

**Require two people for payments above a threshold**, and make it a real second pair of eyes rather than a rubber stamp.

**Treat "I am unreachable, please just do it" as a red flag rather than as context.** That sentence exists to remove the verification step.

**Make finance staff safe to pause a payment.** If delaying a transfer to check draws criticism, they will stop checking.`,
        },
        {
          title: "Social engineering by phone and WhatsApp",
          minutes: 7,
          body: `Not every attack arrives by email. In Nigeria a great many arrive by phone call or WhatsApp, and those channels carry more trust than they deserve.

The common shapes:

**The bank that calls you.** Caller identity is trivially spoofed. Someone calls claiming to be your bank's fraud team, already knows your name and part of your account number — details available from any number of leaks — and asks you to confirm a code sent to your phone. The code is a one-time password authorising the attacker's own login.

**The colleague on a new number.** A WhatsApp message from an unfamiliar number, using a colleague's photo and name, explaining they have lost their phone and urgently need airtime, a transfer, or a document.

**The support technician.** Someone calls about a problem with your computer, or arrives in person to "check the network", and needs you to install something or let them plug in a device.

Two rules cover most of it.

**No legitimate institution will ever ask you for a one-time password.** Not your bank, not a payment processor, not your employer. The code exists specifically to prove it is you, so asking for it is asking you to prove you are them. There is no exception to this rule and no circumstance in which the caller is genuine.

**Verify identity through a channel you initiate.** Hang up and call the number on your card, or on the company's website you navigated to yourself. If the caller objects to being called back, that objection is the answer.`,
        },
      ],
    },
    {
      title: "Protecting accounts",
      description: "Two changes that outperform everything else.",
      lessons: [
        {
          title: "Passwords that survive a breach",
          minutes: 8,
          body: `Most password advice is wrong, or at least out of date. The rules that matter now are shorter than the ones you were taught.

**Length beats complexity.** A long passphrase of ordinary words is stronger and far easier to remember than a short string of substituted characters. "correct-battery-office-lagos" is a better password than "P@ssw0rd!".

**Uniqueness matters more than either.** The single most damaging habit is reuse. When any site you use is breached — and sites are breached constantly — the attacker takes the email and password and tries the pair everywhere else. This is called credential stuffing, and it is the most common way an account is taken over. A strong password reused across five services is weaker in practice than five mediocre ones.

**Forced rotation makes things worse.** Requiring a change every thirty days produces "Lagos2026!" becoming "Lagos2027!". Change a password when there is a reason to.

**Use a password manager.** This is the recommendation people resist and the one that resolves the problem. You cannot remember sixty unique passphrases; the manager can. The objection — "what if the manager is breached?" — is worth taking seriously and still resolves in its favour: a properly designed manager cannot read your vault, and the alternative you are defending is reuse.

Practical starting point: change the password on your **email account** first, and make it unique. Email is the master key — whoever controls it can reset everything else.`,
        },
        {
          title: "Multi-factor authentication",
          minutes: 7,
          body: `Multi-factor authentication means proving who you are with more than one kind of evidence: something you know (a password) plus something you have (a phone, a key) or something you are (a fingerprint).

It is the single most effective control available to an ordinary user, because it breaks the economics of credential theft. A stolen password on its own stops being enough.

Not all factors are equally good:

**SMS codes** are the weakest form, but far better than nothing. They are vulnerable to SIM swap — an attacker persuades or bribes a telco to move your number to their SIM, a well-documented problem in Nigeria — and to interception. Use them where nothing better is offered.

**Authenticator apps** generate a code on your device without any network involvement. Nothing to intercept, nothing to SIM-swap. This is the sensible default, and it works offline.

**Hardware keys** are the strongest, and resist phishing outright: the key checks the site's identity, so it will not authenticate to a convincing fake. Worth it for administrators and finance staff.

Two practical points.

**Save your recovery codes** somewhere that is not the device running the authenticator. People lock themselves out by enrolling and then losing the phone.

**Nobody will ever legitimately ask you for the code.** If a caller wants you to read out an authentication code, the call is an attack. Without exception.`,
        },
      ],
    },
    {
      title: "Day to day",
      description: "Devices, networks, and what to do when something has gone wrong.",
      lessons: [
        {
          title: "Devices and networks",
          minutes: 7,
          body: `The habits below are unglamorous and remove a large amount of risk.

**Install updates.** Most successful intrusions exploit a vulnerability that was patched months earlier. Postponing an update indefinitely is choosing to remain exploitable for a known problem.

**Lock your screen.** An unlocked laptop in an open-plan office, a co-working space, or a hotel lobby is an open session. Make it automatic.

**Encrypt the disk.** Device encryption is built into current Windows, macOS, iOS and Android and mostly needs turning on. It converts "we lost a laptop containing customer data" — a reportable breach — into "we lost a laptop", which is an expense.

**Be careful on public Wi-Fi**, but be clear about why. Modern sites are encrypted, so the old fear of someone reading your traffic is largely handled. The real risks are a fake network with a plausible name, and the habit of doing sensitive work in a place where the screen is visible. Mobile data is usually the better option, and it is cheap enough in Nigeria to be a reasonable default.

**Do not plug in unknown USB devices.** A dropped drive in a car park is a genuine attack technique, not a story.

**Separate work and personal where you can.** Not out of formality: a personal device with a compromised app is a route into whatever it can reach.`,
        },
        {
          title: "Reporting, without fear",
          minutes: 6,
          body: `The most important control in this entire course is cultural: people must be able to report a mistake immediately, without fearing what happens to them.

Consider the difference. Someone clicks a link and enters a password at 09:15. If they report it at 09:20, you can reset the credential, check for access, and probably close the incident before anything happens. If they say nothing because they are afraid of being blamed, you discover it three weeks later when money has gone.

The gap between those two outcomes is not technology. It is whether the person felt able to speak.

So, for organisations:

**Say explicitly that reporting is never punished.** Say it before an incident, not after.

**Make the route obvious and short.** One address, one number, no form. During an incident, friction costs minutes that matter.

**Thank people who report, including false alarms.** Every "this looked odd, is it real?" is a person exercising exactly the judgement you want. Treating them as a nuisance trains them out of it.

**Never single someone out.** The person who clicked is the person the attack was designed for. Publicly blaming them guarantees the next person stays quiet.

And for individuals: if you think you have made a mistake, report it immediately. It is almost always recoverable at the moment it happens, and almost never recoverable a fortnight later.`,
        },
      ],
    },
  ],
  quiz: {
    title: "Security habits check",
    description: "Six questions. 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt:
          "A supplier emails an updated invoice with new bank details. Everything else matches your records. What do you do?",
        options: [
          "Call the supplier on a number you already held and confirm",
          "Reply to the email to confirm the change",
          "Call the number in the email signature",
          "Pay it — the invoice details are correct",
        ],
        correctAnswer: "Call the supplier on a number you already held and confirm",
        explanation:
          "This is the standard supplier-redirection attack. Verify through a channel you chose, using contact details held from before the request.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Your bank's fraud team may legitimately ask you to read out a one-time password.",
        correctAnswer: false,
        explanation:
          "Never. The code exists to prove you are you. Anyone asking for it is asking you to authenticate them.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which is the strongest of these passwords in practice?",
        options: [
          "A long unique passphrase used nowhere else",
          "A complex password reused on five sites",
          "A short password changed every thirty days",
          "A complex password written on a note in your drawer",
        ],
        correctAnswer: "A long unique passphrase used nowhere else",
        explanation:
          "Uniqueness defeats credential stuffing, which is how most account takeovers happen. Length beats character substitution.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which second factor best resists SIM swap?",
        options: ["An authenticator app", "An SMS code", "A code read out by phone support", "A security question"],
        correctAnswer: "An authenticator app",
        explanation:
          "It generates codes on the device with no network involvement, so moving your phone number to another SIM gains the attacker nothing.",
      },
      {
        type: "TRUE_FALSE",
        prompt:
          "Someone who clicked a phishing link should be publicly identified so others learn from it.",
        correctAnswer: false,
        explanation:
          "It guarantees the next person conceals their mistake. Fast reporting is worth far more than deterrence, and the two are in direct conflict.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "You realise at 09:15 that you entered your password into a fake login page. When do you report it?",
        options: [
          "Immediately",
          "After checking whether anything looks wrong",
          "At the end of the day, once you are sure",
          "Only if you notice unusual activity",
        ],
        correctAnswer: "Immediately",
        explanation:
          "A credential reset in the first minutes usually closes the incident entirely. The same incident is often unrecoverable weeks later.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// 3. Compliance
// ---------------------------------------------------------------------------

const AML: Course = {
  slug: "aml-kyc-nigerian-institutions",
  title: "Anti-Money Laundering and KYC for Nigerian Institutions",
  subtitle: "What the obligations are, why they exist, and how to apply them proportionately.",
  description:
    "Anti-money laundering obligations are widely treated as paperwork to be completed rather than a risk to be managed, which is precisely why they fail. This course explains what money laundering actually looks like, what Nigerian law requires of regulated businesses, and how to run customer due diligence that is proportionate — heavier where the risk is real, lighter where it is not. For compliance staff, operations teams, and anyone who has been handed an AML responsibility without much explanation.",
  category: "Compliance",
  level: "INTERMEDIATE",
  modules: [
    {
      title: "The problem, and the framework",
      description: "What is actually being prevented, and by which institutions.",
      lessons: [
        {
          title: "Money laundering in three stages",
          minutes: 8,
          body: `Money laundering is the process of making the proceeds of crime appear legitimate. It is conventionally described in three stages, and the distinction is useful because different controls catch different stages.

**Placement.** Getting criminal proceeds into the financial system. This is the riskiest stage for the launderer and the easiest to detect, because cash has to enter somewhere. Structuring — breaking a large sum into many smaller deposits to stay under reporting thresholds — is a placement technique.

**Layering.** Moving the money through transactions designed to obscure its origin. Transfers between accounts, across borders, through shell companies, in and out of assets. The purpose is distance and complexity: enough steps that following the trail costs more than it is worth.

**Integration.** The money re-enters the economy looking legitimate — as business revenue, property, or an investment return. At this stage it is very difficult to distinguish from ordinary wealth.

Why this matters operationally: most institutions concentrate their effort on onboarding, which addresses placement. But layering is where the volume is, and it is caught by transaction monitoring rather than by identity checks. An institution with excellent KYC and no monitoring has secured the front door and left the building open.

It is also worth being clear about the harm, because AML compliance is easier to take seriously when the reason is concrete. The predicate crimes in the Nigerian context include public-sector corruption, oil theft, kidnapping for ransom, and advance-fee fraud. The money moving through these systems is the proceeds of those things, and the point of the controls is to make them harder to profit from.`,
        },
        {
          title: "The Nigerian framework",
          minutes: 9,
          body: `Several institutions matter, and it helps to know which does what.

**The Money Laundering (Prevention and Prohibition) Act 2022** is the principal statute. It criminalises money laundering, imposes obligations on financial institutions and designated non-financial businesses and professions, and sets out reporting duties.

**The Nigerian Financial Intelligence Unit (NFIU)** receives suspicious transaction reports and currency transaction reports, analyses them, and disseminates intelligence to law enforcement. It is the body your reports go to.

**The Economic and Financial Crimes Commission (EFCC)** investigates and prosecutes.

**SCUML** — the Special Control Unit against Money Laundering — supervises designated non-financial businesses and professions for AML compliance and handles their registration.

**Sectoral regulators** impose their own requirements on top. The Central Bank of Nigeria for banks and other financial institutions, SEC for capital markets, NAICOM for insurance.

The category most often overlooked is **designated non-financial businesses and professions**: legal practitioners, accountants, estate agents, dealers in precious stones and metals, car dealers, and others. Many such businesses do not think of themselves as being in the AML regime at all, and registration with SCUML is a live obligation rather than a formality.

Two obligations apply broadly and are worth knowing regardless of sector:

**Customer due diligence** before establishing a business relationship, and on an ongoing basis afterwards.

**Reporting** — suspicious transactions to the NFIU, and cash transactions above the prescribed threshold, within the periods the law specifies.`,
        },
      ],
    },
    {
      title: "Knowing your customer",
      description: "Proportionate due diligence, rather than uniform paperwork.",
      lessons: [
        {
          title: "Customer due diligence and the risk-based approach",
          minutes: 10,
          body: `Customer due diligence means identifying your customer, verifying that identity from reliable sources, understanding the purpose of the relationship, and monitoring it over time.

The phrase that governs how much you do is **risk-based approach**, and it is routinely misunderstood. It does not mean "do less". It means allocate effort in proportion to risk — heavier where risk is genuinely higher, lighter where it is genuinely lower — and be able to justify the allocation.

Three levels in practice:

**Simplified due diligence**, where risk is demonstrably low. Permitted in defined circumstances, and it is a reduction in intensity, never an absence of due diligence.

**Standard due diligence** for the majority of relationships: identify and verify the customer, understand the nature and purpose of the relationship, and monitor.

**Enhanced due diligence** where risk is higher — politically exposed persons, complex or opaque ownership structures, higher-risk jurisdictions, unusual transaction patterns. This means more evidence, senior approval to onboard, and closer ongoing monitoring.

Two failures are common and both are versions of the same mistake: treating every customer identically.

**Uniform heavy process** frustrates low-risk customers, generates enormous volumes of documentation nobody reads, and — critically — buries genuine signals in noise.

**Uniform light process** means the higher-risk relationships receive the same cursory look as everyone else, which is where the actual exposure sits.

Due diligence is also not a one-off. A customer onboarded five years ago on a modest salary who now moves substantial sums through the account has changed risk profile, whatever the file says. Ongoing monitoring is the obligation that catches this, and it is the one most often neglected once onboarding is complete.`,
        },
        {
          title: "Politically exposed persons",
          minutes: 8,
          body: `A politically exposed person is someone entrusted with a prominent public function — and, importantly, their close family members and known close associates.

The category exists because prominent public position creates opportunity for corruption, and because the proceeds are frequently moved through relatives and associates rather than the individual.

Being a PEP is **not** an accusation. It is a risk classification. Most PEPs are entirely legitimate customers, and treating the status as disqualifying is both wrong and, in some contexts, unlawful discrimination. The requirement is enhanced due diligence, not refusal.

In the Nigerian context the category is broad and the associate limb is where institutions most often fail. Screening a customer's own name against a PEP list and stopping there misses the arrangement where an official's business associate holds the account.

What enhanced due diligence requires for a PEP relationship:

**Senior management approval** to establish or continue it.

**Establishing the source of wealth and the source of funds.** These are different questions, and both matter. Source of wealth is how the overall fortune was accumulated; source of funds is where the specific money in this transaction came from. A plausible answer to one does not answer the other.

**Enhanced ongoing monitoring**, with a lower threshold for asking questions.

A practical note: PEP status persists for a period after the person leaves office, on a risk-sensitive basis. Someone who left a ministerial position last year has not stopped being higher risk because their term ended.`,
        },
        {
          title: "Beneficial ownership",
          minutes: 8,
          body: `The beneficial owner is the natural person who ultimately owns or controls a customer, or on whose behalf a transaction is conducted. The essential word is **natural** — the chain has to end at a human being.

This is where layering is defeated or not defeated. A structure of companies owning companies, some in jurisdictions that do not publish ownership, is the standard method of putting distance between a person and their money. Accepting "the customer is a company" as the end of the enquiry is accepting the structure at face value.

What is required:

**Identify the natural persons** who ultimately own or control the customer, typically by shareholding above a threshold, or by other means of control where no one meets it.

**Take reasonable measures to verify** that identity. Reasonable measures, not merely recording what the customer asserted.

**Understand the ownership and control structure** of the customer, which means being able to describe the chain rather than holding a single certificate from the top of it.

Where no natural person can be identified through ownership, identify the person exercising control by other means, and failing that the senior managing official — recording that you have done so and why.

Nigeria maintains a persons-with-significant-control regime through the Corporate Affairs Commission under the Companies and Allied Matters Act 2020, which makes some of this verifiable rather than merely assertable. Check it.

The warning sign worth internalising: an ownership structure more complex than the business needs. A trading company with one product and a five-layer holding chain across three jurisdictions has arranged itself that way for a reason, and the reason is worth understanding before you onboard it.`,
        },
      ],
    },
    {
      title: "When something looks wrong",
      description: "Recognising it, reporting it, and saying nothing to the customer.",
      lessons: [
        {
          title: "Red flags",
          minutes: 8,
          body: `No single indicator proves money laundering. What matters is the pattern, and whether the activity fits what you know about this customer.

Indicators worth attention:

**Transactions that do not match the profile.** A business whose stated activity cannot plausibly generate the volumes passing through the account.

**Structuring.** Multiple transactions just under a reporting threshold, particularly across several days or branches.

**Unnecessary complexity.** Funds routed through several accounts or jurisdictions with no discernible commercial purpose.

**Reluctance to provide information**, or documentation that is inconsistent, recently created, or difficult to verify.

**Undue interest in reporting thresholds** or in your compliance procedures.

**Rapid movement through.** Funds arriving and leaving almost immediately, leaving little or no balance — a pass-through pattern.

**Third parties who do not fit.** Payments from or to people with no evident relationship to the customer.

**Rushed or unusually large early transactions** in a newly established relationship.

The judgement to apply is not "is this criminal?" — you are not required to know, and you should not try to investigate like an enforcement agency. The question is narrower and lower: **do I have grounds for suspicion?** Suspicion is a lower bar than belief, and considerably lower than proof.

The corresponding failure is rationalising. It is always possible to construct an innocent explanation for any single transaction. The discipline is to notice when you are constructing one because it would be inconvenient to report.`,
        },
        {
          title: "Suspicious transaction reports, and tipping off",
          minutes: 8,
          body: `Where you have grounds to suspect that funds are the proceeds of crime, or relate to terrorist financing, you must report to the NFIU. The report is made in the prescribed form and within the period the law specifies.

Several points that matter in practice.

**The threshold is suspicion, not certainty.** You are not required to establish that a crime occurred. Reporting a suspicion that turns out to be innocent is the system working as designed; failing to report one that turns out to be well-founded is not.

**Report promptly.** Delay while assembling a more complete picture defeats the purpose, which is to give the financial intelligence unit timely information.

**Do not tip off the customer.** Disclosing to the subject that a report has been made, or that an investigation is under way, is a criminal offence in itself. This is easy to breach carelessly — a well-meant "I have to file something about this transaction" is tipping off. So is behaving in an obviously altered way toward the customer.

**Continue the relationship unless told otherwise, or unless your own risk assessment requires exit.** Abruptly closing an account immediately after filing can itself signal that a report was made.

**Keep the records.** Reports, the reasoning behind them, and the reasoning where you considered reporting and decided not to. That last category is the one that demonstrates judgement was exercised rather than avoided.

Finally, on protection: staff who report suspicions in good faith are protected. Make sure your people know that, because the fear of being wrong is what stops reports being made — and an unmade report is the only kind that causes harm.`,
        },
      ],
    },
  ],
  quiz: {
    title: "AML and KYC check",
    description: "Six questions. 70% to pass, and you may retake it.",
    passingScore: 70,
    questions: [
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which stage of money laundering does transaction monitoring principally address?",
        options: ["Layering", "Placement", "Integration", "Predicate offending"],
        correctAnswer: "Layering",
        explanation:
          "Onboarding checks address placement. Layering is movement after entry, and it is caught by monitoring rather than identity verification.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Where do suspicious transaction reports go in Nigeria?",
        options: [
          "The Nigerian Financial Intelligence Unit",
          "The EFCC directly",
          "The Central Bank of Nigeria",
          "The Nigeria Data Protection Commission",
        ],
        correctAnswer: "The Nigerian Financial Intelligence Unit",
        explanation:
          "The NFIU receives and analyses reports, then disseminates intelligence to law enforcement including the EFCC.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "A risk-based approach means applying lighter due diligence across the board.",
        correctAnswer: false,
        explanation:
          "It means proportionality — heavier where risk is higher, lighter where it is genuinely lower — and being able to justify the allocation.",
      },
      {
        type: "TRUE_FALSE",
        prompt: "Identifying a politically exposed person means the relationship must be refused.",
        correctAnswer: false,
        explanation:
          "PEP status is a risk classification, not an accusation. It requires enhanced due diligence and senior approval, not refusal.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "A corporate customer is owned by two holding companies across three jurisdictions. What must you establish?",
        options: [
          "The natural persons who ultimately own or control it",
          "That the top holding company is registered",
          "The identity of the company secretary",
          "That the structure is lawful in each jurisdiction",
        ],
        correctAnswer: "The natural persons who ultimately own or control it",
        explanation:
          "Beneficial ownership must end at a human being. Accepting a corporate shareholder as the answer accepts the structure at face value.",
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "You have filed a suspicious transaction report. The customer asks why their transfer is delayed. What may you say?",
        options: [
          "Nothing about the report — telling them is a criminal offence",
          "That a report has been filed, so they can explain",
          "That compliance is reviewing them for money laundering",
          "That the NFIU has been notified",
        ],
        correctAnswer: "Nothing about the report — telling them is a criminal offence",
        explanation:
          "Tipping off is an offence in itself, and it is breached carelessly far more often than deliberately.",
      },
    ],
  },
};

const COURSES = [NDPA, SECURITY, AML];

// ---------------------------------------------------------------------------

async function instructorId(): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: "INSTRUCTOR" } } }, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: "faculty@demo.copaserve.test",
      status: "ACTIVE",
      profile: { create: { firstName: "CopaServe", lastName: "Faculty" } },
    },
    select: { id: true },
  });

  const role = await prisma.role.findUnique({ where: { name: "INSTRUCTOR" }, select: { id: true } });
  if (role) await prisma.userRole.create({ data: { userId: created.id, roleId: role.id } });

  return created.id;
}

async function publish(course: Course, teacher: string) {
  const category = await prisma.category.findFirst({
    where: { name: course.category },
    select: { id: true },
  });

  const existing = await prisma.course.findUnique({
    where: { slug: course.slug },
    select: { id: true, _count: { select: { enrollments: true } } },
  });

  // Never rebuild content underneath someone who is part-way through it:
  // deleting a module cascades to lessons, and lesson progress with it.
  if (existing && existing._count.enrollments > 0) {
    console.log(`  SKIP  ${course.slug} — ${existing._count.enrollments} enrolment(s), content left alone`);
    return;
  }

  if (existing) {
    await prisma.module.deleteMany({ where: { courseId: existing.id } });
    await prisma.quiz.deleteMany({ where: { courseId: existing.id } });
  }

  const minutes = course.modules.reduce(
    (sum, module) => sum + module.lessons.reduce((s, lesson) => s + lesson.minutes, 0),
    0,
  );

  const data = {
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    status: "PUBLISHED" as const,
    level: course.level,
    priceMinor: 0,
    currency: "NGN",
    estimatedMinutes: minutes,
    isFeatured: course.featured ?? false,
    publishedAt: new Date(),
    certificateEnabled: true,
    instructorId: teacher,
    ...(category ? { categoryId: category.id } : {}),
  } satisfies Prisma.CourseUncheckedCreateInput | Prisma.CourseUncheckedUpdateInput;

  const saved = existing
    ? await prisma.course.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.course.create({ data: { ...data, slug: course.slug }, select: { id: true } });

  for (const [index, module] of course.modules.entries()) {
    await prisma.module.create({
      data: {
        courseId: saved.id,
        title: module.title,
        description: module.description,
        position: index,
        lessons: {
          create: module.lessons.map((lesson, position) => ({
            title: lesson.title,
            type: "TEXT" as const,
            content: lesson.body,
            position,
            durationSeconds: lesson.minutes * 60,
            // The first lesson of the first module is readable before enrolling,
            // so the catalogue can show the writing rather than describe it.
            isPreview: index === 0 && position === 0,
          })),
        },
      },
    });
  }

  await prisma.quiz.create({
    data: {
      courseId: saved.id,
      title: course.quiz.title,
      description: course.quiz.description,
      passingScore: course.quiz.passingScore,
      countsTowardCertificate: true,
      showAnswersAfter: true,
      questions: {
        create: course.quiz.questions.map((question, position) => ({
          type: question.type,
          prompt: question.prompt,
          options: (question.options ?? []) as Prisma.InputJsonValue,
          correctAnswer: question.correctAnswer as Prisma.InputJsonValue,
          explanation: question.explanation,
          points: 10,
          position: position + 1,
        })),
      },
    },
  });

  const lessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
  console.log(
    `  ${existing ? "UPDATED" : "CREATED"}  ${course.slug} — ${course.modules.length} modules, ${lessons} lessons, ${course.quiz.questions.length} questions, ~${minutes} min`,
  );
}

async function remove() {
  for (const course of COURSES) {
    const existing = await prisma.course.findUnique({
      where: { slug: course.slug },
      select: { id: true, _count: { select: { enrollments: true } } },
    });
    if (!existing) continue;

    if (existing._count.enrollments > 0) {
      console.log(`  SKIP  ${course.slug} — has enrolments, not deleting`);
      continue;
    }

    await prisma.course.delete({ where: { id: existing.id } });
    console.log(`  REMOVED  ${course.slug}`);
  }
}

async function main() {
  if (process.argv.includes("--remove")) {
    console.log("Removing demonstration courses:");
    await remove();
    return;
  }

  console.log("Publishing demonstration courses:");
  const teacher = await instructorId();
  for (const course of COURSES) await publish(course, teacher);

  const published = await prisma.course.count({ where: { status: "PUBLISHED" } });
  console.log(`\n${published} published course(s) in the catalogue.`);
  console.log(
    "\nThese are demonstration materials. Have a subject-matter expert review them\n" +
      "before anyone is certified on the strength of them.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
