# Vertex Support — Test Guide

*A step-by-step test plan you can run without any technical background. Work through the scenarios, tick the box, and write what you saw. If anything looks wrong, fill in the report template at the end.*

**Contents**

1. Before you start
2. How to run a scenario
3. Scenario checklist (main features)
4. Re-check list (issues found earlier)
5. Language coverage (who tests what)
6. How to report a problem or a wrong answer
7. Rules during the test period
8. Sign-off (Rulebook-only test)

---

## 1. Before you start

**You will use two things:**
- The **customer chat** — the chat window a customer uses. (Test link will be shared privately.)
- The **admin pages** — where staff read and reply. Sign in with the email and password you were given.

Have the **Rulebook** open next to you. Have the team's Slack channel open so you can see notifications.

---

## 2. How to run a scenario

Each row of the checklist has **Steps** (what to do) and **Expected result** (what should happen). Do the steps, compare with the expected result, then:
- Tick **Pass** if it matched, or **Fail** if it didn't.
- In **Notes**, write anything odd (wrong wording, wrong language, slow, blank screen…). For a wrong answer, also copy the **rule ID** shown under the AI message.

---

## 3. Scenario checklist (main features)

> 📷 [SCREENSHOT — Optional: the customer chat topic grid, to help testers recognize the tiles named below.]

