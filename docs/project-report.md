# AI SCAM OR LEGIT? — Banking Fraud Detector

## Project Report and Portfolio Documentation — Version 2

**ChekMsg v0.5.0** · Report generated 2026-08-11 · Supersedes the 2025 edition

> **Placeholders.** Everything marked `[FILL IN: …]` is something this document cannot verify from the code — dates, people, and field-test details. Search for `FILL IN` before submitting.
>
> **Every other number here was measured**, not estimated. Run `npm test` and `npm run compare` to reproduce all of them.

---

## Contents

1. Project Overview
2. Problem Statement
3. Methodology
4. Dataset Documentation
5. Accuracy Evaluation
6. Community Impact
7. Reflection and Learnings
8. Future Improvements
9. Appendix — Reproducing and Updating This Report

---

## 1. Project Overview

This report documents a banking fraud detection tool for Thai users. It classifies SMS messages, LINE notifications, and banking alerts as **Likely Scam**, **Cannot Confirm**, or **Likely Legitimate**, and lists the specific signals behind every verdict in the user's own language.

### A correction to the 2025 report

The 2025 edition described the tool as being built from Softr, Make, the OpenAI API, and Google Sheets. **That was the curriculum's suggested stack, not what was built.** The tool that was actually deployed and field-tested was a single self-contained HTML file with the pattern list written directly into the code, calling no external service at all.

This is verifiable. The deployed page is still online, and it contains no network calls whatsoever:

```
https://ren3-dev-svg.github.io/chekMsg/      ← ChekMsg v0.3, the version 23 people tested
  one file, 495 lines
  external API calls: 0
  const scamWords / const legitWords         ← patterns hard-coded
```

The correction matters because it changes what this project actually is. It was never an LLM application that later became a rules engine. **It has been a rules engine from the first working version**, and the work since has been making that engine honest, measurable, and safe.

### Version lineage

| Version | What it was | Status |
|---|---|---|
| **v0.3** | 79 keywords hard-coded in one HTML file. One matched word could produce a verdict. | **The version field-tested with 23 users.** Still online. |
| **v0.4** | Patterns moved to `patterns.json`. Margin-based verdicts, category de-duplication, negation handling, domain checking, Thai expansion, OCR, XSS fixes. | Superseded |
| **v0.5** | Adversarial review of the engine itself: three logic vulnerabilities found and closed. Browser-security hardening. CI. | **Current** |

### Tool summary

| Component | Description | Technology |
|---|---|---|
| Interface | Paste text, drop a screenshot, or press Ctrl+V | Plain HTML/CSS/JS — no framework |
| Detection engine | Weighted patterns, category de-duplication, margin verdicts | `engine.js`, 261 lines, no dependencies |
| Pattern library | 167 editable patterns, 29 categories, Thai and English | `patterns.json` |
| Screenshot reading | Optional OCR; runs in-browser by default | Tesseract.js, or Typhoon OCR via a self-hosted proxy |
| Pattern editor | Add wording and see instantly which test cases improve or break | `admin.html` |
| Test harness | 7 suites, 3-level grading, exits non-zero on dangerous errors | `tests/run-tests.js` |
| Version comparison | Runs v0.3 against today's test set | `tools/compare-versions.mjs` |
| Continuous integration | Full suite on every push, Node 20 and 22 | GitHub Actions |

### Project scale

| | v0.3 | v0.5 |
|---|---:|---:|
| Patterns | 79 | **167** |
| Thai patterns | `[FILL IN: count if needed]` | **96** |
| Test cases | 15 (self-written) | **71** across 7 suites |
| Lines of code | 495 | ~2,085 |
| Dependencies | 0 | 0 |
| Running cost | 0 | 0 |
| Data collected from users | none | none |

---

## 2. Problem Statement

Banking fraud via SMS and messaging apps is among the most common financial crimes in Thailand. Scammers impersonate KBank, SCB, Bangkok Bank, Krungthai and government agencies, manufacturing urgency, requesting one-time passwords, or directing victims to domains that mimic official ones. Older adults are especially exposed, because these messages arrive in the same inbox as genuine bank notifications and imitate their format closely.

Awareness campaigns rely on static material that cannot keep pace with changing wording. This project addresses that gap with a tool that analyses a message on demand and explains its reasoning in plain language, so the user learns the pattern rather than just receiving a verdict.

