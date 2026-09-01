# Decisions

Answers to the open questions in `CopaServe-LMS-PRD.md` §17, and the choices
that diverge from the PRD. The PRD stays the north-star document; this records
where reality has since been settled, so a decision made once is not re-argued
from memory.

Newest first.

---

## 2026-09-01 — Four of the §17 open questions answered

**§17 q1 — Certificate palette: brand green.** §11.2 asked for purple and gold,
which conflicts with the green/black/white brand in §6.3. Settled in favour of
green, which is what `lib/certificates/pdf.ts` already drew — it had picked
brand over the PRD text and said so in a comment while the question was open.
No code change; the PRD is now the stale document.

**§17 q4 — 2FA is optional at launch, not enforced.** No admin or super admin
is forced through a second factor to sign in.

Clarified the same day as "anyone who wants it can turn it on", and built:
TOTP through Supabase's own MFA, enrolled from the profile page, challenged at
`/two-factor` after a password.

The part that makes it real rather than decorative: a session that has passed a
password but not an enrolled factor is treated as signed out everywhere.
`getCurrentUser()` returns null in that state — reported as null rather than as
a flag because thirty-odd call sites treat non-null as authenticated, and a
flag any of them could forget to read would leave two-factor purely cosmetic.
`requireUser` and the middleware both route that session to the challenge
rather than to `/login`, since sending it to a password form would loop.

Removing a factor requires a current code, not merely a session. Otherwise
anyone who borrowed an unlocked laptop could strip the protection off.

**§17 q7 — Zoom first.** Already the default: `LiveClassProvider` defaults to
`ZOOM`. Note that neither provider is integrated in the API sense — an
instructor pastes a meeting link their provider gave them, and attendance is
self-reported. Prioritising Zoom means Zoom is the one that gets a real OAuth
and meeting-creation integration first.

**§17 q3 — Metric targets:**

| | Target |
|---|---|
| Registered learners | 1,000 |
| Certificates issued | 1,000 |
| Corporate/institutional accounts | 20 |

Against today: 5 users (all demo fixtures), 0 certificates, 0 organisations.
The certificates target is the demanding one — it implies roughly every
registered learner completes a course, where a typical online course completion
rate is well under half. Either the learner target needs to be higher than the
certificate target, or the courses need to be short enough that finishing is
the norm rather than the exception.

**Still open in §17:** q2 (which corporate accounts are committed for launch),
q5 (verification domain, pending registration) and the rest of q6 (who owns
smart contract development and audit).

---

## 2026-09-01 — Payments run on BIT Ltd's Paystack, as a separate business

**Decided:** CopaServe bills through the parent company's Paystack account
rather than its own. Paystack verification is per legal entity, and BIT Ltd is
already verified, so this skips CAC, bank and ID paperwork entirely.

**With one refinement:** create CopaServe as a *separate Business* under that
account rather than reusing BIT Ltd's existing keys.

- Checkout shows the business name. A student buying an NDPA course who sees
  "Business Intelligence Technologies Limited" is likelier to abandon, or to
  dispute the charge later when their statement does not match what they think
  they bought.
- Webhook URLs are per business. Sharing one means every BIT product's
  transactions POST to CopaServe's endpoint. Nothing breaks —
  `finalisePayment` returns `UNKNOWN_REFERENCE` and the route still answers 200,
  so there is no retry storm — but the logs fill with other products' traffic
  and BIT's other products inherit ours.
- Settlement and reporting stay separable per product.

**No code change:** `PAYSTACK_SECRET_KEY` is one environment variable and the
driver interface is already provider-agnostic. Settlement lands in BIT Ltd's
account either way, since CopaServe is not separately incorporated.

---

## 2026-09-01 — Minting: students pay their own gas (§17 q6, partial)

**Decided:** the mint transaction is submitted from the student's own wallet
and they pay the network fee. CopaServe funds no gas.

**What this forces.** The platform can no longer mint on a student's behalf,
so the contract has to answer a new question: how does it know this holder is
entitled to this credential? A wallet that can mint freely is a wallet that can
mint itself a forged certificate.

The answer is a signed voucher (lazy minting):

1. The student asks CopaServe to authorise a mint.
2. CopaServe checks eligibility and signs a voucher naming the certificate,
   the holder's address, the metadata URI and an expiry — EIP-712 on EVM, a
   co-signature on Solana, where the fee payer is a separate signer from the
   authority.
3. The student submits the transaction with that voucher and pays the fee.
4. The contract verifies the signature came from CopaServe's mint authority,
   mints, and marks the voucher spent.

A useful consequence: CopaServe holds a signing key but never a funded hot
wallet. A stolen key can forge vouchers — bad, and rotatable — but cannot drain
funds, which is a materially smaller surface than a relayer holding gas money.

**Known cost of this choice.** Gas on Base and Solana is fractions of a cent,
so the fee is not the barrier — obtaining any native token at all is. A Lagos
compliance officer who has just finished an NDPA course needs an exchange
account, KYC and a funded bank rail before they can spend $0.001. Expect
minting to be used by a crypto-native minority rather than the general
population. That is acceptable under §6.2, where minting is additive and the
certificate is equally valid unminted, but it should be an expectation rather
than a surprise.

**Reversible.** If minting should later be universal, an ERC-4337 paymaster on
EVM or a fee-payer service on Solana can sponsor gas without changing the
voucher model. The architecture above does not have to be revisited.

**Still open in q6:** who owns smart contract development and audit. Until that
is settled there is no contract, no address and no ABI, so nothing mints.

---

## 2026-09-01 — Minting targets Base, Polygon and Solana (§17 q6, partial)

**Decided:** drop Avalanche. Support Base and Polygon (EVM) and Solana.

Avalanche C-Chain is itself EVM, so the PRD's "Avalanche EVM first,
Polygon-compatible" was one option described twice. Chains are now identified
by a string key in `lib/chains.ts` rather than a numeric id, because Solana has
no numeric chain id and encoding that as `0` would make the column lie.

---

## 2026-08-31 — The site is set in Lufga (§6.3 divergence)

**Decided:** one family throughout, replacing the Inter + Space Grotesk pairing
in §6.3. Headings and body differ by weight and size instead.

**Open:** Lufga is commercial. A desktop licence does not normally cover
webfont embedding, and four woff2 files are now served publicly. Confirm the
licence covers this.

**Known:** Lufga has no naira sign, so `₦` renders from the fallback stack.

---

## 2026-08-31 — Production runs on `copaservelms.vercel.app` (§17 q5)

**Decided for now:** `copaserve.ng` is not registered, so the verification
domain in §17 q5 stays unsettled.

**Blocks:** transactional email (Resend cannot verify an unregistered domain),
and issuing real certificates — a certificate's QR URL is baked in at issuance,
so certificates issued against the Vercel domain would keep pointing at it.
