/* Worksheet definitions.
 *
 * The structure follows the worksheets in the AARP Walk Audit Tool Kit
 * (AARP.org/WalkAudit): same worksheets, same order, same items, same
 * Yes / No / Other answers and the same Great / Acceptable / Mixed / Poor rating.
 * The wording here is our own paraphrase, not AARP's text. Item codes map to the
 * AARP item numbers (sw3 = Sidewalks item 3) so results can be compared with
 * paper worksheets.
 *
 * Item:  { c: code, t: text, d: optional follow-up }
 * Follow-up d: { k: 'text' | 'secs' | 'yn' | 'multi', l: label, on: 'yes' | 'no' | 'any', opts }
 */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};

  WA.RATINGS = [
    { v: 'great', l: 'Great', h: 'Very walkable and safe' },
    { v: 'acceptable', l: 'Acceptable', h: 'Mostly walkable and safe' },
    { v: 'mixed', l: 'Mixed', h: 'Somewhat walkable and safe' },
    { v: 'poor', l: 'Poor', h: 'Not walkable or safe' }
  ];

  var YN = [['yes', 'Yes'], ['no', 'No']];

  WA.SHEETS = [
    {
      id: 'map', kind: 'map', title: 'Make a Map',
      blurb: 'Pin problem spots, good features and ideas. Add photos.'
    },
    {
      id: 'count', kind: 'tally', title: 'Who’s Using the Street — and Why?',
      blurb: 'Tally the people you see. Tap + for each person.',
      intro: 'Tap + once for each person you see. Guess age and reason as best you can. It is fine to count someone more than once.',
      groups: [
        { title: 'Who is walking?', items: [
          { c: 'count_children', t: 'Young children (elementary age)' },
          { c: 'count_teens', t: 'Teens' },
          { c: 'count_adults', t: 'Adults' },
          { c: 'count_older', t: 'Older adults' }
        ] },
        { title: 'How?', items: [
          { c: 'count_stroller', t: 'Pushing a stroller or walking with children' },
          { c: 'count_mobility_aid', t: 'Using a wheelchair, cane or walker' },
          { c: 'count_wheels', t: 'On a bike, scooter, skateboard or similar' }
        ] },
        { title: 'Likely reason', items: [
          { c: 'count_school', t: 'Going to or from school' },
          { c: 'count_transit', t: 'Going to or waiting for the bus' },
          { c: 'count_work', t: 'Going to or from work' },
          { c: 'count_shopping', t: 'Shopping or getting food' },
          { c: 'count_fitness', t: 'Walking or running for exercise' },
          { c: 'count_dog', t: 'Walking a dog' },
          { c: 'count_park', t: 'Going to a park or public space' },
          { c: 'count_stroll', t: 'Just out for a walk' },
          { c: 'count_other', t: 'Other or unknown' }
        ] },
        { title: 'Traffic (optional)', n: 'Not on the AARP worksheet, but the tool kit suggests counting cars too. Count for a set time, such as 10 minutes.', items: [
          { c: 'count_vehicles', t: 'Cars, trucks and buses passing' }
        ] }
      ],
      text: { c: 'not_walking', l: 'Who is not walking here?', h: 'Do the people you see match who lives in the neighborhood? Who is missing, and why might that be?' }
    },
    {
      id: 'sidewalks', kind: 'check', title: 'Sidewalks', rating: true,
      blurb: 'Condition, width, gaps and curb ramps.',
      pre: [
        { c: 'sidewalk_presence', k: 'choice', l: 'The street has…', opts: [
          ['none', 'No sidewalk'],
          ['none_needs_one', 'No sidewalk, and needs one'],
          ['none_needs_two', 'No sidewalk, and needs one on both sides'],
          ['partial', 'Sidewalk in some places'],
          ['one_side', 'A sidewalk on one side'],
          ['both_sides', 'Sidewalks on both sides']
        ] }
      ],
      sections: [
        { title: 'The sidewalk…', items: [
          { c: 'sw1', t: 'Is set apart from traffic by a curb, grass strip or plantings' },
          { c: 'sw2', t: 'Has a smooth, even surface (concrete or asphalt, not loose brick)' },
          { c: 'sw3', t: 'Is in good repair, with no cracks or lifted slabs' },
          { c: 'sw4', t: 'Is clear of obstacles (poles, hydrants, bins, overgrown plants)' },
          { c: 'sw5', t: 'Is not broken up by driveways' },
          { c: 'sw6', t: 'Is continuous: no gaps, and it does not just end' },
          { c: 'sw7', t: 'Is wide enough for two people side by side (about 5 feet)' },
          { c: 'sw8', t: 'Has bumpy warning pads where it ends, for people with low vision', h: 'Raised bumps you can feel underfoot or with a cane, usually at the bottom of a curb ramp.' },
          { c: 'sw9', t: 'Has a curb ramp wherever it meets a street', h: 'A curb ramp (curb cut) slopes from the sidewalk down to the street, for wheelchairs and strollers.' }
        ] }
      ]
    },
    {
      id: 'streets', kind: 'check', title: 'Streets and Crossings', rating: true,
      blurb: 'Speed, lanes, crosswalks and walk signals.',
      pre: [
        { c: 'speed_limit', k: 'numtext', l: 'Posted speed limit(s), mph', h: 'If it changes along the way, list each one. Leave blank if none is posted.' },
        { c: 'drivers_obey_limit', k: 'choice', l: 'Do drivers appear to obey it?', opts: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Can’t tell']] },
        { c: 'vehicle_lanes', k: 'num', l: 'Total vehicle lanes' },
        { c: 'street_direction', k: 'choice', l: 'The street is…', opts: [['one_way', 'One-way'], ['two_way', 'Two-way']] },
        { c: 'median_island', k: 'multi', l: 'If more than one lane, the road has…', h: 'A median separates the two directions of traffic. A pedestrian island is a safe place to wait partway across.', opts: [['median', 'A median'], ['island', 'A pedestrian island']] }
      ],
      sections: [
        { title: 'The street…', items: [
          { c: 'st1', t: 'Has traffic lights or stop signs at intersections and crossings' },
          { c: 'st2', t: 'Has lights and stop signs that drivers and walkers can see easily' },
          { c: 'st3', t: 'Has crosswalks' },
          { c: 'st4', t: 'Has crosswalk markings that are clear and easy to see' },
          { c: 'st5', t: 'Has signs warning drivers that people walk here' },
          { c: 'st6', t: 'Has a marked bike lane' },
          { c: 'st7', t: 'Has a walk signal or flashing beacon for people crossing', h: 'A beacon is a flashing light that a person crossing can turn on.', n: 'If yes, answer the next section.' }
        ] },
        { title: 'The walk signals…', items: [
          { c: 'sg1', t: 'Work' },
          { c: 'sg2', t: 'Have a push button that stops traffic for people crossing' },
          { c: 'sg3', t: 'Give sound cues for people with low vision' },
          { c: 'sg4', t: 'Are in the right places', d: { k: 'text', l: 'Where are more needed?', on: 'no' } },
          { c: 'sg5', t: 'Give enough time to cross', d: { k: 'secs', l: 'Crossing time given (seconds)', on: 'any' } },
          { c: 'sg6', t: 'Come often enough', d: { k: 'secs', l: 'Wait for the walk signal (seconds)', on: 'any' } }
        ] }
      ]
    },
    {
      id: 'safety', kind: 'check', title: 'Street Safety and Appeal', rating: true,
      blurb: 'Seating, shade, lighting and how safe it feels.',
      sections: [
        { title: 'This place has…', items: [
          { c: 'sa1', t: 'Places to sit' },
          { c: 'sa2', t: 'Shade trees' },
          { c: 'sa3', t: 'Grass, flowers or landscaping', d: { k: 'yn', l: 'Is it well kept?', on: 'yes' } },
          { c: 'sa4', t: 'Awnings, umbrellas or other cover from rain and weather' },
          { c: 'sa5', t: 'Drinking fountains', d: { k: 'yn', l: 'Working and clean?', on: 'yes' } },
          { c: 'sa6', t: 'Public restrooms', d: { k: 'yn', l: 'Clean and safe?', on: 'yes' } },
          { c: 'sa7', t: 'A bus or transit shelter', d: { k: 'yn', l: 'Does it have seating?', on: 'yes' } },
          { c: 'sa8', t: 'Trash cans', d: { k: 'yn', l: 'Emptied regularly?', on: 'yes' } },
          { c: 'sa9', t: 'Well-kept buildings or homes' },
          { c: 'sa10', t: 'Signs with useful information' },
          { c: 'sa11', t: 'Signs placed where people can use them' },
          { c: 'sa12', t: 'Art, signs or other street features that fit the community' },
          { c: 'sa13', t: 'Lighting meant for people walking', h: 'Lower, closer-spaced lights aimed at the sidewalk, not only the road.' },
          { c: 'sa14', t: 'A posted speed limit that seems right', d: { k: 'yn', l: 'Do drivers appear to obey it?', on: 'yes' } }
        ] },
        { title: 'Impressions', items: [
          { c: 'im1', t: 'This is a safe and appealing place to go' },
          { c: 'im2', t: 'This is a safe and appealing route to travel' },
          { c: 'im3', t: 'It appears safe for people of all ages, abilities, races and incomes' },
          { c: 'im4', t: 'It appears safe for walking both day and night' },
          { c: 'im5', t: 'People walking appear safe from moving vehicles' },
          { c: 'im6', t: 'People walking appear safe from crime or harassment' }
        ] }
      ]
    },
    {
      id: 'transit', kind: 'check', title: 'Public Transit Access', rating: true,
      blurb: 'For a bus stop on or near the route.',
      sections: [
        { title: 'Impressions', items: [
          { c: 'tr1', t: 'People can walk to and from the stop safely' },
          { c: 'tr2', t: 'The stop is in a useful place' },
          { c: 'tr3', t: 'The stop protects waiting riders from traffic' },
          { c: 'tr4', t: 'The stop has suitable seating' },
          { c: 'tr5', t: 'The stop has shelter', d: { k: 'multi', l: 'Shelter from…', on: 'yes', opts: [['rain', 'Rain'], ['sun', 'Sun'], ['heat', 'Heat'], ['cold', 'Cold'], ['wind', 'Wind']] } },
          { c: 'tr6', t: 'The stop is clean and well kept' },
          { c: 'tr7', t: 'The stop is well lit' },
          { c: 'tr8', t: 'The stop has useful amenities', d: { k: 'text', l: 'What are they?', on: 'yes' } },
          { c: 'tr9', t: 'The stop feels safe from crime' },
          { c: 'tr10', t: 'I would feel safe and comfortable waiting here' }
        ] }
      ]
    },
    {
      id: 'better', kind: 'pick', title: 'Build a Better Block',
      blurb: 'Pick the changes that would help most here.',
      intro: 'Which of these would make this place safer or more appealing to walk? Pick all that would help.',
      items: [
        { c: 'bb1', t: 'Sidewalks (there are none)' },
        { c: 'bb2', t: 'Sidewalk repairs' },
        { c: 'bb3', t: 'Wider sidewalks' },
        { c: 'bb4', t: 'A barrier between sidewalk and street (plantings, low wall, fence)' },
        { c: 'bb5', t: 'Sidewalk decoration (flower baskets, planters)' },
        { c: 'bb6', t: 'Crosswalks (there are none)' },
        { c: 'bb7', t: 'Raised crosswalks', h: 'The crossing is lifted to sidewalk height, like a wide speed hump.' },
        { c: 'bb8', t: 'Painted, artistic crosswalks' },
        { c: 'bb9', t: 'Curb extensions (“bulb-outs”) at crossings', h: 'The curb is pushed out at the corner so the crossing is shorter.' },
        { c: 'bb10', t: 'Pedestrian islands', h: 'A safe place to wait partway across a wide street.' },
        { c: 'bb11', t: 'Lighting for people walking' },
        { c: 'bb12', t: 'One-way traffic instead of two-way' },
        { c: 'bb13', t: 'Public seating (benches, tables, parklets)', h: 'A parklet is a small seating area built in a parking space.' },
        { c: 'bb14', t: 'Decorative or wayfinding signs', h: 'Wayfinding signs point the way to nearby places.' },
        { c: 'bb15', t: 'Public art (sculpture, murals, banners)' },
        { c: 'bb16', t: 'More shops and businesses facing the street' },
        { c: 'bb17', t: 'Shelter from weather (awnings, umbrellas)' },
        { c: 'bb18', t: 'Green space (a small or pocket park)' },
        { c: 'bb19', t: 'Street trees and landscaping' },
        { c: 'bb20', t: 'Better landscape upkeep' },
        { c: 'bb21', t: 'Drinking fountains' },
        { c: 'bb22', t: 'Public restrooms, or better upkeep of them' },
        { c: 'bb23', t: 'Litter removal' },
        { c: 'bb24', t: 'Graffiti removal' },
        { c: 'bb25', t: 'Trash cans' },
        { c: 'bb26', t: 'Security features (cameras, call boxes)' },
        { c: 'bb27', t: 'Control of off-leash dogs' },
        { c: 'bb28', t: 'Repair or removal of vacant or run-down buildings' },
        { c: 'bb29', t: 'On-street parking' },
        { c: 'bb30', t: 'A parking garage' }
      ],
      text: { c: 'bb_other', l: 'Other features' }
    },
    {
      id: 'winter', kind: 'check', title: 'Winter Weather', rating: true,
      blurb: 'Snow and ice clearing after a storm.',
      sections: [
        { title: 'Walkways', items: [
          { c: 'ww1', t: 'The walkway is cleared of snow after a storm', d: { k: 'text', l: 'How soon after?', on: 'yes' } },
          { c: 'ww2', t: 'The walkway is cleared of snow but still icy', neg: true },
          { c: 'ww3', t: 'The walkway is cleared of snow but still slushy', neg: true },
          { c: 'ww4', t: 'The walkway is salted or sanded' },
          { c: 'ww5', t: 'The walkway is cleared across its full width' },
          { c: 'ww6', t: 'The walkway is cleared along its full length' },
          { c: 'ww7', t: 'The walkway is reachable, not blocked by snowbanks or plow piles' },
          { c: 'ww8', t: 'The walkway is well lit' },
          { c: 'ww9', t: 'People walking are not sprayed with slush by passing cars' }
        ] },
        { title: 'Streets', items: [
          { c: 'ws1', t: 'Crosswalks are visible', d: { k: 'text', l: 'Why not?', on: 'no' } },
          { c: 'ws2', t: 'Drivers can clearly see people crossing' },
          { c: 'ws3', t: 'Bus stops are reachable' },
          { c: 'ws4', t: 'The bus stop has a shelter from bad weather' }
        ] },
        { title: 'Buildings and more', items: [
          { c: 'wb1', t: 'Benches and seating are cleared of snow and ice' },
          { c: 'wb2', t: 'Steps, ramps and entrances to public buildings are cleared' },
          { c: 'wb3', t: 'Steps, ramps and entrances to businesses are cleared' }
        ] }
      ],
      post: [
        { c: 'winter_responsible', k: 'multi', l: 'Who is responsible for clearing the walkway?', opts: [
          ['government', 'The city or town'], ['owner', 'Each property owner'], ['other', 'Someone else'], ['unknown', 'Don’t know']
        ] }
      ]
    },
    {
      id: 'summary', kind: 'summary', title: 'Summary',
      blurb: 'Totals fill in by themselves. Finish and send from here.'
    }
  ];

  /* Map notes ("Make a Map"). */
  WA.KINDS = [
    { v: 'problem', l: 'Problem', g: '!' },
    { v: 'good', l: 'Good feature', g: '✓' },
    { v: 'idea', l: 'Idea', g: '+' }
  ];
  WA.TOPICS = [
    ['sidewalk', 'Sidewalk'], ['curb_ramp', 'Curb ramp'], ['crosswalk', 'Crosswalk'],
    ['signal', 'Signal or sign'], ['traffic', 'Speed or driving'], ['lighting', 'Lighting'],
    ['transit', 'Bus stop'], ['comfort', 'Seating, shade, appeal'], ['winter', 'Snow or ice'], ['other', 'Other']
  ];
  /* Default map-note topic when a note is started from a worksheet item. */
  WA.SHEET_TOPIC = { sidewalks: 'sidewalk', streets: 'crosswalk', safety: 'comfort', transit: 'transit', winter: 'winter' };
  WA.ITEM_TOPIC = { sw8: 'curb_ramp', sw9: 'curb_ramp', st1: 'signal', st2: 'signal', st5: 'signal', st6: 'traffic', st7: 'signal',
    sg1: 'signal', sg2: 'signal', sg3: 'signal', sg4: 'signal', sg5: 'signal', sg6: 'signal', sa13: 'lighting', sa7: 'transit', sa14: 'traffic', im5: 'traffic' };

  WA.sheet = function (id) {
    for (var i = 0; i < WA.SHEETS.length; i++) if (WA.SHEETS[i].id === id) return WA.SHEETS[i];
    return null;
  };
  WA.checkSheets = function () { return WA.SHEETS.filter(function (s) { return s.kind === 'check'; }); };
  WA.itemsOf = function (sheet) {
    var out = [];
    (sheet.sections || []).forEach(function (sec) { sec.items.forEach(function (it) { out.push(it); }); });
    return out;
  };
  WA.findItem = function (code) {
    var sheets = WA.checkSheets();
    for (var i = 0; i < sheets.length; i++) {
      var items = WA.itemsOf(sheets[i]);
      for (var j = 0; j < items.length; j++) if (items[j].c === code) return { sheet: sheets[i], item: items[j], n: j + 1 };
    }
    return null;
  };
})();
