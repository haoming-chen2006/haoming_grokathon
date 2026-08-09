## Brief

A meme desk for *Musk v. Altman*. Three lanes, run in order: the record is established, live
formats are read against it, and memes are cut that carry the record without breaking it.

The whole design is one rule: **nothing crosses a section boundary without an id.** A trend is only
a candidate if it names the claim it can carry. A meme is only finished if it names both the claim
and the format it came from. That is what makes an orphan — a joke about something nobody verified —
impossible to ship by accident rather than merely discouraged.

Source of record, both already in the library:

- [@Musk_v_Altman_Case_Analysis.pdf](asset:asset_msl4a82c3to8pho)
- [@Musk_v_Altman_Record_Appendix.pdf](asset:asset_msl4a51i13lb5dv)

```project
name: Musk v. Altman — Meme Desk
category: documents
budget: 25
areas:
  - Legal Research: the claim ledger — every claim tagged with its status and its cite
  - Trend Watch: the format board — live formats that can carry a claim without distorting it
  - Meme Production: finished memes, each tracing to one claim and one format
```

Read the lane you own. Read the lane above you, because its output is your input. Do not write in a
lane you do not own — if you think it is wrong, suggest against it.

## 1. Legal Research — the claim ledger

**Owner: Legal Research. Input: the two case PDFs. Output: a numbered claim ledger.**

The deliverable is a table. Every row is one claim, and every row carries four things:

| id | the claim, one sentence | status | cite |
|----|-------------------------|--------|------|

- **id** — `C-1`, `C-2`, … Stable. Downstream lanes refer to these and nothing else.
- **status** — exactly one of `ALLEGED` · `ADMITTED` · `FOUND` · `ORDERED` · `DISPUTED` · `UNVERIFIED`.
- **cite** — document and page, or docket entry number. A row without one is not a row.

Add a fifth column, **plain**: the same claim in one sentence a non-lawyer reads correctly. That
column is what Section 3 actually writes jokes from, so it does the real work here.

### The rule that matters more than the rest

**Never collapse "alleged" into "true."** A party's complaint asserts; a court finds; a commentator
opines. These are three different things and the status tag is the only thing holding them apart
once the claim leaves this section. Almost every piece of viral legal content that gets corrected,
ratioed, or lawyered fails exactly here — it takes a sentence from a filing and renders it as a
finding of fact. The tag is not bureaucracy. It is the product.

### Verification discipline

- **Do not answer from memory.** Model recall of this docket is stale and this case has moved fast —
  filings, a refiling, counterclaims, and a scheduled trial. Assume anything you "know" without
  reading it is wrong, including dates and the current posture.
- Establish **current posture first**: which court, which operative complaint, what has been decided,
  what is pending, what is scheduled. Write it as its own short paragraph above the table, each
  sentence cited. If the assets do not settle it, say so in that paragraph rather than filling the
  gap.
- Anything you cannot tie to a cite is tagged `UNVERIFIED` and **stays in this section**. It is
  visible so nobody re-researches it, and it is fenced so nobody memes it.
- Where the two documents disagree, tag `DISPUTED` and record both cites. Do not pick a winner.

**Done means:** a posture paragraph, at least 12 rows, every shipped row cited, and zero
`UNVERIFIED` rows in the set you hand down.

## 2. Trend Watch — the format board

**Owner: Trend Watch. Input: the claim ledger. Output: a numbered format board.**

Read **formats, not topics.** A topic is what people are posting about this week and it is dead
before you finish. A format is the reusable container — the joke's structure, the shape it travels
in. Formats outlive the discourse that spawned them, which is why they are what you can actually
build on.

Every row on the board carries:

- **id** — `F-1`, `F-2`, …
- **the structure** — what the joke mechanically *is*. "Two-panel escalation." "Confidently wrong
  authority figure." "Overspecific chart." If you cannot state the structure in one clause, you are
  looking at a topic.
- **where it is live** — platform, and roughly how long it has been running.
- **decay** — your honest estimate of shelf life. A format three weeks into its run is a liability.
- **carries** — the claim ids it can hold: `C-3`, `C-7`.

### The interlock

**A format is a candidate only if it can carry a claim at that claim's status.** A format whose
whole comic engine is *stated verdict* cannot carry an `ALLEGED` claim — using it would launder an
allegation into a finding, which is precisely the failure Section 1 exists to prevent. Formats that
frame, exaggerate, or hypothesize are safe for `ALLEGED`. Formats that assert are only safe for
`FOUND` and `ORDERED`.

If a strong format has no claim it can legally carry, list it in a **rejected** block with the
reason. That block is useful — it stops the next person from proposing it again.

### Rule out

- Formats keyed to one creator's audio, face, or catchphrase, where reuse reads as their endorsement.
- Formats already peaking. By the time this ships they are the joke, not the vehicle.
- Formats that require the viewer to already know the case. This travels past people who do not.

**Done means:** 6–8 candidate formats, each with a structure, a decay estimate, and at least one
claim id it can carry at that claim's status — plus the rejected block with reasons.

## 3. Meme Production — the cut

**Owner: Meme Production. Input: the ledger and the board. Output: finished memes with specs.**

Every meme ships with a spec:

- **traces to** — one claim id and one format id. Both required. **No orphans.** A meme that cannot
  name its claim is a meme nobody verified.
- **the image** — the finished asset.
- **caption** — final text, as it posts.
- **alt text** — written for someone who cannot see it, not stuffed with keywords.
- **why it travels** — one line. If you cannot write it, the meme does not travel.
- **self-check** — one line confirming the four constraints below.

### The four constraints

1. **Public conduct, public filings.** These are two of the most public figures alive and their
   litigation is a legitimate target. Their families, homes, health, and private life are not.
2. **An invented line must read as invented.** Satire writes words nobody said — that is the form
   working. The format has to make the invention obvious. A line rendered as a real quote, a real
   post, or a real screenshot is not satire, it is a fake, and it will outlive the joke.
3. **No ruling that has not happened.** An `ALLEGED` claim stays visibly alleged in the punchline.
   Verdict-shaped jokes about undecided claims are the single fastest way to get corrected by
   someone with the docket open.
4. **No counterfeit artifacts.** Nothing that could be mistaken for a genuine filing, order,
   transcript, or platform screenshot when it is cropped and reposted without your caption. Assume
   it will be.

### Caption discipline

The punchline has to carry the claim's status, not just its content. *"Musk says Altman…"* and
*"the court found Altman…"* are different jokes with different risk, and the second one is only
available to you if Section 1 tagged it `FOUND`. Write the status into the joke — the hedge is
funnier than the assertion anyway, because the hedge is where the absurdity of the whole fight
actually lives.

Spread the set across the ledger. Ten memes on one claim is one meme.

**Done means:** 10 finished memes, each with a complete spec, each tracing to a distinct
claim-and-format pair, covering at least 5 different claim ids — and a closing line naming every
claim id you deliberately left uncovered, with why.