**A constraint the problem imposes on the solution:** the people who most need this tool are being asked to hand over the exact messages containing their account numbers and balances. A fraud-prevention tool that harvests financial data is a contradiction. This is why the tool processes everything locally — the privacy property is not a feature choice, it follows from who the users are.

### Signals the tool looks for

| Signal | Description | Categories |
|---|---|---|
| OTP and credential requests | Asking for a one-time password, PIN, or account details | `otp_request`, `credential_request` |
| Account threats | Claims the account will be suspended or frozen | `account_threat` |
| Manufactured urgency | "Within 24 hours", "immediately", "final notice" | `urgency` |
| Link pressure | Instructions to click, plus untrusted or shortened domains | `click_link`, `link_short`, `link_untrusted` |
| Institutional impersonation | Posing as a bank, Revenue Department, Thai Post, Customs | `impersonate_bank`, `impersonate_gov` |
| Delivery and customs fees | Fake parcel charges, import tax, toll fees | `delivery` |
| Financial lures | Loans without credit checks, guaranteed returns, easy income, gambling | `loan`, `investment`, `job`, `gambling` |
| App installation | Instructions to install an APK outside official stores | `app_install`, `link_apk` |

The library also carries **41 patterns for legitimate messages** — transaction confirmations, balance notices, reference numbers, maintenance announcements, and genuine bank security advice. Section 5 shows what happens without them: v0.3 had 22 such patterns and still flagged four real bank messages as scams.

---

## 3. Methodology

### How a verdict is produced

```
message
  → normalise (lowercase; strip spaces and invisible characters)
  → match scam patterns      → suppress those genuinely negated
  → match legitimate patterns
  → structural checks        (shortened links, APK links, domain allowlist)
  → keep the highest weight per category, on each side
  → scamScore − legitScore = margin
  → margin ≥ 4  → Likely Scam
    margin ≤ −2 → Likely Legitimate
    otherwise   → Cannot Confirm
```

### What changed from v0.3, and why

| v0.3 behaviour | Problem it caused | v0.5 behaviour |
|---|---|---|
| Any single matched word could produce a verdict (`scamScore > 0 && scamScore >= legitScore`) | The word "urgent" alone flagged a genuine bank message as a scam | A verdict requires a margin of 4 |
| All matches summed, no grouping | Ten phrasings of the same idea scored ten times | Highest weight per category counts once |
| No concept of negation | "Do not share your PIN" — real bank advice — scored as a credential request | Negation understood, but only in categories where banks actually use it |
| Patterns hard-coded in the HTML | Adding a word meant editing and redeploying code | `patterns.json`, editable without touching code |
| Confidence shown as a percentage | The number had no statistical basis | Three signal-strength levels, no false precision |
| User text inserted via `innerHTML` | Cross-site scripting from a pasted message | Every element built with `textContent` |

### Development process

Every fix in v0.5 followed the order now enforced by `CONTRIBUTING.md`:

1. Write a test case that reproduces the failure and confirm the suite **fails**
2. Fix the engine
3. Confirm the suite passes **and that no previously passing case broke**
4. Commit test and fix together

`[FILL IN: map v0.3 → v0.4 → v0.5 onto the eight programme sessions, with dates]`

---

## 4. Dataset Documentation

### Structure

The 71 test cases are not one pool. They are seven suites, each answering a different question, because a single accuracy figure cannot distinguish "we catch scams" from "we agree with ourselves".

| Suite | Cases | Question it answers | Counts toward score |
|---|---:|---|---|
| `regression_v03` | 15 | Did a change break what already worked? | **No** |
| `holdout_bank_real` | 15 | Are genuine bank messages wrongly flagged? | Yes |
| `holdout_scam_th` | 12 | Are real Thai scams caught? | Yes |
| `holdout_scam_en` | 6 | Are English scams caught? | Yes |
| `holdout_ambiguous` | 4 | Does the tool guess when it should not? | Yes |
| `evasion` | 7 | Can the logic be tricked using words it already has? | Yes |
| `adversarial` | 12 | How brittle is it when a scammer avoids known wording? | Yes |
| **Scored total** | **56** | | |

### Why one suite is excluded — demonstrated, not asserted

`regression_v03` was written from v0.3's own keyword list. Running v0.3 against the full test set shows exactly what that is worth:

| v0.3 measured against | Score |
|---|---|
| The suite written from its own keywords | **15/15 — 100.0%** |
| The six independent suites | **21/56 — 37.5%** |

The same tool, the same day, scores 100% or 37.5% depending only on **who wrote the exam.**

