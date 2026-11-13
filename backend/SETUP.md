# Connect the walk audit tool to a shared Google Sheet

About ten minutes, once. After this, every participant's answers and map notes
land in one sheet that you own.

1. Create a new Google Sheet. Name it, for example, "East Providence Walk Audits".
2. In the sheet: **Extensions > Apps Script**. Delete the sample code. Paste in
   all of `Code.gs` from this folder.
3. Near the top, change `KEY = 'CHANGE-ME'` to a phrase of your own, such as
   `ep-walk-2026`. Save.
4. Choose the function **selfTest** in the toolbar and press **Run**. Google asks
   for permission to edit this sheet and to create files in your Drive (for the
   photos). Because the script is your own, Google shows an "unverified app"
   warning: choose **Advanced > Go to (project name)**. The log should end with
   "Self-test passed".
5. **Deploy > New deployment > Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   Press Deploy and copy the **Web app URL** (it ends in `/exec`).
6. In `config.js` (one folder up), paste that URL as `syncUrl` and your phrase
   as `key`. Publish the change.

To check it: open the web app URL with `?action=ping` added. You should see
`{"ok":true,...}`.

## What you get

- **Audits** tab: one row per person per audit. Header fields, each worksheet's
  Yes/No/Other totals and rating, then every item (`sw3` = Sidewalks item 3).
- **Observations** tab: one row per map note, with `lat` and `lon`. ArcGIS,
  QGIS and Google My Maps can all read this tab as a CSV (File > Download).
- **Codebook** tab: what each column means.
- **Walk Audit Photos** folder in your Drive. The `photo_url` column links to
  each photo. Photos are private to you until you share the folder.

## What the page reads back

Two requests read from the sheet, both needing the key and an audit code:
the "Group's notes" map button (map notes: place, type, topic, note) and the
Team totals screen (worksheet answers, ratings and counts). Neither returns
names, phone ids, photo links or written notes from the Audits tab.

## Things to know

- `selfTest` writes a note that starts with `=` and checks it comes back as
  typed. If it reports a problem with that note, tell Claude: the text guard
  needs a small change for how your Sheets account stores text.
- The script's logic has been run against an imitation of Sheets on a laptop
  (`node tools/test-backend.mjs`). It has not run on Google until you do step 4.
- The key is in the page source, so anyone determined can find it. It stops
  stray bots, not a person who wants to post junk. If junk appears, change the
  key in both places and redeploy.
- If you change `Code.gs` later, use **Deploy > Manage deployments > Edit >
  New version**. A new deployment gets a new URL.
- Rows are replaced, not duplicated, when a person keeps editing after they
  have sent. `received_at` shows the last time a row changed.
- A participant who deletes a map note after it was sent leaves a row with
  `deleted = 1`. Filter those out.
