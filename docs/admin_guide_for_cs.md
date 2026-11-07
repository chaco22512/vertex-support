# Admin guide for the CS team

Short, non-technical how-tos for the CS team using the admin site.

## Managing the knowledge with your CSV

**Your CSV is the master copy of what the bot knows.** Whenever you change the
knowledge, edit your sheet and upload it again. The bot only uses the rules from
your sheets (the old manuals are kept in storage as *Archived* and are not used).

### Rule IDs — please read this first

Every row needs a **Rule ID**: a topic code (**2–4 capital letters**) followed by
**3–4 numbers**, for example **DR001**, **ESP001** or **CN0001**. Letters and numbers
only. Capital or small letters don't matter (esp001 is the same as ESP001). Each ID
can appear only once in a file.

The topic code decides **which chat topic the bot uses the rule for**, so pick
the code that matches the topic:

| Code | Topic | Used on these chat topics |
|---|---|---|
| IN | Internet / connection | Both Internet tiles |
| APN | APN setup | Both Internet tiles |
| PY | Payment & monthly bill | Payment |
| LS | Lost SIM or device | Lost / damaged |
| CN | Cancellation | Cancellation, Deposit refund |
| RT | Returning SIM / device | Returning |
| RP | Replacement / change plan | Replacement |
| RI | Re-issue | Lost / damaged |
| RF | Refund / cashback | Deposit refund |
| DR | Deposit refund | Deposit refund |
| PL | Plans & requirements | Plans (the bot never gives monthly prices or discount amounts) |
| GN | General — used on every topic | All topics |
| OT | Other | Only when a customer asks under "Others" |

**You can start a new topic code yourself** (for example **ESP** for eSIM) — no
need to ask us. The rules are imported straight away. Until the code is linked to a
chat tile, the preview shows a yellow note and the bot uses those rules only under
"Something else" and in its full-manual search. To link it: open **Topic codes** in
the menu, tick the tiles the code belongs to, and press **Save**. The same screen
shows every code, how many rules use it, and which tiles use it.

**Always keep the same ID for the same rule.** If you change the wording of DR003,
keep it DR003 — do not give it a new number, and never reuse an old number for a
different rule. Then the **Change history** shows the whole story of that rule
(who changed what, and when). For a brand-new rule, use the next free number
(e.g. DR016).

The **Topic** column is just a label for you — write it however you like.

### Updating the knowledge

1. Open **Knowledge** and click **Upload CSV**, then pick your file.
2. Choose how to apply it (you can switch in the window — the preview updates):
   - **Add / update only** (the normal choice): rows in your file are added or
     updated. Rules that are not in your file stay as they are.
   - **Replace all**: makes the bot's knowledge exactly your file. Rules that are
     not in your file are **archived** (kept in storage, not deleted, and can be
     brought back). To confirm, you must type **REPLACE**.
3. Check the preview — **nothing changes yet.** It shows how many rules will be
   updated, added and (for Replace all) archived, and how many rules the bot will
   be able to use afterwards. If that number would be 0, a red warning appears.
4. Click the button at the bottom to apply. Everything is applied together in one
   step: the bot never sees a half-updated knowledge base.

### If some rows are skipped

Rows with a problem are listed in the preview and skipped; the good rows still
go through. Each message says what to fix, for example:

| Message starts with | What to do |
|---|---|
| "This row has no Rule ID" | Add an ID such as DR016. |
| "… is not in the expected format" | Use 2–4 capital letters + 3–4 numbers, e.g. DR001, ESP001 or CN0001. |
| "Answer text is a spreadsheet error (#NAME?)" | The cell starts with "-", "+" or "=" so the spreadsheet turned it into a broken formula. Retype the answer (e.g. start the list with "•") and export again. |
| "… appears more than once" | Keep one row per Rule ID (dr001 and DR001 count as the same). |
| "This new rule has no Topic" | Fill in the Topic column. |
| "… still contains an unfilled placeholder / a spreadsheet formula" | Replace it with the final text. |

### Archive, disable or activate only some rules

Tick the box at the start of each rule you want (the box in the header ticks or
clears every rule in the current view; "Select all … in this view" does the same
from the bar). A bar appears at the top: **Archive selected**, **Disable selected**,
**Activate selected**, **Clear**. You are asked to confirm with the number of
rules. A backup is saved first, so you can **Undo** from the message that appears
or later from **Bulk actions → Backups**; every change is in **Change history**.
Activating a rule that is *Internal* or *Bot may use = No* switches it on, but the
bot still never uses it.

### Undo

Right after applying, click **Undo** in the message at the bottom of the screen.
Later, use **Bulk actions → Backups…** (a full copy is saved before every upload).

### Downloading the current knowledge

**Download CSV** (what you are looking at) or **Download all** gives you a file in
the same format. The first data row is an EXAMPLE row and is ignored on upload.
Japanese, Vietnamese and Nepali text open correctly in Excel.

## Emptying the knowledge (Archive all)

To start again from nothing, open **Knowledge → Bulk actions → Archive all…**,
type **ARCHIVE** and confirm. Every rule is moved to storage (*Archived*) — not
deleted — and can be brought back with **Undo** or **Backups**.

