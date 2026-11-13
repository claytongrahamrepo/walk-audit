# Walk Audit (East Providence)

A phone web page that replaces the paper worksheets in a walk audit. No app to
install and no login. People open a link, answer the worksheets, pin problem
spots on a map with photos, and their answers land in one shared dataset.

It follows the worksheets in the **AARP Walk Audit Tool Kit**
(AARP.org/WalkAudit): the same eleven worksheets in the same order, the same
items, the same Yes / No / Other answers, and the same Great / Acceptable /
Mixed / Poor rating. The question wording is a paraphrase, not AARP's text,
because the tool kit is copyrighted. This is an independent tool; AARP did not
make or endorse it.

## How a walk audit runs with it

1. **Organizer** opens the page, Menu > *Make an audit link*, enters the route,
   and sends the link (text, email, or a printed QR code made from the link).
2. **Each participant** opens the link on their phone. The route is filled in.
   They tap *Start audit*.
3. On the walk they use the worksheets that fit and skip the rest:
   | # | Worksheet | What it records |
   |---|---|---|
   | 1 | Make a Map | Pins with photo, type (problem / good / idea), topic, note |
   | 2 | Who's Using the Street | Tap counters by age, how, and reason; optional car count; first and last tap times |
   | 3 | Sidewalks | 9 items + rating |
   | 4 | Streets and Crossings | Speed, lanes, 7 street items, 6 signal items (with a tap timer for signal times) + rating |
   | 5 | Street Safety and Appeal | 14 features, 6 impressions + rating |
   | 6 | Public Transit Access | 10 items + rating |
   | 7 | Build a Better Block | 30 possible improvements to pick from |
   | 8 | Winter Weather | 16 items + rating |
   | 9 | Summary | Yes / No totals and ratings, filled in automatically |

   AARP's two combined "Sidewalks, Streets and Crossings" sheets are the same
   items as sheets 3 and 4, so they are not repeated. The audit type
   (walking route or single location) is asked at the start instead.
4. They tap **Finish audit** on the Summary screen.
5. **Team totals** (Summary screen, the menu, or the organizer's results link)
   adds up everyone's answers for the audit code: how the ratings spread, Yes /
   No / Other per worksheet and per item, the items most often answered No,
   signal times, counts, the improvements people picked, and map notes by type.
   It can be downloaded as CSV tables for the report. It shows no names and no
   written notes.

Menu > *Before you go* covers the tool kit's planning steps (where, when, who,
agree how to record) and what to bring.

Everything saves on the phone as they go. A lost signal does not lose work; it
sends when the phone is back online.

## The dataset

With the shared Google Sheet connected (see `backend/SETUP.md`):

- **Audits**: one row per person per audit, about 250 columns. Header fields,
  each worksheet's Yes / No / Other totals and rating, then every item.
  `sw3` is Sidewalks item 3; `sw3_note` is the note on it.
- **Observations**: one row per map note with `lat`, `lon`, `kind`, `topic`,
  `note`, `worksheet_item`, `photo_url`. Download this tab as CSV and add it to
  ArcGIS, QGIS, or Google My Maps.
- **Codebook**: what each column means.
- Photos in a Drive folder.

Without the sheet, each person can use Menu > *Download my data* to get a zip
(`audits.csv`, `responses_long.csv`, `map_notes.csv`, `map_notes.geojson`,
`codebook.csv`, `photos/`) and send it to the organizer.

## Limits to keep in mind when reading the data

- **It records what people noticed, not everything that is there.** A block
  with no pins may be fine, or nobody may have looked. The route field tells
  you where people walked; it is not a survey of every block.
- **Phone location is rough.** Expect 5 to 15 m outdoors, worse near tall
  buildings. That is often the wrong side of the street. `accuracy_m` gives the
  phone's own estimate. People can drag the pin; `location_source` says whether
  they did.
- **Ratings are opinions.** Two people on the same walk will differ. Report the
  spread, not just an average. Team totals shows the spread for that reason.
- **Team totals with few people are rough.** "3 of 4 said No" is four people's
  view, not a measurement. The screen gives counts, never percentages.
- **Team counts can double-count.** If several people counted the same spot at
  the same time, the summed count includes the same passers-by more than once.
  Use one person's row from the sheet.
- **Counts of people are tallies by eye**, and the same person can be counted
  twice. AARP's worksheet says the same.
- **The shared sheet accepts posts from anyone who has the link.** The key in
  `config.js` keeps out stray bots only. Check the data before you publish it.
- Text that starts with `=`, `+`, `-` or `@` gets a leading apostrophe in the
  CSV export so a spreadsheet will not run it as a formula.

## Files

    index.html, styles.css   the page
    config.js                community name, map center, shared-sheet URL and key
    js/forms.js              the worksheets (edit wording here)
    js/data.js               data model and column layout
    js/store.js              saving on the phone
    js/sync.js               sending to the shared sheet
    js/export.js             zip / CSV / GeoJSON export
    js/app.js                screens
    sw.js                    lets the page open with no signal
    backend/Code.gs          Google Apps Script for the shared sheet
    backend/SETUP.md         how to connect the sheet
    tools/mock-sheet.mjs     local stand-in for the sheet; runs the real Code.gs
    tools/fake-google.mjs    imitation of Google Sheets and Drive for the two above
    tools/test-backend.mjs   checks Code.gs logic:      node tools/test-backend.mjs
    tools/test-totals.mjs    checks team-totals math:   node tools/test-totals.mjs
    vendor/leaflet           map library (Leaflet 1.9.4, BSD-2-Clause)

Map tiles come from OpenStreetMap's public tile server, which is fine for a
community tool with light use. If use grows, switch to a tile provider with an
account.

## Hosting

Any static web host with HTTPS works (the camera and location need HTTPS).
GitHub Pages is the simplest: push this folder to a public repository and turn
on Pages.

## Testing locally

    python3 -m http.server 8767 --bind 127.0.0.1
    node tools/mock-sheet.mjs 8768

Then open
`http://localhost:8767/?s=http%3A%2F%2Flocalhost%3A8768%2F&k=test`.
The `s` and `k` overrides work on localhost only.

## Where it departs from the AARP tool kit

Checked against the worksheets and the tool kit's Steps 1 to 3 on 2026-11-13.

- Wording is paraphrased (copyright). Item order and numbering are AARP's.
- Signal times are entered in seconds, not minutes and seconds.
- The two combined "Sidewalks, Streets and Crossings" sheets are split into
  Sidewalks and Streets and Crossings, so there are two ratings, not one.
- The car counter and the count times are additions. The tool kit lists
  counting cars as an activity, but its worksheet counts people only.
- The map is a live street map with pins, not a hand-drawn sketch. There is no
  pin type for landmarks; the base map already shows streets, schools and shops.
- Photos only. Video and sound are not captured.
- The app collects the data and adds up a team's answers. It does not write
  the report the tool kit describes.

## Not built yet


- Portuguese and Spanish. All wording lives in `js/forms.js` and `js/app.js`.
- A shared map of everyone's pins with photos, and charts. Team totals gives
  the numbers; the map of all pins is the "Group's notes" button, without photos.
- The written report (the tool kit's seven-part outline).
- A record of the path walked. Useful for showing which blocks were covered,
  but it raises privacy questions, so it is off the table until asked for.
