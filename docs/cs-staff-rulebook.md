# SIM Point Support — CS Staff Rulebook

*For the customer-support team. This is the bot you will be testing. You do not need any technical background to read this — everything is described by the buttons you see on screen and the steps you take.*

**Contents**

1. What this bot is
2. What the AI answers / never answers
3. When you get called (escalations)
4. How to reply
5. How to edit rules and fees (for admins)
6. Do & Don't
7. FAQ for staff

---

## 1. What this bot is

**Key points**
- A chat helper for our SIM customers (foreign residents in Japan) in 5 languages.
- It guides the customer with buttons and questions, then answers from our approved rules.
- When it can't or shouldn't answer, it hands the conversation to you.

SIM Point Support is a chat window on our website. A customer opens it and is guided step by step — they rarely type at first. The flow is:

1. **Pick a language** — English, Bahasa Indonesia, Tagalog, Nepali, or Vietnamese.
2. **Pick a topic** — a grid of tiles: *Internet not working / APN setup, Payment & monthly bill, Lost SIM or device, Cancellation, Returning SIM / device, Replacement / change plan, Signal stopped / re-issue, Refund / deposit / cashback, Pension & tax refund (Nenkin), Plans & prices, Others.*
3. **Pick a common question** (or choose *Something else* to type freely).
4. **Read the AI answer.** The customer then taps **Solved** or **Still need help**.
5. If they still need help — or the topic is one the AI must not handle — the chat is handed to our team and the customer leaves a contact email.

> 📷 [SCREENSHOT — Customer chat, language-selection screen (the first full screen with the 5 language buttons).]

> 📷 [SCREENSHOT — Customer chat, topic grid showing the 11 category tiles.]

> 📷 [SCREENSHOT — Customer chat, one AI answer with the **Solved** / **Still need help** buttons visible.]

The bot answers using a fixed set of company rules. It cannot make things up, and there are topics it will always pass to a human. Chapter 2 explains exactly where that line is.

---

## 2. What the AI answers / never answers

**Key points**
- The AI answers only from our approved rules, in the customer's language.
- It may quote fixed fees, but always adds "Final amount will be confirmed by our staff."
- Money plans, discounts, personal account issues, and complaints always go to a human.

This is the most important chapter. The table below is exactly how the bot is set up to behave.

| The AI **answers** these | The AI **never answers** these (it hands them to you) |
|---|---|
| Questions covered by our written rules (for example: how to set up APN, what to do for a lost SIM, how returns work). | **Monthly plan prices.** It will not state them. |
| **Fixed fees** that are written in the rules (for example a re-issue fee). Whenever it gives a fee, it also adds a sentence meaning **"Final amount will be confirmed by our staff."** | **COD (cash-on-delivery) prices** and **discount amounts.** It will not state them. |
| A **tutorial link** when the rule has one. | **Billing disputes, refunds in progress, or anything about one customer's own account or bill status.** |
| Replies in the **customer's own language**, in short, plain sentences. | **Complaints.** |
| — | **Carrying out a cancellation**, or anything **not covered by our rules.** |
| — | It never mentions internal tools or people (staff names, Slack, Kintone, "AR", internal links). |

**How a fee answer should look.** If a customer asks about a re-issue fee, a correct answer names the fixed fee from the rules **and** adds, in the customer's language, "Final amount will be confirmed by our staff." If you ever see a fee without that sentence, report it (see Chapter 6).

**What happens when the AI won't answer.** The bot marks the chat as needing a human and records a short reason. You will see one of these reasons on the conversation:

| Reason you may see | Plain meaning |
|---|---|
| `price_question` | The customer asked about plan price, COD, or a discount. |
| `not_in_manual` | The question isn't covered by our rules. |
| `account_specific` | It's about that one customer's account, bill, or refund status. |
| `complaint` | The customer is making a complaint. |
| `other` | Anything else the bot decided a human should handle. |

> 📷 [SCREENSHOT — Conversation detail where the AI has escalated a price question; show the message thread with the reason visible.]

**Special case — "Plans & prices" tile.** If the customer taps the *Plans & prices* topic, the bot does **not** try to answer. It shows a fixed message that our staff will help with plans, and hands the chat to a human right away.

---

## 3. When you get called (escalations)

**Key points**
- You get a Slack message the moment a chat needs a human.
- Reply within 24 hours; the system reminds you as the deadline gets close (⚠️) or passes (🚨).
- Chats are offered first to staff who speak the customer's language.