Until you upload a new sheet, the bot has no rules and passes every question to
staff (the Dashboard shows a red warning). Usually it is easier to just upload
your new sheet with **Replace all**: it swaps the knowledge in one step, with no
empty period in between.

### Deleting archived rules for good (you will normally not need this)

At the very bottom of **Bulk actions** (in red) is **Delete archived rules
permanently…**. It deletes only rules that are already *Archived* — rules the bot
is using are never touched — and their change history is kept. Type **DELETE**
to confirm.

A copy is saved first, so it can still be undone from **Backups**, but only the
latest 5 copies are kept: after 5 more bulk changes, deleted rules cannot come
back. If in doubt, leave archived rules where they are — they do no harm.

## Turning off a group of rules

1. On **Knowledge**, pick a topic and/or type a search so the list shows only the
   rules you want to turn off.
2. Click **Bulk actions → Disable all in this view…**. The window tells you exactly
   how many rules will be turned off.
3. Click **Disable**. The rules stay in the list as *Disabled* and the bot stops using them.

## Getting things back (Backups)

Before every **CSV upload** and every **Disable all**, a full copy of the knowledge base
is saved automatically. The latest 5 copies are kept.

- Right after the change, click **Undo** in the message at the bottom of the screen.
- Later, open **Bulk actions → Backups…**:
  - **Undo this change** — puts back only the rules that change touched.
  - **Restore everything** — puts every rule back to how it was at that time
    (changes made after that time are undone too; the current state is saved first).

Every bulk change, undo and restore is shown in **Change history**, and a message
is posted in Slack so the team knows.

## Changing how the bot talks (AI behaviour)

Open **AI behaviour** in the left menu (admins only). It has three parts:

- **① Safety rules (fixed)** — rules the bot always follows, such as never giving
  monthly plan, COD or discount prices, never mentioning internal tools or staff
  names, and always replying in the customer's language. You can read them but
  not change them. They always win over anything written below.
- **② Common behaviour** — how the bot talks on every topic (tone, asking one
  question at a time, …). It starts with your *Core_System_Prompt* sheet.
- **③ Topic instructions** — extra guidance for one topic only (for example, which
  facts to ask for, in order). Cancellation, Returning, Deposit refund and
  Replacement start with your topic sheets.

The counter under each box shows its length. Very long text makes the bot slower,
so try to stay under the recommended size.

### Try before you publish
Under **Try it**, pick a topic, type a customer question and click **Try it**. You
see how the bot would answer with the text in the boxes right now — even before
saving. Customers are not affected.

### Save and publish
1. **Save draft** keeps your changes as a new version. Customers do not see it yet.
2. **Publish** first asks the bot 4 test questions with your text and checks that:
   it does not give a monthly price, it gives the lost-SIM fee, it never mentions
   internal words or staff names, its replies are in the right format, and it
   answers an Indonesian question in Indonesian.
3. If every check passes, your version goes live straight away and a message is
   posted in Slack. If any check fails, **nothing is published**: the page lists
   what failed and shows the start of the bot's reply, so you can fix the text
   and try again.

Each test question and each **Try it** uses some of the bot's daily allowance,
which is shared with customers — avoid publishing many times in one day.

### Going back to an earlier version
Under **Versions**, click **View changes** to see what changed in a version
(added lines in green, removed lines crossed out), or **Restore this version** to
make that text live again. Restoring runs the same 4 safety checks first.

## How many AI answers are left today

The **Dashboard** card **AI requests today** shows how many times the bot has
used the AI today, how many are left, and when the count resets (shown in Japan
time). On the current free plan the AI can be used **20 times a day**. When that
runs out, a red message appears and the bot passes every question to staff until
the reset.

The number is counted by the bot itself, so it is a close estimate; Google's own
page has the official figure. The **AI behaviour** page also shows how many are
left before you click **Publish** (uses 4) or **Try it** (uses 1).


## AI request limits (Google free plan)

- The whole company shares **20 AI requests a day** and **5 a minute**. The
  Dashboard shows both: "AI requests (whole company) n / 20" and "AI requests this
  minute n / 5" (orange near the limit, red at it), plus a small chart of the last
  hour. Google's day restarts at 17:00 Japan time (16:00 in summer).
- Customer chats, Translate, AI draft, Try it and the Publish safety tests all
  count. **AI diagnostics → AI requests by purpose** shows what used them and how
  many requests one customer question takes on average.
- When a limit is hit, customers are never left without an answer: they see "We're
  receiving a lot of questions right now, so a member of our support team will help
  you directly", and the chat is passed to staff as usual. In AI diagnostics these
  show as "Busy right now (per-minute limit)" or "Daily limit reached".
- **Translate** now translates the whole conversation with one request and keeps
  the result, so opening the conversation again costs nothing.

## Customers: "New chat"

Customers can tap **New chat** at the top of the chat to clear the screen and start
over (they are asked first). A finished (resolved or closed) conversation is no
longer reopened when the customer comes back on the same phone; the link in our
reply email still opens the conversation.