This is the flaw behind the 86% reported in the 2025 edition. That figure came from 50 messages collected and labelled by the same team, using the same signal list that drove the tool. It measured agreement between the tool and its authors. It was not dishonest — it was measuring the wrong thing, and nobody questioned it because the number looked good.

The current design makes that mistake structurally difficult:

- The self-referential suite is kept for regression detection but **excluded from every reported figure**
- Hold-out suites were written from police and bank fraud advisories, deliberately not from the pattern library
- The hardest suite is **included in the score on purpose**, which pulls the headline number down and keeps it honest

### Composition

| | Thai | English | Total |
|---|---:|---:|---:|
| Test cases | 40 | 31 | 71 |
| Scam patterns | 74 | 49 | 123 |
| Legitimate patterns | 22 | 19 | 41 |

Expected verdicts across all 71 cases: 42 scam, 25 legitimate, 4 genuinely ambiguous.

### Sample entries

| Message (excerpt) | Suite | Expected | Why |
|---|---|---|---|
| พัสดุตกค้างที่ศุลกากร กรุณาชำระค่าธรรมเนียม 45 บาท ภายใน 24 ชั่วโมง https://th-post-track.xyz/pay | `holdout_scam_th` | scam | Customs fee + urgency + impersonation + untrusted domain |
| รหัส OTP ของคุณคือ 774512 ห้ามบอกผู้อื่นเด็ดขาด (Ref: KX8821) | `holdout_bank_real` | legit | Genuine OTP with a warning — **v0.3 called this a scam** |
| Payment received.Thank you for banking with SCB.Your balance is 8,450 THB. | `holdout_bank_real` | legit | OCR output with missing spaces; must not read as a domain |
| ธนาคารไม่เคยขอ บัญชีของท่านจะถูกระงับ ธนาคารไม่เคยขอ กรุณากดลิงก์ยืนยันตัวตน … | `evasion` | scam | Negation-stuffing attack |
| ธนาคารกรุงไทย เสนอสินเชื่อบุคคล ดอกเบี้ยต่ำพิเศษ สมัครได้ที่ krungthai.com | `adversarial` | legit | Real bank promotion using loan wording |
| Kindly reply with the 6 digit code we just sent so we can cancel the transaction. | `adversarial` | scam | OTP request that never says "OTP" |

Every case carries a `note` recording why it exists. New cases are added **before** the fix that makes them pass.

---

## 5. Accuracy Evaluation

All figures below come from running both versions against the **same 56 scored cases**. Reproduce with `npm run compare`.

### v0.3 versus v0.5

| Metric | v0.3 (field-tested) | v0.5 (current) | Change |
|---|---:|---:|---|
| Correct | 21/56 | **44/56** | +23 cases |
| Precision — verdicts of "scam" that were scams | 76.5% | **100.0%** | +23.5 pp |
| Recall — scams that were caught | 39.4% | **78.8%** | +39.4 pp |
| F1 | 52.0% | **88.1%** | +36.1 pp |
| **Dangerous errors** | **4** | **0** | −4 |
| Unhelpful answers ("Cannot Confirm" when it should be clear) | 31 | **12** | −19 |

Recall doubled and precision reached 100%, but **the four dangerous errors are the number that matters.**

### Per-suite results

| Suite | v0.3 | v0.5 |
|---|---|---|
| `regression_v03` *(not scored)* | 15/15 | 15/15 |
| `holdout_bank_real` | 4/15 | **14/15** |
| `holdout_scam_th` | 3/12 | **12/12** |
| `holdout_scam_en` | 4/6 | **6/6** |
| `holdout_ambiguous` | 4/4 | 4/4 |
| `evasion` | 6/7 | **7/7** |
| `adversarial` | 0/12 | 1/12 |

### Confusion matrices

**v0.3**

| Expected ↓ / Answered → | Scam | Legitimate | Cannot Confirm |
|---|---:|---:|---:|
| Scam | 13 | 0 | 20 |
| Legitimate | **4** | 4 | 11 |
| Ambiguous | 0 | 0 | 4 |

**v0.5**

| Expected ↓ / Answered → | Scam | Legitimate | Cannot Confirm |
|---|---:|---:|---:|
| Scam | **26** | 0 | 7 |
| Legitimate | 0 | **14** | 5 |
| Ambiguous | 0 | 0 | **4** |