**When a Slack message arrives.** The team channel receives a message as soon as a conversation is handed to humans — either the customer tapped **Still need help**, left their contact, or asked something the AI must not answer.

**What the Slack message shows.** The channel/source, the customer's language, their question, the reason, who it's assigned to, and a link that opens the conversation.

> 📷 [SCREENSHOT — The Slack channel showing one escalation message in the standard format (emoji, language, question, reason, "Open conversation" link).]

**The 24-hour promise.** Every escalation should get a staff reply within 24 hours.

**Reminders.**
- **⚠️** means the deadline is less than 4 hours away — reply soon.
- **🚨** means the deadline has passed — reply now.

**Who gets it.** The system offers a chat first to staff who are active and who speak the customer's language, choosing whoever currently has the fewest open chats. If nobody matches, it is left unassigned and the whole team is notified.

---

## 4. How to reply

**Key points**
- Open the conversation from **Inbox**; the most urgent ones are at the top.
- Use **Translate** to read other languages; use **AI draft** to start a reply — but always edit it before **Send**.
- **Resolve** when done; you get 5 seconds to **Undo**.

**Sign in.** Open the admin address and sign in with your email and password on the **Sign in** screen.

> 📷 [SCREENSHOT — Admin **Sign in** screen with the logo and the email/password fields.]

**Read the Inbox.** The **Inbox** opens with the chats that need action at the top (soonest deadline first). Columns:

| Column | What it shows |
|---|---|
| Source | Where the chat came from |
| Category | The topic the customer picked |
| Question | The first line of their question |
| Lang | The customer's language |
| Answered by | AI, or the staff name |
| Status | Where the chat is (for example *Escalated*) |
| Due | Time left to reply (red when under 4 hours) |

A thick colored bar on the left marks chats you haven't opened yet.

> 📷 [SCREENSHOT — Admin **Inbox** with several rows, the **Due** column, and at least one unread (colored bar) row.]

**Keyboard shortcuts** (optional, for speed): **j / k** move down / up, **Enter** opens a chat, **e** marks it resolved, **?** shows the shortcut help.

**Open a conversation.** Click a row (or press **Enter**). You'll see the whole conversation.

**Translate.** Turn on the **Translate** toggle to show an English translation under each customer message. Use it for languages you don't read.

> 📷 [SCREENSHOT — Conversation detail with **Translate** turned on, English shown under a non-English customer message.]

**Write the reply.**
- **AI draft** — click it to put a suggested reply in the reply box. **You must read and edit it before sending.** It can never send by itself.
- **Templates** — insert a common greeting or closing in the customer's language.
- Your draft **saves by itself** every few seconds, so it won't be lost if you reload.
- Click **Send** to send your reply. The customer sees it in their chat, and if they left an email, they get an email that our team has replied.

> 📷 [SCREENSHOT — Conversation detail reply box showing the **AI draft**, **Templates**, and **Send** buttons.]

**Finish the chat.** Click **Resolve** when the customer is helped. There's no confirmation pop-up — instead a short **Undo** appears for **5 seconds** in case you clicked it by mistake. You can also **Reopen** a chat or change who it's assigned to.

> 📷 [SCREENSHOT — Conversation detail just after clicking **Resolve**, with the 5-second **Undo** message showing.]

---

## 5. How to edit rules and fees (for admins)

**Key points**
- Rule and fee edits take effect for the AI immediately.
- Every change is recorded in the change history.
- The Review queue holds 267 rules waiting for a yes/no; you can approve many at once.

*This chapter is for staff with admin access (the **Knowledge**, **Review queue**, **Staff**, and **Change history** menus). Regular staff won't see these.*

**Find a rule.** Open **Knowledge** and type in the search box; the list narrows as you type. You can also pick a category on the side.

> 📷 [SCREENSHOT — **Knowledge** page: category list on the side, search box, and the rule list.]

**Edit a rule or fee.** Click a rule to open its edit box. You can change the wording, the fee amounts, links, who it's for, and whether the AI may use it. Click **Save rule**. A note in the box reminds you: **"Changes apply to AI instantly."** So the very next customer question is answered with your new wording or fee.

> 📷 [SCREENSHOT — The rule edit box showing the fee field, the "Changes apply to AI instantly." note, and the **Save rule** button.]

**Never delete — disable.** To stop using a rule, set its status to **Disabled** rather than removing it, so it can be brought back.

**See what changed.** **Change history** lists who changed which rule and when. Fee changes are shown as old → new (the old amount is struck through).

