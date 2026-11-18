# Walk Audit

**Open it:** https://claytongrahamrepo.github.io/walk-audit/

A phone web page that replaces the paper worksheets in a walk audit, for any
community. No app to install, no login, and nobody collects the data: each
person's work stays on their own phone until they send a copy to someone.

It follows the worksheets in the **AARP Walk Audit Tool Kit**
(AARP.org/WalkAudit): the same worksheets in the same order, the same items,
the same Yes / No / Other answers, and the same Great / Acceptable / Mixed /
Poor rating. The question wording is a paraphrase, not AARP's text, because the
tool kit is copyrighted. This is an independent tool; AARP did not make or
endorse it.

## How a walk audit runs with it

1. **Walk leader** (optional): Menu > *Make an audit link*. Enter the community
   and route, then send the link by text or email. It fills in the details for
   everyone. One person walking alone can skip this and just open the page.
2. **Each person** opens the link on their phone and taps *Start audit*. The
   phone asks to use its location; say yes.
3. On the walk:
   - **+ Note here** marks the spot where you are standing. The pin is placed by
     the phone's location, so there is nothing to position by hand. Add a
     photo, a type (problem / good feature / idea), a topic and a note. If the
     pin is off, drag it.
   - The **Map** follows you as you walk and shows your notes.
   - The **worksheets** are the AARP checklists. Use the ones that fit.
   | # | Worksheet | What it records |
   |---|---|---|
   | 1 | Make a Map | Pins with photo, type, topic, note |
   | 2 | Who's Using the Street | Tap counters by age, how, and reason; optional car count; first and last tap times |
   | 3 | Sidewalks | 9 items + rating |
   | 4 | Streets and Crossings | Speed, lanes, 7 street items, 6 signal items (with a tap timer for signal times) + rating |
   | 5 | Street Safety and Appeal | 14 features, 6 impressions + rating |
   | 6 | Public Transit Access | 10 items + rating |
   | 7 | Build a Better Block | 30 possible improvements to pick from |
   | 8 | Winter Weather | 16 items + rating |
   | 9 | Summary | Yes / No totals and ratings, filled in automatically |
4. **Finish audit**, then **Send a copy**. The phone's share menu opens with one
   file attached. Send it to yourself, and to the walk leader if there is one.
5. **Walk leader:** open *Team totals*, choose the files people sent, and the
   page adds everyone up: how the ratings spread, Yes / No / Other per
   worksheet and per item, the items most often answered No, signal times,
   counts, the improvements people picked, and map notes by type. *Download the
   combined data* gives one zip with everyone's answers and photos as tables.
   This happens on the leader's own device. Nothing is uploaded.

Menu > *Before you go* covers the tool kit's planning steps and what to bring.

## The files

**A person's copy** (`walk-audit_<place>_<date>.html`) is one web page with
their answers, notes, map notes and photos. It opens in any browser and can be
printed. It also carries the same data in a form this tool can read, which is
how *Team totals* combines copies.

**Data tables** (*Download data tables*, or the leader's combined zip):

    audits.csv            one row per person, about 250 columns
                          (sw3 = Sidewalks item 3; sw3_note = the note on it)
    responses_long.csv    one row per checklist answer
    map_notes.csv         one row per map note, with lat and lon
    map_notes.geojson     the same, for ArcGIS, QGIS or Google My Maps
    codebook.csv          what every column means
    photos/               the photos
    team/                 the team totals as small tables (combined zip only)

## Limits to keep in mind when reading the data

- **It records what people noticed, not everything that is there.** A block
  with no pins may be fine, or nobody may have looked.
- **Phone location is rough.** Expect 5 to 15 m outdoors, worse beside tall
  buildings. That is often the wrong side of the street. The form says how good
  the fix is and asks the person to wait or drag the pin when it is poor.
  `accuracy_m` records the phone's own estimate; `location_source` says whether
  the person moved the pin.
- **Pooling depends on people sending their copy.** Some will forget. A phone
  lost or wiped before sending takes that audit with it.
- **Ratings are opinions.** Two people on the same walk will differ. Team
  totals shows the spread for that reason, as counts, never percentages.
- **Team totals with few people are rough.** "3 of 4 said No" is four people's
  view, not a measurement.
- **Counts of people are tallies by eye**, and summed counts can count the same
  passers-by twice if several people counted the same spot.
- **A copy is only as trustworthy as its sender.** Team totals adds up whatever
  files it is given.
- Text that starts with `=`, `+`, `-` or `@` gets a leading apostrophe in the
  CSV tables so a spreadsheet will not run it as a formula.

## Not tested, or not known

- On a real phone: the camera, real GPS, and the share menu. Testing so far is
  in a desktop browser at phone size, with simulated location and sharing.
- Whether some email services flag or strip an `.html` attachment. If one does,
  text message or AirDrop still works, and *Save the file* is always there.

## Where it departs from the AARP tool kit

Checked against the worksheets and the tool kit's Steps 1 to 3.

- Wording is paraphrased (copyright). Item order and numbering are AARP's.
- Signal times are entered in seconds, not minutes and seconds.
- The two combined "Sidewalks, Streets and Crossings" sheets are split into
  Sidewalks and Streets and Crossings, so there are two ratings, not one.
- The car counter and the count times are additions. The tool kit lists
  counting cars as an activity, but its worksheet counts people only.
- The map is a live street map with pins, not a hand-drawn sketch.
- Photos only. Video and sound are not captured.
- The tool collects the data and adds up a team's answers. It does not write
  the report the tool kit describes.

## Optional: a shared Google Sheet

A group that wants answers pooled automatically, with no files to send, can
connect one Google Sheet (`backend/SETUP.md`, about ten minutes, once). Then
every participant's answers land in the sheet as they go, the map can show the
group's notes live, and Team totals reads from the sheet. The cost is that one
person holds everyone's data. It is off unless `config.js` names a sheet.

## Files

    index.html, styles.css   the page
    config.js                optional settings: a fixed community, a shared sheet
    js/forms.js              the worksheets (edit wording here)
    js/data.js               data model, column layout, team totals
    js/store.js              saving on the phone
    js/report.js             a person's copy: writing it and reading it back
    js/export.js             zip / CSV / GeoJSON
    js/sync.js               sending to a shared sheet, if one is set
    js/app.js                screens
    sw.js                    lets the page open with no signal
    backend/                 the optional Google Sheet script and its setup steps
    tools/                   tests and a local stand-in for the sheet
    vendor/leaflet           map library (Leaflet 1.9.4, BSD-2-Clause)

Map pictures come from OpenStreetMap's public tile server, which is fine for
light use. If use grows, switch to a tile provider with an account.

## Hosting

It is served by GitHub Pages from the `main` branch of this repository. A push
to `main` updates the live page within a minute or two. Any static web host
with HTTPS would also work (the camera and location need HTTPS). To run your
own copy, fork the repository and turn on Pages.

## Testing

    node tools/test-report.mjs     a person's copy: written, read back, and safe
    node tools/test-totals.mjs     team totals arithmetic
    node tools/test-backend.mjs    the optional Google Sheet script
    python3 -m http.server 8767 --bind 127.0.0.1     then open localhost:8767

## Not built yet

- Other languages. All wording lives in `js/forms.js` and `js/app.js`.
- A shared map of everyone's pins with photos (without the Google Sheet).
- The written report (the tool kit's seven-part outline).
- A record of the path walked. Useful for showing which blocks were covered,
  but it raises privacy questions, so it waits until someone asks.