Both off-diagonal corners are now zero: **no scam was called legitimate, and no legitimate message was called a scam.** Every remaining error is a retreat to "Cannot Confirm" — the tool declining to answer rather than answering wrongly.

### What v0.3 got dangerously wrong

All four of v0.3's dangerous errors were the same kind: **real bank messages flagged as scams.**

| Message | v0.3 verdict | Why it failed |
|---|---|---|
| `Your one time password is 483920. Do not share it with anyone.` | Scam | Matched "otp"; no concept of negation |
| `Do not share your PIN or password with anyone, including bank staff.` | Scam | Bank security advice read as a credential request |
| `บัตรเครดิตของท่านมียอดใช้จ่าย 1,250 บาท ที่ Lotus เลขที่อ้างอิง 900123456789` | Scam | A long reference number matched a "suspicious number" rule |
| `We detected an urgent security issue on your card. Please call us at the number on the back of your card.` | Scam | The single word "urgent", weight 1, was enough to decide |

This is the harm that a one-word-wins rule produces, and it is not a harmless failure. A tool that tells someone their genuine OTP is a scam teaches them to distrust the tool — and the next time it says "scam" they may ignore it.

### Why three grades instead of "correct or wrong"

- **Soft error** — the tool says "Cannot Confirm" when it should have been clear. Unhelpful, but the user is told to verify independently. Nobody loses money.
- **Dangerous error** — the tool answers on the wrong side. **The test runner exits with an error code, and CI fails the build.**

Collapsing these into one accuracy figure hides the only distinction that matters to a victim.

### Three vulnerabilities found in v0.5

v0.4 reported zero dangerous errors. That was true of its test set, and it was misleading — the test set contained no attempt to attack the logic itself. An adversarial review found three flaws:

**1. Negation-stuffing flipped a full scam to "Likely Legitimate".** Inserting "the bank never asks" before each phrase erased every scam signal and awarded a bonus for sounding like security advice. Closed by restricting which categories accept negation, and by treating repeated denial phrases as an attack signal.

**2. Filenames read as phishing domains.** Any `word.word` was treated as a domain, so `statement.pdf` and OCR output such as `received.Thank` scored as untrusted domains and could flip a genuine bank message to "scam". Closed by requiring a scheme, a path, or a recognised top-level domain.

**3. Invisible characters defeated keyword matching.** Space-stripping handled spaces, non-breaking spaces, and tabs, but not zero-width spaces or line breaks inside a word — both used in the wild. Closed by stripping all whitespace and invisible characters.

All three are locked in by the seven-case `evasion` suite, which must pass in full.

**The lesson outlives the fixes:** a test set written by the people who built the tool measures what they thought of, not what an attacker will do. "Zero dangerous errors" means "none in the cases we wrote".

### The honest limitation

**The `adversarial` suite scores 1 out of 12, and 7 of those messages produce no signal at all.**

This is the ceiling of the method, not a defect awaiting a fix:

| Case | Why it escapes |
|---|---|
| "กรุณาชำระค่าภาษีนำเข้า 45 บ. ที่ลิงค์นี้" | Spells ลิงค์ instead of ลิงก์; says import tax, not customs |
| "Kindly reply with the 6 digit code we just sent" | Requests an OTP without the word OTP |
| "ต้องย้ายเงินไปพักไว้บัญชีกลางก่อน" | Safe-account fraud phrased in ordinary words |

**Adding these exact phrases would be the wrong response.** It would raise the score without improving the tool — precisely the failure this report identifies in the 86% figure. The suite exists to measure the ceiling, not to be defeated.

A rules engine recognises what has been written down. A scammer who rewords escapes it. The interface says so too: *"Likely Legitimate" means "no red flags found", not "safe".*

### Reproducing every figure

```bash
git clone https://github.com/tharathep-dul/Check_Msg.git
cd Check_Msg
npm test              # v0.5 figures, per-suite results, confusion matrix
npm run compare       # the v0.3 versus v0.5 table in this section
```

No installation, no API key, no account.

---

## 6. Community Impact

### What was tested, and by whom

The field test in the 2025 report was conducted with **v0.3** — the version at `ren3-dev-svg.github.io/chekMsg`. This is stated explicitly because Section 5 shows v0.3 and v0.5 behave very differently, and it would be misleading to present feedback on one as evidence for the other.

| | |
|---|---|
| Users who tested the tool | 23 |
| Messages analysed | 61 |
| Scam messages identified | 17 |
| Found it useful | 91% |
| **Version tested** | **v0.3** |

