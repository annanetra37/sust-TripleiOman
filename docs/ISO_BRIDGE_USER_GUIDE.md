# ISO Bridge — User Guide

*For the **ISO Bridge** page (sidebar → ISO Bridge). Written for people who are new to ISO — every section ends with an ELI5 (Explain Like I'm 5).*

---

## What is the ISO Bridge, in one paragraph?

If your company is ISO-certified (14001, 45001, 50001…), your team has already written hundreds of pages of documentation for auditors: registers, training logs, incident lists, meeting minutes. A large part of what ESG reporting standards (GRI, ESRS) ask for is *already answered* in those documents — just written for a different audience. The ISO Bridge reads your ISO documents, figures out which ESG report questions they answer, drafts the answers with a reference back to the exact source document, lets a human approve them, and puts the approved text into your generated reports. It also works backwards: it can package the ESG data you already have in the platform as evidence for your ISO 14001:2026 transition audit.

> **ELI5:** You already did your homework once, for one teacher (the ISO auditor). A different teacher (ESG reporting) is now asking mostly the same questions. The Bridge copies the right answers from your old homework into the new one — showing exactly which page it copied from — and a grown-up checks every answer before it's handed in.

### The two golden rules (you'll see these as a blue banner on the page)

1. **Everything the Bridge writes is a DRAFT.** A human must read and approve it before it appears in any report. Nothing is ever published automatically.
2. **The Bridge never certifies anything.** Only an accredited auditor can sign an ISO certificate. The reverse-bridge output is *evidence* for your audit, not the audit itself.

> **ELI5:** The Bridge is a very fast assistant, not the boss. It writes suggestions; you sign off. And it can help you *prepare* for a test, but it can never *grade* the test — only the real examiner (the auditor) can.

---

## Key concepts (read this first if ISO is new to you)

| Term | What it means |
|---|---|
| **ISO certificate** | A one-page attestation from a certification body saying "this company runs its environment/safety/energy management properly." The page itself contains almost no data — the value is in the documents underneath it. |
| **Certification body (CB)** | The firm that audits you and issues the certificate (TÜV, DNV, SGS, BSI…). ISO itself certifies nobody. |
| **Accreditation** | The CB itself being approved by a national authority (DAkkS, UKAS…). A certificate *without* an accreditation mark is often rejected by big customers' procurement teams. |
| **Standard & edition** | "ISO 14001:2015" = standard 14001, edition 2015. The edition matters a lot: ISO 14001 was re-published in 2026 and every 2015 certificate must transition by ~May 2029. |
| **Clause** | A numbered section of an ISO standard (e.g. clause 6.1.2 = "aspects & impacts"). Think of it as a chapter number. |
| **Documented information** | The registers, logs, and minutes ISO requires you to maintain: aspects register, compliance register, incident register, energy review, management review minutes… This is where the reportable content lives. |
| **Disclosure** | One numbered question an ESG standard asks (e.g. GRI 403-9 = "how many work injuries did you have?"). A report is basically a stack of answered disclosures. |
| **Crosswalk** | The Bridge's mapping table: "ISO clause X answers ESG disclosure Y." This is the intelligence of the module. |
| **Provenance** | The paper trail: every drafted sentence can be traced to the source ISO clause and file it came from. |

> **ELI5:** The certificate is like a diploma on the wall — impressive but just one page. The real knowledge is in the notebooks you filled to earn it. A "disclosure" is one question on the ESG exam. The "crosswalk" is a cheat-sheet that says which notebook page answers which exam question. "Provenance" means every answer has a sticky note saying which notebook it came from.

---

## The five tabs

The page has five tabs: **Certificates · Evidence · Coverage · Draft Review · 14001:2026 Transition**. Use them roughly left to right.

---

### Tab 1 — Certificates

**What it's for:** registering which ISO certificates your company holds. Certificates are the "keys" — they decide which mappings the Bridge is allowed to use for you.

**Pieces and buttons:**

- **Upload a certificate (drop zone)** — drop the certificate PDF (or photo/scan). Click anywhere in the dashed box to browse.
- **Extraction cost** — appears after you pick a file: shows how many credits the AI extraction will cost *before* you commit.
- **"Extract certificate metadata with AI" button** — sends the PDF to the AI, which reads out: standard, edition, certificate number, certification body, accreditation mark, scope, sites, issue/expiry/surveillance dates. Creates one certificate card.
- **Certificate cards** — one per certificate, showing a badge like `ISO 45001:2018`, the CB, the scope, and dates. Two special badges:
  - **Green "Accredited" badge** — an accreditation mark was found. Good.
  - **Red "Unaccredited — low trust" badge** — no accreditation mark was detected. Worth checking: unaccredited certificates are often rejected by OEM procurement.
- **Yellow "edition could not be read" strip with `2015` / `2026` buttons** — if the AI couldn't read the edition from the PDF, it refuses to guess (the edition changes which crosswalk mappings apply). Click the correct year to set it yourself.
- **Renewal & surveillance calendar** — every certificate's expiry date and next surveillance-audit date, soonest first. Overdue dates turn red.

> **ELI5:** This tab is your trophy shelf. You photograph each trophy (upload the PDF), and a robot reads the engraving for you (who gave it, when it expires). If the engraving is too blurry to read the year, the robot asks *you* instead of guessing — because the year decides which cheat-sheet it may use later. The calendar is a reminder list so no trophy quietly expires.

---

### Tab 2 — Evidence

**What it's for:** uploading the documents *underneath* the certificates — the actual content the AI will draft from. The certificate opens the door; the evidence is what walks through it.

**Pieces and buttons:**

- **Document type dropdown** — tell the Bridge what kind of document you're uploading: aspects & impacts register, compliance obligations register, incident register, energy review, management review minutes, training records, policy document, etc. Picking the right type matters — it tells the AI what structure to look for.
- **Linked certificate dropdown (optional)** — attach the document to one of your certificates, for tidier provenance.
- **Drop zone** — accepts PDF, image, or spreadsheet (.xlsx/.csv). **Any language** — a German aspects register or an Arabic incident log is fine; the AI translates as it extracts.
- **Ingestion cost** — credit estimate, shown before you commit.
- **"Ingest with AI" button** — the AI reads the document and stores its content in structured form, with a pointer to the source file and page/section.
- **Evidence library table** — everything you've ingested: type, source file, location (which pages/sheets), language, date.

**What should I upload?** The highest-value documents, in rough order:
1. **Aspects & impacts register** (14001, clause 6.1.2) — effectively your materiality analysis; the crown-jewel document.
2. **Incident register** (45001) — feeds injury numbers directly into GRI 403-9.
3. **Energy review** (50001) — feeds energy figures into GRI 302 / ESRS E1-5.
4. Management review minutes, compliance register, objectives & targets, policies, training records.

> **ELI5:** The trophy says you did the work; this tab is where you hand over the actual notebooks. You tell the robot "this notebook is my accident diary" or "this one is my electricity diary" so it knows how to read it. The robot doesn't care what language the notebook is in. Everything it reads gets filed with a bookmark saying exactly which notebook and page it came from.

---

### Tab 3 — Coverage

**What it's for:** the big picture — "given my certificates, how much of an ESG report can the Bridge fill in, and what's still missing?" This costs **no credits** — check it as often as you like.

**Pieces and buttons:**

- **Standard selector (GRI / ESRS / TCFD / ISSB)** — pick which reporting standard to measure against.
- **Coverage score** — a single percentage summarizing how much of the required disclosures your ISO evidence can feed.
- **Three counters** — every required disclosure is in exactly one state:
  - 🟢 **Populated from ISO** — a crosswalk mapping fully covers it.
  - 🟡 **Partially from ISO** — ISO gives you part of the answer (e.g. OH&S training hours are only *part* of total training hours).
  - ⚪ **Not available from ISO** — ISO documentation simply doesn't contain this (e.g. gender pay gap).
- **Per-disclosure list** — click any row to expand it and see *which* ISO clause covers it (e.g. "ISO 45001 · clause 6.1.2 — Hazard identification & risk assessment").
- **"Draft from ISO evidence" button** — appears inside expanded rows for narrative disclosures that ISO covers. Clicking it generates a draft (costs credits) and puts it in the Draft Review tab.
- **Gap-to-action list** — the honest flip side: every disclosure ISO can't feed, each with a recommended next step in the platform ("Upload workforce data in S1", "Upload board data in Governance"…). This doubles as your onboarding to-do list.
- **Yellow "pending sign-off" banner** — the crosswalk mapping is awaiting approval by the Head of Sustainability; until then, treat output as internal-review material.

> **ELI5:** Imagine the ESG report is a 100-question exam. This tab holds your cheat-sheet against the exam and says: "your notebooks fully answer 40 questions (green), half-answer 15 (yellow), and 45 aren't in your notebooks at all (grey) — here's where to get those." The green ones have a magic button that writes the answer for you. Checking the tally is free; writing answers costs tokens.

---

### Tab 4 — Draft Review

**What it's for:** the human-in-the-loop checkpoint. Every AI draft lands here and goes nowhere until a person decides.

**Pieces and buttons:**

- **Draft card** — one per generated draft, showing:
  - the **disclosure code** (e.g. GRI 403-1), standard and year;
  - a **status badge**: 🟡 DRAFT (waiting for you), 🟢 APPROVED, 🔴 REJECTED;
  - a **confidence %** — how sure the AI is that the evidence supports the text;
  - tiny **model/prompt version** text — the audit trail of exactly which AI version wrote it.
- **Editable text box** — while a draft is in DRAFT status you can edit the text directly. Your edited version is what gets used.
- **Provenance box** — the citations: which ISO clause, which uploaded file, which pages the content came from. A draft without sources is impossible — the engine refuses to save one.
- **"Approve for reports" button** — marks the draft APPROVED. From that moment, when someone generates a report for that standard + year, this text automatically replaces the grey "[To be completed…]" placeholder for that disclosure — with a source line underneath.
- **"Reject" button** — marks it REJECTED; it will never appear anywhere. You can always generate a fresh draft later.

Who clicked what, and when, is recorded in the Activity Log.

> **ELI5:** The robot writes with a pencil, never a pen. Every answer it writes sits in a tray on your desk with sticky notes showing where it copied from. You read it, fix anything you don't like, then either stamp it "OK" (it goes into the real report, with the sticky note still attached) or throw it away. Nothing leaves the tray without your stamp, and the school keeps a list of every stamp you made.

---

### Tab 5 — 14001:2026 Transition (the "reverse bridge")

**What it's for:** the opposite direction. ISO 14001 got a new 2026 edition, and every 2015 certificate must transition by ~May 2029. The new edition demands that your EMS context analysis covers four new themes — **climate, biodiversity, resource availability, life-cycle** — which is exactly the data you already collected in this platform for ESG. This tab packages that data as paste-ready EMS documentation.

**Pieces and buttons:**

- **Amber disclaimer banner** — always on top: the pack *supports* a transition audit; it does not certify anything. The same disclaimer travels inside every generated pack.
- **Four theme cards** (🌡️ climate, 🌿 biodiversity, ⛏️ resource, 🔄 life-cycle) — each shows which 14001:2026 clauses it targets (4.1 / 4.2 / 6.1.2) and which platform data it needs (e.g. climate needs your E1 emissions data). If you have no data for a theme, generation politely fails and tells you what to upload first.
- **"Generate evidence pack" button** — builds the pack from your platform data (costs credits).
- **Generated evidence packs list** — click a pack to expand it. Inside are **content blocks**, each tagged with its target clause (e.g. `14001:2026 · 4.1`), a type (**context** entry or **aspect row**), the drafted text, and "based on" references to the data used. Copy-paste these into your EMS documentation, then review them with your ISO consultant/auditor.

> **ELI5:** Your old swimming badge (14001:2015) expires soon, and the new badge test (2026) has four new questions about climate, nature, materials, and product life. Good news: you already wrote those answers in this app, just in a different folder. This tab photocopies them into the format the swimming teacher expects — with a big red stamp on every page saying "this helps you prepare; it is not the badge itself."

---

## How to use the whole thing — the recommended first run

The cleanest end-to-end path (also the most impressive demo) is **ISO 45001 → GRI 403**, because a 45001-certified company has already written essentially all of GRI 403-1 through 403-8:

1. **Certificates tab** → upload your ISO 45001 certificate PDF → check the card (fix the edition if flagged).
2. **Evidence tab** → upload your incident register (type: *Incident register*) and a couple of OH&S documents (hazard/risk assessment, training records, worker-participation/committee docs).
3. **Coverage tab** → select **GRI** → watch GRI 403-x rows turn green → expand GRI 403-1 → click **"Draft from ISO evidence"**. Repeat for the other green 403 rows.
4. **Draft Review tab** → read each draft, check the provenance box, edit if needed → **Approve for reports**.
5. **Reports module** (sidebar → Reports) → generate a GRI report for the same year → the 403 sections now contain your approved, cited text instead of "[To be completed…]".
6. When you're ready for the 2026 transition work: **14001:2026 Transition tab** → generate the climate pack (needs E1 emissions data in the platform).

> **ELI5:** ① Show your safety diploma. ② Hand over your accident diary and safety notebooks. ③ See which exam questions they answer, and press the magic write-it button. ④ Read, fix, stamp. ⑤ Print the exam — your stamped answers are in it. ⑥ Later, run the photocopier for the new swimming-badge test.

---

## Credits & access

| Action | Cost |
|---|---|
| Checking coverage / gap list | **Free** — pure math, no AI call |
| Certificate extraction | Credits per certificate (shown before you upload) |
| Evidence ingestion | Credits per document (shown before you upload) |
| Drafting a disclosure | Credits per draft — charged on generation, not on review |
| Reverse-bridge pack | Credits per theme pack |

The Bridge is an **Enterprise-included** capability (add-on for lower tiers). Without the entitlement, the API refuses with a hard error and the page shows only a limited coverage teaser — buying more credits does *not* unlock it; entitlement and credits are separate.

> **ELI5:** Looking at the map is free. Asking the robot to read or write costs tokens from your jar — and it always tells you the price before you say yes. But the room itself needs a key card (your plan); no amount of tokens opens the door without the card.

---

## What the Bridge will NOT do (on purpose)

- It will **not** issue, renew, or influence an ISO certificate — ever.
- It will **not** put anything into a report without a human approving it first.
- It will **not** invent content: a draft with no evidence behind it is rejected by the engine itself.
- It will **not** replace your double-materiality assessment — the aspects register is an *input* to it, not a substitute.
- It does **not** connect directly to certification-body systems (they don't offer such APIs).

> **ELI5:** The robot can copy from your notebooks and show its work — but it can't take the exam for you, can't award you the badge, and can't make up answers when the notebook page is blank.

---

*Note: the "ISO → GRI Bridge" item also visible in the sidebar is a different, older tool — a data-record readiness check. This guide covers the **ISO Bridge** page only.*
