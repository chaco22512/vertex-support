# Vertex Support — Staff Onboarding Training Deck (Outline)

*A slide-by-slide plan for the staff onboarding session. Build the actual slides from this. Each slide lists its **Title**, the **Key points** to show (with the Rulebook chapter they come from), and the **Visual** to place on the slide. Keep it visual and plain — the audience is CS staff, not engineers. Target length: 18 slides (~30–40 min with a short live demo).*

Source of truth: `docs/cs-staff-rulebook.md` (referenced as "Rulebook Ch.N"). Screenshots referenced here are the same placeholders marked in the Rulebook and Test Guide.

---

### Slide 1 — Title
- **Key points:** Vertex Support — Staff Onboarding. Presenter name, date. "You'll be testing our new support bot."
- **Visual:** Vertex horizontal logo on a plain background.

### Slide 2 — What we'll cover today
- **Key points:** The 7 things you'll leave knowing: what the bot is, what it answers, when it calls you, how to reply, (admins) how to edit rules, do & don'ts, where to get help.
- **Visual:** Simple 7-item agenda list.

### Slide 3 — What this bot is
- **Key points (Rulebook Ch.1):** A chat helper for our SIM customers in 5 languages; guides them with buttons; answers from approved rules; hands hard cases to you.
- **Visual:** 📷 Customer chat — language-selection screen.

### Slide 4 — What the customer experiences (the flow)
- **Key points (Rulebook Ch.1):** Language → Topic → Common question → AI answer → Solved / Still need help → (if needed) handed to staff.
- **Visual:** Left-to-right flow diagram of the 5 steps; below it, 📷 topic grid + 📷 an AI answer with Solved / Still need help.

### Slide 5 — The 10 topics
- **Key points (Rulebook Ch.1):** Show the 10 tiles; note that **Plans & prices** always goes to staff.
- **Visual:** 📷 Customer chat topic grid; highlight the "Plans & prices" tile.

### Slide 6 — What the AI ANSWERS
- **Key points (Rulebook Ch.2):** Only from our rules; may quote fixed fees **but always adds** "Final amount will be confirmed by our staff."; includes tutorial links; replies in the customer's language.
- **Visual:** Left half of the "answers / never answers" two-column table.

### Slide 7 — What the AI NEVER answers
- **Key points (Rulebook Ch.2):** Monthly plan prices, COD, discounts; account/billing status; complaints; carrying out cancellations; anything not in the rules; never names internal tools/people.
- **Visual:** Right half of the table, with a red "hands it to you" arrow.

### Slide 8 — The fee rule (memorize this)
- **Key points (Rulebook Ch.2):** Any time a fee is given, the sentence "Final amount will be confirmed by our staff." must be there — in the customer's language.
- **Visual:** 📷 A chat answer that shows a fee plus the "Final amount…" sentence, called out with an arrow.

### Slide 9 — When you get called
- **Key points (Rulebook Ch.3):** A Slack message arrives the moment a chat needs a human; reply within 24 hours; first offered to staff who speak the language.
- **Visual:** 📷 Slack channel escalation message, annotated (language / question / reason / Open link).

### Slide 10 — Reminders: ⚠️ and 🚨
- **Key points (Rulebook Ch.3):** ⚠️ = under 4 hours left. 🚨 = deadline passed. Act early on ⚠️.
- **Visual:** Two big badges ⚠️ / 🚨 with one-line meanings.

### Slide 11 — The Inbox
- **Key points (Rulebook Ch.4):** Most urgent at the top; columns (Category, Question, Lang, Due); colored bar = unread; keyboard j/k/Enter/e/?.
- **Visual:** 📷 Admin Inbox with the Due column and an unread row.

### Slide 12 — Replying, step by step
- **Key points (Rulebook Ch.4):** Open chat → **Translate** to read → **AI draft** to start → **edit** → **Send**. Draft saves itself.
- **Visual:** 📷 Conversation reply box (AI draft / Templates / Send); number the steps 1–4 on the image.

### Slide 13 — The golden rule of AI draft
- **Key points (Rulebook Ch.4 & Ch.6):** AI draft is a starting point only. **Always edit before Send.** It can never send by itself.
- **Visual:** Big "Edit before Send" callout over 📷 the AI draft in the reply box.

### Slide 14 — Finishing: Resolve & Undo
- **Key points (Rulebook Ch.4):** Click **Resolve** when done; a 5-second **Undo** appears; you can **Reopen** later.
- **Visual:** 📷 Conversation just after Resolve, with the 5-second Undo showing.

### Slide 15 — (Admins) Editing rules and fees
- **Key points (Rulebook Ch.5):** Knowledge → edit → **Save rule**; "Changes apply to AI instantly."; disable, don't delete; every change is logged.
- **Visual:** 📷 Rule edit box with the fee field and the "Changes apply to AI instantly." note.

### Slide 16 — (Admins) The Review queue
- **Key points (Rulebook Ch.5):** 42 rules waiting — tab A (2) and tab B (40); Approve as-is / Edit & approve / Keep internal / Disable / Split; approve many at once.
- **Visual:** 📷 Review queue showing tab A (2) and B (40) with the action buttons.

### Slide 17 — Do & Don't
- **Key points (Rulebook Ch.6):** Do: edit drafts, report wrong answers with the rule ID, reply in time, plain language. Don't: send drafts unedited, state prices, use internal words with customers, delete rules.
- **Visual:** The Do/Don't two-column table (green Do / red Don't).

### Slide 18 — Testing & getting help
- **Key points (Rulebook Ch.7 + Test Guide):** How to run scenarios and tick results; keep the test link private; report issues in #cs-bot-feedback with the template (date / link / question / AI answer / expected / rule ID); when unsure, escalate or ask an admin.
- **Visual:** 📷 The report template block; small thumbnail of the Test Guide checklist.