`[FILL IN: dates and channels of the v0.3 field test]`

`[FILL IN: user quotes, with role and permission to quote. Label them as feedback on v0.3.]`

### What the field test could not reveal

The 23 users reported the tool was useful, and it was — it identified 17 scams that people had received. But measurement afterwards showed that the same version **flagged four kinds of genuine bank message as scams**, including real OTP messages and real bank security advice.

Users had no way to know this. They tested with messages they already suspected, so the false alarms mostly never surfaced. **Positive user feedback confirmed that the tool was useful; it could not confirm that the tool was correct.** Those are different questions, and only the test suite answers the second.

This is the strongest argument for keeping both: field testing shows whether people can use it and want to; the test suite shows whether it is right.

`[FILL IN: if v0.5 is field-tested, record it separately here — do not merge with the v0.3 numbers]`

### How Version 2 changes distribution

| Method | Requirement | Suited to |
|---|---|---|
| `dist/chekmsg-standalone.html` sent over LINE or email | none — opens by double-click, works offline | Relatives who will not install anything |
| Hosted static site | any web host | Open public access |
| Local server on a laptop | Python or Node | Classroom demonstration |

---

## 7. Reflection and Learnings

### A number that looks good is not the same as a number that means something

The most valuable finding of this project is that its own headline metric was wrong — and it can now be proven rather than argued. The same v0.3 engine scores **100% on the exam it wrote for itself and 37.5% on exams written independently**. The 86% reported in 2025 came from the first kind of exam.

The current design answers this structurally: the self-referential suite is excluded from the score, hold-out suites come from external advisories, and the hardest suite is deliberately included so the headline figure cannot look pretty.

The result is a *lower* reported number worth considerably more.

### Not all errors are equal, and averaging hides that

Overall accuracy treats "said Cannot Confirm when it should have said scam" the same as "called a real bank message a scam". For a user these are entirely different events. Separating soft from dangerous errors — and making CI fail on dangerous ones — turned an ethical judgement into an automated rule.

### Users can confirm a tool is useful but not that it is correct

Twenty-three people found v0.3 helpful. Measurement later showed it misclassified genuine OTP messages and bank security warnings. Both facts are true. Positive feedback is evidence about usability and demand; it is not evidence about accuracy, and treating it as such would have left four dangerous failures in place.

### Testing your own work finds only what you already imagined

v0.4 reported zero dangerous errors and was genuinely broken: three ways to defeat the engine existed, and none appeared in the tests, because the people who wrote the engine wrote the tests. Asking "how would I get a scam past this?" rather than "does this work?" found all three within an hour.

### Simplicity is a security property

The tool has no dependencies, no backend, and no database. That was chosen for cost and privacy, but the security consequence was larger: no supply chain to compromise, no server to breach, no stored data to leak. The one remaining external dependency — an OCR library from a CDN — is now version-pinned with an integrity hash, because it was the last path by which foreign code could read what users type.

### Privacy claims must track the code, not the intention

The interface stated that messages are never sent anywhere. In v0.4 that text was fixed, so switching on cloud OCR made the page display a claim that was false while the tool did the opposite. The text now changes with the configuration. A privacy claim that does not track behaviour is worse than none, because users act on it.

### Explainability changes what a user takes away

A user told "asks for your OTP, threatens to suspend the account, pushes you to click a link" learns the shape of the fraud. A user told "87% scam" learns only to trust the tool. For an audience that will meet fraud again next month, the first is worth far more — and unlike a model's confidence score, every one of those reasons can be checked.

`[FILL IN: personal reflection — what was hardest, what you would do differently, what you would tell someone starting this project]`

---

## 8. Future Improvements

### From the 2025 roadmap — now delivered

| Item | 2025 priority | Status |
|---|---|---|
| Thai language optimisation | High | **Done.** 96 Thai patterns; Thai is now the majority of both library and test set. `holdout_scam_th` went from 3/12 to 12/12. |
| Screenshot analysis (OCR) | High | **Done.** Drag, paste, or pick a file. In-browser by default; optional high-accuracy Thai OCR through a self-hosted proxy. |
| Bank-specific verification | Medium | **Done.** 23 verified bank and government domains, 21 institution names. A message naming a bank while linking elsewhere scores as a strong signal. |

### Still open