| # | Steps | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| 1 | In the chat, pick **Bahasa Indonesia**, topic **Internet not working / APN setup**, then ask how to set up APN. | Answer is in Indonesian and includes a tutorial link card. | ☐ P ☐ F | |
| 2 | Pick **English**, topic **Plans & prices** area, and ask "How much is the 30GB monthly plan?" | No price is given. The chat is handed to staff, and the team's Slack channel gets a new escalation marked as a **price question**. | ☐ P ☐ F | |
| 3 | Pick a language, topic **Lost SIM or device**, ask about the lost-SIM fee. | The fixed fee is shown **and** a sentence meaning "Final amount will be confirmed by our staff." appears in your language. | ☐ P ☐ F | |
| 4 | *(Admin)* In **Knowledge**, change a re-issue fee from **4,000** to **4,500** and **Save rule**. Then ask the same fee question in the chat. | The new amount (4,500) is used in the very next answer, and the edit appears in **Change history**. | ☐ P ☐ F | |
| 5 | Ask several normal questions across topics. | No internal words or internal links ever appear (no "AR", "Kintone", staff names, system links). The 42 "waiting for review" rules are not used in answers. | ☐ P ☐ F | |
| 6 | Escalate a chat and leave a contact email. Reply to it from the admin pages. Then reopen the customer chat link. | The customer sees your reply, an email is sent that the team replied, and reopening shows an "Our team replied" banner. | ☐ P ☐ F | |
| 6-note | *(About the email part of #6.)* | **During the pilot, the reply email can only be received at one specific address** — the mailbox that owns our email-sending account. Test the email step using that address; the in-chat reply and the "Our team replied" banner work for everyone. Sending from our own branded address is set up before the public launch. | ☐ P ☐ F | |
| 7 | Sign in as a **staff** (non-admin) account. Look at the menu. | There is **no** way to reach **Knowledge** or **Staff** management. | ☐ P ☐ F | |
| 8 | Send many chat messages quickly, one after another. | After about ten in a row, the chat asks you to slow down (rate limit). | ☐ P ☐ F | |
| 9 | Open the customer chat on a phone on mobile data. | It opens and is usable within a couple of seconds. *(Exact speed score is measured with a tool at deployment.)* | ☐ P ☐ F | |
| 10 | Send a message and watch closely. | Your message shows immediately, a "typing" indicator appears, and if no answer comes within ~15 seconds it is handed to staff automatically. | ☐ P ☐ F | |
| 11 | Turn on airplane mode, try to send, then turn airplane mode off. | A thin "You're offline" banner appears while offline, and the message sends by itself when you're back online. | ☐ P ☐ F | |
| 12 | *(Admin)* Using only the keyboard in **Inbox**: **j/k** to move, **Enter** to open, type a reply, **Send**. | You can go from Inbox to a sent reply without the mouse. | ☐ P ☐ F | |
| 13 | Click the **Open conversation** link in a Slack escalation (already signed in). | The exact conversation opens, and you can send a reply within about three clicks. | ☐ P ☐ F | |
| 14 | Read a **Nepali** answer and a **Vietnamese** answer, in the chat and in the admin pages. | Nepali (Devanagari) letters and Vietnamese accent marks display correctly, not as boxes or broken marks. | ☐ P ☐ F | |
| 15 | *(Admin)* Open a non-English conversation and turn on **Translate**. | An English translation appears under each customer message. | ☐ P ☐ F | |
| 16 | *(Admin)* In a conversation, click **AI draft**. | A suggested reply appears in the reply box. It is **not** sent automatically — you must edit and click **Send** yourself. | ☐ P ☐ F | |
| 17 | *(Admin)* Click **Resolve** on a conversation, then click **Undo** within 5 seconds. | The conversation goes back to its previous state. | ☐ P ☐ F | |
| 18 | Look at the chat header and the main buttons. | The logo mark shows in the header/avatar, main buttons use the same brand red, and where an error and a main button appear together they are clearly different. | ☐ P ☐ F | |
| 19 | Open the chat as a brand-new visitor. | No typing box at first — you choose a language, then a topic, in that order. | ☐ P ☐ F | |
| 20 | Pick **Lost SIM or device**, then tap the ready-made question **I lost my SIM card**. | The answer is based on the lost-item rules (the rule ID under the message starts with a lost-item rule). | ☐ P ☐ F | |
| 21 | Pick the **Plans & prices** tile. | The bot does **not** try to answer — an escalation card appears at once, and Slack gets a **price question** escalation. | ☐ P ☐ F | |
| 22 | Pick **Others** and type a free question. | A typing box opens and the answer may draw on rules from any topic. | ☐ P ☐ F | |
| 23 | *(Admin)* Look at the **Inbox** and open a conversation. | Inbox has a **Category** column, and inside the conversation there is a "Topic: …" line showing what the customer picked. | ☐ P ☐ F | |

---

## 4. Re-check list (issues found earlier)

*These are real problems that were found and fixed during earlier testing. Please confirm they do **not** come back.*

| # | Steps | Expected result | Pass / Fail | Notes |
|---|---|---|---|---|
| R1 | Open the admin pages and sign in. | The page is **never blank/white** — you always see the sign-in screen and then the pages. | ☐ P ☐ F | |
| R2 | Enter your email and password and sign in. | After signing in you are taken to the Dashboard/Inbox. It does **not** just sit on the sign-in screen doing nothing. | ☐ P ☐ F | |
| R3 | Open the admin pages using the **localhost** address, then again using the **127.0.0.1** address. | Both addresses open and let you sign in. | ☐ P ☐ F | |
| R4 | Use the customer chat with a normal, working connection. | The "You're offline" banner does **not** show while you are actually online. | ☐ P ☐ F | |
| R5 | Send a normal question in the chat (for example a lost-SIM question). | A real AI answer comes back. It does **not** jump straight to "handed to staff" for a normal, answerable question. | ☐ P ☐ F | |
| R6 | *(Admin)* Open the **Review queue** and read the two tab counts. | Tab **A** shows **2** and tab **B** shows **40** (42 total). | ☐ P ☐ F | |

---

## 5. Language coverage (who tests what)

We support **English, Bahasa Indonesia, Tagalog, Nepali, Vietnamese**.

- Each language should be tested by a **native speaker** of that language.
- Each native speaker runs **at least 5 scenarios** from Section 3 **in their own language**, and always includes scenario **14** (letters display correctly).
- Note in your results which language you tested in.

| Language | Tester name | Scenarios run (min 5) | Done |
|---|---|---|---|
| English | | | ☐ |
| Bahasa Indonesia | | | ☐ |
| Tagalog | | | ☐ |
| Nepali | | | ☐ |
| Vietnamese | | | ☐ |

---

## 6. How to report a problem or a wrong answer

Post one message per issue in **#cs-bot-feedback** (channel name to be confirmed), using this template:

```
Date/time:
Conversation link (if any):
What the customer asked:
What the AI answered:
What the answer should have been:
Rule ID (shown under the AI message, if visible):
```

> 📷 [SCREENSHOT — A conversation showing where the rule ID appears under an AI message, so testers know what to copy.]

---

## 7. Rules during the test period

- **Do not share the chat with real customers.** The test link is for the team only.
- The link is **shared privately** — do not post it publicly.
- **Test data is marked** so we can tell it apart from real chats (test conversations carry the tag `test`). When you create test chats, use the test link you were given so they are tagged correctly.

---

## 8. Sign-off (Rulebook-only test)

Finally, we confirm the Rulebook is good enough on its own:

> **Acceptance check 24:** One non-engineer staff member, using **only the Rulebook** (no help from developers), can (a) reply to a test escalation and (b) change one fee in Knowledge.

| Task | Staff name | Completed using only the Rulebook | Notes |
|---|---|---|---|
| Reply to a test escalation | | ☐ | |
| Change one fee in Knowledge | | ☐ | |
