# Admin guide for the CS team

Short, non-technical how-tos for the CS team using the admin site.

## Reviewing rules in a spreadsheet

You can take the whole knowledge base into Excel (or Google Sheets), check it,
write your decisions, and send the changes back — without touching the live site
until you've reviewed a preview.

### 1. Download
1. Open **Knowledge** (or **Review queue**).
2. Click **Download CSV** to get the rules you're currently looking at (your
   search / category filter is included), or **Download all** for everything.
3. A file like `knowledge-all-2026-07-11.csv` is saved to your computer.

### 2. Open and check in Excel
- Double-click the file. Japanese, Vietnamese and Nepali text show correctly
  (the file is saved so Excel reads these languages properly).
- The first data row is an **EXAMPLE** row showing how to fill things in. It is
  ignored when you upload, so you can leave it or delete it.
- Columns you may change: **Answer text, Fee amounts (JPY), Fixed fee?, Links,
  Who can see, Bot may use?, Status.** Changes to any other column are ignored.
- Two blank columns are for you: **CS decision** and **CS comment**.

### 3. Write your decisions
In the **CS decision** column, for any row you want to act on, type one of:
- **Approve** — move a rule from *Waiting for review* to *Active*.
- **Keep internal** — mark it staff-only (and Active).
- **Disable** — stop using the rule.
- *(leave blank)* — no change from this column.

Use **CS comment** for a note to the team (it's not applied to the rule).
Save the file (keep it as CSV).

### 4. Upload and review the preview
1. Back on the **Knowledge** page, click **Upload reviewed CSV** and pick your file.
2. A **preview** appears first — **nothing is changed yet.** It shows:
   - how many rows will change, stay the same, or be ignored;
   - each change as *from → to* (fee changes are highlighted);
   - any rows with a problem (e.g. an unknown Rule ID, a price that isn't a number,
     or an unfinished placeholder) — those rows are listed and will be **skipped**,
     while the good rows still go through.
3. If it looks right, click **Apply changes.** Only now are the rules updated.

### 5. If you change your mind
Right after applying, a message shows **Undo import** — click it to put everything
back the way it was. Every change (and the undo) is saved in **Change history**.

### Notes
- Only admins can upload. Anyone with admin access can download.
- Prices for monthly plans, COD, and discounts are still never shown by the bot —
  the preview/validation won't let unfinished or formula text go live.