| Improvement | Priority | Note |
|---|---|---|
| **Feedback channel for wrong results** | **High** | The largest remaining gap. Every pattern comes from advisories and reasoning, not from messages users actually received. The button is coded but unconfigured. Any design must obtain explicit consent before message text leaves the device — a prefilled form link sends the text on click, before the user has agreed to anything. |
| **A second opinion for "Cannot Confirm"** | High | 12 of 56 scored cases end in "Cannot Confirm", and `adversarial` shows this is where reworded scams land. Sending only these cases to a language model would address the ceiling directly — but it needs a backend to hold the key and reopens the privacy question, so it must be opt-in per message, with the text shown before it is sent. |
| Live URL reputation checking | Medium | Deliberately not implemented: it sends evidence of what the user received to a third party. Needs the same explicit-consent treatment. |
| Sender-number verification | Medium | Thai banks use registered sender IDs. Comparing the claimed sender against a reference list would catch impersonation that wording alone misses — but a pasted message does not carry the sender ID. |
| Mobile share-target app | Low | Would remove the copy-paste step by letting users share directly from LINE or Messages. |

### What must not be done

**Do not add patterns to make the `adversarial` suite pass.** That suite measures the ceiling of the method. Writing its cases into the library would recreate exactly the flaw this report identifies in the 86% figure, and would leave the tool no better against the scam that arrives next week.

---

## 9. Appendix — Reproducing and Updating This Report

### Regenerating every figure

```bash
npm test                 # v0.5 accuracy, per-suite results
npm run test:report      # writes tests/last-report.md with the confusion matrix
npm run compare          # v0.3 versus v0.5 on the same test set
```

`npm run compare` reads `tests/fixtures/v03-baseline.json`, which is v0.3's keyword list captured verbatim from the deployed page. It runs offline and gives the same numbers every time.

Library composition:

```bash
node -e "const p=require('./patterns.json');
const n=s=>({th:s.filter(x=>x.lang==='th').length,en:s.filter(x=>x.lang==='en').length});
console.log('scam',p.scam.length,n(p.scam),'legit',p.legit.length,n(p.legit),
            'risk',p.risk.length,'categories',Object.keys(p.categories).length)"
```

### Which sections to update, and when

| Section | Update when | Source |
|---|---|---|
| 1 — scale figures | patterns or code change | commands above |
| 4 — dataset composition | test cases added | `tests/testset.json` |
| 5 — all accuracy figures | any change to engine or patterns | `npm test`, `npm run compare` |
| 6 — community impact | after each field test | your own records — **not derivable from the repo** |
| 7 — reflection | after each phase | your own notes |
| 8 — future improvements | when an item ships | `README.md` § "ที่ยังไม่ได้ทำ" |

### Rules for reporting numbers in this project

1. **State the denominator.** "78.8% recall" means nothing without "over 56 cases across six independent suites, `regression_v03` excluded".
2. **Never quote a figure that includes `regression_v03`.** It scores 100% by construction — for v0.3 and v0.5 alike.
3. **Never drop `adversarial` to improve the headline.** It is included on purpose. Removing it would push recall to roughly 95% and make the figure worthless.
4. **Do not compare against the 2025 figure of 86%.** Different metric, different dataset, different number of classes. Compare v0.3 to v0.5 with `npm run compare` instead — that comparison is measured, identical in method, and reproducible.
5. **Report dangerous and soft errors separately, always.**
6. **Say which version.** Figures here describe **v0.5.0** at commit `436844f`, compared against **v0.3** at `ren3-dev-svg/chekMsg` commit `258f464`.
7. **Say which version was field-tested.** The 23 users tested v0.3.

### Checklist before submitting

- [ ] Every `[FILL IN: …]` resolved or deliberately removed
- [ ] `npm test` and `npm run compare` re-run; Section 5 matches the output
- [ ] Version numbers and commit hashes in Section 5 and Appendix updated
- [ ] Section 6 states clearly that the field test covered v0.3
- [ ] Quotes have permission and are attributed by role, not name
- [ ] Both repository links work and a reader can reproduce the figures

### Source material

| What | Where |
|---|---|
| Current code and full history | https://github.com/tharathep-dul/Check_Msg |
| The field-tested version, still live | https://ren3-dev-svg.github.io/chekMsg/ |
| Usage and testing guide | `docs/guide.md` |
| Contribution rules | `CONTRIBUTING.md` |
| Latest generated test report | `tests/last-report.md` |
| v0.3 baseline used for comparison | `tests/fixtures/v03-baseline.json` |
| Try it without installing | `dist/chekmsg-standalone.html` |