> 📷 [SCREENSHOT — **Change history** showing a fee change with the old amount struck through and the new amount highlighted.]

**Work the Review queue.** **Review queue** holds **267** rules waiting for a decision (after the second, per-plan manual was added), split into four tabs:
- **A — Strikethrough removal (4):** confirm the current wording after struck-out text was removed.
- **B — Internal classification (103):** confirm rules that were auto-marked as internal.
- **C — Price exposure / COD & discount (115):** rules that mention a COD price or discount amount. Because the AI must **never** state prices or discounts, don't approve these for customers — **Keep internal** or **Disable** them.
- **D — "Don't use yet" sheet (45):** rules from an old sheet marked not-in-use. Usually **Disable**.

For each rule you can: **Approve as-is**, **Edit & approve**, **Keep internal**, or **Disable**. You can tick several and **Approve** them together. For a B rule that mixes customer and internal wording, use **Split** to save the customer half and the internal half separately. When the queue reaches zero you'll see "Review queue is clear."

> 📷 [SCREENSHOT — **Review queue** showing tabs **A (4)**, **B (103)**, **C (115)**, **D (45)**, with the per-row action buttons.]

---

## 6. Do & Don't

**Key points**
- Always edit an AI draft before sending; never send it as-is.
- Keep customer language simple; never use internal words with customers.
- When the AI is wrong, note the rule ID and report it.

| Do | Don't |
|---|---|
| Read and edit every **AI draft** before you **Send** it. | Don't send an AI draft without editing it. |
| When you spot a wrong AI answer, note the **rule ID** shown on the message and report it. | Don't quietly fix a wrong answer and move on — it will keep happening until the rule is fixed. |
| Reply within **24 hours**; act on **⚠️** and **🚨** reminders. | Don't ignore a reminder or let a chat pass its deadline without a word. |
| Use plain, simple words in the customer's language. | Don't use internal words with customers (for example "AR", "Kintone", system names). |
| Let the bot handle prices by escalating — help the customer through chat. | Don't tell a customer a monthly plan price, COD price, or discount amount. |
| Use **Translate** when you can't read the customer's language. | Don't guess at a message you can't read. |
| Set a rule to **Disabled** when it shouldn't be used. | Don't try to permanently delete rules. |

---

## 7. FAQ for staff

**Key points**
- Most worries (wrong answers, other languages, deadlines) have a simple, safe step.
- When unsure, escalate or ask an admin — never invent an answer for the customer.

**1. The AI gave a wrong answer. What do I do?**
Note the **rule ID** shown under the AI message and report it using the template in the Test Guide. If a customer is waiting, reply yourself with the correct information.

**2. A customer wrote in Japanese (or another language I don't read). How do I understand them?**
Turn on the **Translate** toggle in the conversation to see an English translation under each customer message.

**3. I can't reply before the 24-hour deadline. What should I do?**
Reply with a short holding message and reassign or flag it to a teammate who can continue. Acting on the **⚠️** reminder early prevents this.

**4. The customer is asking for a monthly price or a discount. Can I tell them?**
No. Prices, COD, and discounts are always handled by staff through conversation, not stated as fixed numbers by the bot. Help them in your reply and, if needed, keep the chat with the team.

**5. When I give a fee, do I need to add anything?**
Yes. Whenever a fee is mentioned, add a sentence meaning "Final amount will be confirmed by our staff." in the customer's language.

**6. What does the colored bar on the left of an Inbox row mean?**
It marks a chat you (the team) haven't opened yet — an unread escalation.

**7. What's the difference between ⚠️ and 🚨?**
⚠️ = the reply deadline is less than 4 hours away. 🚨 = the deadline has already passed.

**8. I clicked Resolve by mistake. Can I undo it?**
Yes. A short **Undo** appears for **5 seconds** right after you click **Resolve**. You can also **Reopen** the chat later.

**9. Will the customer get my reply if they closed the chat?**
Yes — if they left an email, they receive an email that our team replied, with a link back to their chat.

**10. I changed a fee in Knowledge. When does it take effect for the AI?**
Immediately. The note "Changes apply to AI instantly." means the next customer question uses your new amount.

**11. The admin page is blank / I signed in but nothing happened. What do I do?**
Reload the page and open the address again. If it still doesn't work, note the time and tell the team — this is exactly the kind of issue the pilot test is meant to catch (see the Test Guide).

**12. Can I edit rules or add staff?**
Only if you have admin access. If you don't see **Knowledge**, **Review queue**, or **Staff** in the menu, ask an admin.
