// Browser tests: the real app in a mobile-emulated Chromium (Pixel 7; one iPhone check), with a fixed clock, the
// Firebase SDK replaced by a fake Firestore (tests/browser/fake-firebase.js) and no network. They cover logging naps
// and nights, editing and deleting, the plan screen, settings, sharing between two phones, export and import,
// History, Statistics, notifications and offline use.
// Every test also fails on any console error, page error or Content-Security-Policy violation.
// Run: npm run test:browser   (TZ=Europe/Copenhagen node --test --test-concurrency=1 tests/browser/*.test.mjs)
// All data is made up.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import {
  startServer,
  openPhone,
  FakeFirestore,
  madeUpHistory,
  at,
  until,
  closeBrowser,
  H,
  MIN,
  DAY,
} from './harness.mjs';

const D0 = new Date(2026, 9, 14).getTime(); // "today": Wednesday 14 Oct 2026, local midnight (Copenhagen)
const S3 = Object.freeze({ targetNaps: 3, bedtime: '19:30' }); // frozen: tests must never change it
const FAMILY = 'made-up test family code';
let srv;
const phones = [];
async function phone(opts) {
  const p = await openPhone(srv.base, opts);
  phones.push(p);
  return p;
}
before(async () => (srv = await startServer()));
after(async () => {
  await closeBrowser();
  srv.server.close();
});
// every test ends by checking its phones had no errors, then closes them
async function done() {
  for (const p of phones.splice(0)) {
    const problems = p.problems.slice();
    await p.close();
    assert.deepEqual(problems, [], 'console errors, page errors or CSP violations');
  }
}
// the real flow: Settings > Import data opens the file picker
async function importFile(p, file) {
  const [chooser] = await Promise.all([p.page.waitForEvent('filechooser'), p.page.click('#bkimp')]);
  await chooser.setFiles(file);
}
const lines = (s) =>
  s
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

test('first run: empty app, local only', async () => {
  const p = await phone({ now: at(D0, 0, 9, 0) });
  assert.match(await p.text('#hero'), /No entries yet/);
  assert.equal(await p.text('#sync'), 'local only');
  assert.match(await p.text('#ver'), /^v\d+\.\d+$/);
  assert.deepEqual(lines(await p.text('#nowbtns')), ['💤', 'Start nap', 'Start night']);
  await done();
});

test('logging a nap and a night with the buttons', async () => {
  const p = await phone({ now: at(D0, 0, 12, 0), storage: { settings: S3 } });
  await p.page.getByRole('button', { name: 'Start nap' }).click();
  assert.match(await p.text('#hero'), /Asleep for/);
  assert.equal(await p.text('#nowbtns'), 'End nap');
  await p.setTime(at(D0, 0, 12, 45));
  await p.page.getByRole('button', { name: 'End nap' }).click();
  assert.match(await p.row('Nap 1').innerText(), /12:00–12:45\s+45m/);
  let E = await p.storage('entries');
  assert.equal(E.length, 1);
  assert.deepEqual([E[0].type, E[0].start, E[0].end], ['nap', at(D0, 0, 12, 0), at(D0, 0, 12, 45)]);

  await p.setTime(at(D0, 0, 19, 40));
  await p.page.getByRole('button', { name: 'Start night' }).click();
  assert.equal(await p.text('#plantitle'), 'Tonight');
  assert.equal(await p.text('#nowbtns'), 'Wake up');
  assert.match(await p.text('#hero'), /Asleep for/);
  await p.setTime(at(D0, 1, 6, 15));
  await p.page.getByRole('button', { name: 'Wake up' }).click();
  E = await p.storage('entries');
  const night = E.find((e) => e.type === 'night');
  assert.deepEqual([night.start, night.end], [at(D0, 0, 19, 40), at(D0, 1, 6, 15)]);
  assert.match(await p.row('Wake-up').innerText(), /06:15/);
  assert.equal(await p.text('#plantitle'), "Today's plan");
  await done();
});

test('the plan screen from a week of history', async () => {
  const p = await phone({ now: at(D0, 0, 7, 30), storage: { entries: madeUpHistory(D0, 10), settings: S3 } });
  assert.deepEqual(lines(await p.text('#plan')), [
    'Wake-up',
    '06:30',
    'Nap 1',
    '~08:30–09:30  1h 00m',
    'awake 2h 00m first',
    'Nap 2',
    '~12:00–13:20  1h 20m',
    'awake 2h 30m first',
    'Nap 3',
    '~16:00–16:40  40m',
    'awake 2h 40m first',
    'Bedtime',
    '~19:34',
    'target 19:30 (+4m) · awake 2h 54m',
  ]);
  const hero = lines(await p.text('#hero'));
  assert.ok(hero.includes('Next nap in') && hero.includes('1h 00m') && hero.includes('at ~08:30'), hero.join(' | '));
  assert.ok(hero.includes('Awake for 1h 00m') && hero.includes('since 06:30, after night sleep'));
  assert.equal(await p.text('#sub2'), 'Nap time today: 0m of about 3h 00m');
  assert.deepEqual(lines(await p.text('#planfoot')), ['Based on the past 7 days', 'Tap a row to edit']);
  // the ring: three suggested naps, sun and moon; tapping the moon logs bedtime
  assert.equal(await p.page.locator('#hero svg text', { hasText: '💤' }).count(), 3);
  await p.page.locator('#hero svg g.hit:has(circle[r="19"])').last().dispatchEvent('click'); // the moon
  assert.equal(await p.text('#dt'), 'Log bedtime');
  await p.page.click('#ecancel');
  await done();
});

test('adding and removing an extra nap', async () => {
  const p = await phone({ now: at(D0, 0, 7, 30), storage: { entries: madeUpHistory(D0, 10), settings: S3 } });
  assert.equal(await p.page.locator('#xless').isVisible(), false);
  await p.page.getByRole('button', { name: '＋ Add extra nap' }).click();
  assert.equal(await p.row('Nap 4').count(), 1);
  assert.match(await p.row('Nap 4').innerText(), /no nap 4 lately|~\d\d:\d\d/);
  assert.equal(await p.page.locator('#xless').isVisible(), true);
  assert.deepEqual((await p.storage('extra')).n, 1);
  await p.page.getByRole('button', { name: '− Remove extra nap' }).click();
  assert.equal(await p.row('Nap 4').count(), 0);
  assert.equal(await p.page.locator('#xless').isVisible(), false);
  await done();
});

test('editing and deleting a nap, typed times, refusals', async () => {
  const E = [...madeUpHistory(D0, 10), { id: 'today1', type: 'nap', start: at(D0, 0, 8, 40), end: at(D0, 0, 9, 25) }];
  const p = await phone({ now: at(D0, 0, 11, 0), storage: { entries: E, settings: S3 } });
  await p.row('Nap 1').click();
  assert.equal(await p.text('#dt'), 'Nap · 10-14');
  assert.deepEqual([await p.text('#esl'), await p.text('#eel')], ['Start', 'End']);
  assert.deepEqual([await p.page.inputValue('#es'), await p.page.inputValue('#ee')], ['08:40', '09:25']);
  assert.equal(
    await p.page.evaluate(() => document.activeElement?.tagName),
    'H2',
    'no time field focused (no keyboard)',
  );
  await p.page.fill('#ee', '935'); // typed without a colon
  await p.page.locator('#ee').blur();
  assert.equal(await p.page.inputValue('#ee'), '09:35');
  await p.page.click('#esave');
  assert.match(await p.row('Nap 1').innerText(), /08:40–09:35\s+55m/);
  assert.equal((await p.storage('entries')).find((e) => e.id === 'today1').end, at(D0, 0, 9, 35));

  // a time in the future and a nonsense time are refused, nothing changes
  await p.row('Nap 1').click();
  await p.page.fill('#ee', '23:00');
  await p.page.click('#esave');
  assert.match(p.dialogs.at(-1).message, /still in the future/);
  await p.page.fill('#ee', '99');
  await p.page.click('#esave');
  assert.match(p.dialogs.at(-1).message, /hours and minutes/);
  await p.page.click('#ecancel');
  assert.equal((await p.storage('entries')).find((e) => e.id === 'today1').end, at(D0, 0, 9, 35));

  // delete: cancelled once, then confirmed
  await p.row('Nap 1').click();
  p.answers.push(false);
  await p.page.click('#edel');
  assert.equal((await p.storage('entries')).filter((e) => e.id === 'today1').length, 1);
  await p.page.click('#edel');
  assert.match(p.dialogs.at(-1).message, /Delete this entry/);
  assert.equal((await p.storage('entries')).filter((e) => e.id === 'today1').length, 0);
  assert.match(await p.row('Nap 1').innerText(), /^~/m);
  await done();
});

test('logging a nap by hand and a night across midnight in History', async () => {
  const p = await phone({ now: at(D0, 0, 10, 0), storage: { entries: madeUpHistory(D0, 3), settings: S3 } });
  await p.page.getByRole('button', { name: '＋ Log a nap' }).click();
  assert.equal(await p.text('#dt'), 'Add extra nap');
  await p.page.fill('#es', '8:05');
  await p.page.fill('#ee', '0850');
  await p.page.click('#esave');
  assert.match(await p.row('Nap 1').innerText(), /08:05–08:50/);
  const saved = (await p.storage('entries')).find((e) => e.start === at(D0, 0, 8, 5));
  assert.ok(saved && saved.end === at(D0, 0, 8, 50) && /^[\w-]+$/.test(saved.id));

  await p.page.click('#t-hist');
  await p.page.locator('#cal button', { hasText: /^8$/ }).click(); // Thu 8 Oct: nothing logged
  assert.match(await p.text('#day'), /Nothing logged for this day/);
  await p.page.getByRole('button', { name: '＋ Log bedtime' }).click();
  assert.deepEqual(
    [await p.text('#dt'), await p.text('#esl'), await p.text('#eel')],
    ['Log bedtime · 10-08', 'Bedtime', 'Wake-up'],
  );
  await p.page.fill('#es', '19:45');
  await p.page.fill('#ee', '06:20');
  await p.page.click('#esave');
  const n = (await p.storage('entries')).find((e) => e.type === 'night' && e.start === at(D0, -6, 19, 45));
  assert.equal(n.end, at(D0, -5, 6, 20), 'the wake-up is the next morning');
  assert.match(await p.text('#day'), /Bedtime\s+19:45/);
  await done();
});

test('an unlogged wake-up can be set from the plan and the ring', async () => {
  const E = [
    ...madeUpHistory(D0, 10, { noLastNight: true }),
    { id: 'td1', type: 'nap', start: at(D0, 0, 6, 40), end: at(D0, 0, 7, 28) },
  ];
  const p = await phone({ now: at(D0, 0, 7, 54), storage: { entries: E, settings: S3 } });
  assert.match(await p.row('Wake-up').innerText(), /~\d\d:\d\d\s+not logged · tap to set/);
  await p.row('Wake-up').click();
  assert.equal(await p.text('#dt'), 'Last night · bedtime and wake-up');
  assert.deepEqual([await p.page.inputValue('#es'), await p.page.inputValue('#ee')], ['19:30', '']);
  await p.page.fill('#ee', '05:40');
  await p.page.click('#esave');
  assert.equal((await p.row('Wake-up').innerText()).replace(/\s+/g, ' '), 'Wake-up 05:40');
  const n = (await p.storage('entries')).find((e) => e.type === 'night' && e.end >= D0);
  assert.deepEqual([n.start, n.end], [at(D0, -1, 19, 30), at(D0, 0, 5, 40)]);
  // the sun on the ring now edits that night
  await p.page.locator('#hero svg g.hit:has(circle[r="19"])').first().dispatchEvent('click'); // the sun
  assert.deepEqual([await p.text('#dt'), await p.page.inputValue('#ee')], ['Night sleep · 10-13', '05:40']);
  await done();
});

test('settings: targets, typed bedtime, family code hidden until Show', async () => {
  const p = await phone({ now: at(D0, 0, 7, 30), storage: { entries: madeUpHistory(D0, 10), settings: S3 } });
  await p.page.click('#cog');
  assert.equal(await p.page.locator('#sdlg').evaluate((d) => d.open), true);
  assert.deepEqual([await p.page.inputValue('#sn'), await p.page.inputValue('#sb')], ['3', '19:30']);
  assert.equal(await p.page.locator('#sf').getAttribute('class'), 'masked');
  await p.page.click('#sfshow');
  assert.equal(await p.page.locator('#sf').getAttribute('class'), '');
  assert.equal(await p.text('#sfshow'), 'Hide');
  await p.page.fill('#sn', '4');
  await p.page.fill('#sb', '2000');
  await p.page.click('#ssave');
  assert.deepEqual(await p.storage('settings'), { targetNaps: 4, bedtime: '20:00' });
  assert.equal(await p.page.locator('#sdlg').evaluate((d) => d.open), false);
  assert.equal(await p.row('Nap 4').count(), 1);
  assert.match(await p.row('Bedtime').innerText(), /target 20:00/);
  // the sync chip opens settings too; Cancel and tapping outside close it
  await p.page.click('#sync');
  await p.page.click('#scancel');
  assert.equal(await p.page.locator('#sdlg').evaluate((d) => d.open), false);
  await done();
});

test("sharing: two phones see each other's naps, settings and extra naps", async () => {
  const fs = new FakeFirestore();
  fs.seedEntries(FAMILY, madeUpHistory(D0, 10));
  fs.seedDoc('families/' + FAMILY, { settings: S3 });
  // note: saving Settings writes this phone's targets to the family, so phone A starts with the same ones
  const a = await phone({ fs, now: at(D0, 0, 8, 30), storage: { settings: S3 } });
  const b = await phone({ fs, now: at(D0, 0, 8, 30), device: 'Pixel 7' });
  // phone A joins with the family code in Settings; phone B already has it
  await a.page.click('#cog');
  await a.page.fill('#sf', FAMILY);
  await a.page.click('#ssave');
  await b.page.evaluate((f) => localStorage.setItem('nap-log.family', JSON.stringify(f)), FAMILY);
  await b.page.reload();
  for (const p of [a, b]) await until(async () => (await p.text('#sync')) === 'shared', { what: 'shared' });
  await until(async () => /06:30/.test(await b.row('Wake-up').innerText()), { what: 'B has the history' });

  await a.page.getByRole('button', { name: 'Start nap' }).click();
  await until(async () => (await b.text('#nowbtns')) === 'End nap', { what: 'B sees the nap' });
  await b.setTime(at(D0, 0, 9, 20));
  await a.setTime(at(D0, 0, 9, 20));
  await b.page.getByRole('button', { name: 'End nap' }).click();
  await until(async () => /08:30–09:20/.test(await a.row('Nap 1').innerText()), { what: 'A sees the end' });
  const naps = fs.entries(FAMILY).filter((e) => e.start >= D0);
  assert.equal(naps.length, 1);
  assert.equal(naps[0].end, at(D0, 0, 9, 20));
  assert.ok(naps[0].pred && naps[0].pred.v, 'the prediction is saved with the entry');

  await a.page.getByRole('button', { name: '＋ Add extra nap' }).click();
  await until(async () => (await b.row('Nap 4').count()) === 1, { what: 'B sees the extra nap' });
  assert.deepEqual(fs.family(FAMILY).extraNaps, { day: '2026-10-14', n: 1 });

  await b.page.click('#cog');
  await b.page.fill('#sb', '19:00');
  await b.page.click('#ssave');
  assert.deepEqual(fs.family(FAMILY).settings, { targetNaps: 3, bedtime: '19:00' });
  await until(async () => (await a.storage('settings')).bedtime === '19:00', { what: 'A gets the settings' });
  assert.match(await a.row('Bedtime').innerText(), /~\d\d:\d\d/);
  // the next nap's reminder is planned in the family document (30 min before)
  const f = fs.family(FAMILY);
  assert.ok(
    f.notifyKey && f.notifyAt === f.notifyEvent - 30 * MIN && /^Nap \d$/.test(f.notifyLabel),
    JSON.stringify(f),
  );
  assert.ok(!JSON.stringify(Object.keys(fs.docs)).includes('subs'));
  await done();
});

test('shared History loads older months; Statistics draws its charts', async () => {
  const fs = new FakeFirestore();
  const old = madeUpHistory(at(D0, -20, 0), 15, { prefix: 'o' }); // 21 to 35 days ago: outside the 14-day live sync
  fs.seedEntries(FAMILY, [...old, ...madeUpHistory(D0, 10)]);
  const p = await phone({ fs, now: at(D0, 0, 12, 0), storage: { family: FAMILY } });
  await p.page.click('#t-hist');
  await p.page.locator('#cal button', { hasText: /^5$/ }).first().click(); // 5 Oct: inside the live sync
  assert.match(await p.text('#day'), /Monday 5 October/);
  assert.match(await p.text('#day'), /3 naps, 3h 00m in total/);
  await p.page.getByRole('button', { name: 'Previous month' }).click();
  assert.match(await p.text('#cal'), /September 2026/);
  await p.page.locator('#cal button', { hasText: /^15$/ }).first().click(); // 15 Sep: fetched on demand
  await until(async () => /3 naps, 3h 00m in total/.test(await p.text('#day')), { what: 'September days loaded' });
  await p.page.getByRole('button', { name: 'Go to today' }).click();
  assert.match(await p.text('#day'), /Wednesday 14 October/);

  await p.page.click('#t-stats');
  assert.equal(await p.page.locator('#stats .chart').count(), 6);
  assert.deepEqual(await p.page.locator('#stats .chart h2').allInnerTexts(), [
    'When your baby falls asleep',
    'When your baby wakes up',
    'How long naps last',
    'Night sleep',
    "Your baby's day",
    'How far off the plan was',
  ]);
  await p.page.getByRole('button', { name: '7 days' }).click();
  assert.equal(await p.page.evaluate(() => localStorage.getItem('nap-log.statsN')), '7');
  const svg = p.page.locator('#stats .chart').first().locator('svg');
  const box = await svg.boundingBox();
  await svg.dispatchEvent('pointermove', { clientX: box.x + box.width / 2, clientY: box.y + 20 });
  assert.match(await p.page.locator('#stats .chart .tip').first().innerText(), /Nap 1/);
  await p.page.click('#t-today');
  assert.equal(await p.page.locator('#v-today').isVisible(), true);
  await done();
});

test('export, then import with Merge and Replace', async () => {
  const fs = new FakeFirestore();
  const old = madeUpHistory(at(D0, -20, 0), 5, { prefix: 'o' });
  fs.seedEntries(FAMILY, [...old, ...madeUpHistory(D0, 10)]);
  fs.seedDoc('families/' + FAMILY, { settings: { targetNaps: 3, bedtime: '19:15' } });
  const a = await phone({ fs, now: at(D0, 0, 12, 0), storage: { family: FAMILY } });
  await until(async () => (await a.text('#sync')) === 'shared');
  await a.page.click('#cog');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#bkexp')]);
  assert.equal(dl.suggestedFilename(), 'nap-log-2026-10-14.json');
  const file = await dl.path();
  const body = nodeFs.readFileSync(file, 'utf8');
  const x = JSON.parse(body);
  assert.equal(x.format, 'nap-log-export');
  assert.equal(x.entries.length, fs.entries(FAMILY).length, 'the whole shared log, not just 14 days');
  assert.deepEqual(x.settings, { targetNaps: 3, bedtime: '19:15' });
  assert.ok(!body.includes(FAMILY), 'never the family code');
  assert.match(await a.text('#bkmsg'), new RegExp(`Exported ${x.entries.length} entries`));

  // a second family (made up) imports it: preview, then Merge
  const OTHER = 'another made-up code';
  fs.seedEntries(OTHER, [{ id: 'mine1', type: 'nap', start: at(D0, 0, 9, 0), end: at(D0, 0, 9, 30) }]);
  const b = await phone({ fs, now: at(D0, 0, 12, 0), storage: { family: OTHER } });
  await until(async () => (await b.text('#sync')) === 'shared');
  await b.page.click('#cog');
  await importFile(b, file);
  await until(() => b.page.locator('#idlg').evaluate((d) => d.open), { what: 'preview' });
  assert.match(
    await b.text('#iprev'),
    new RegExp(`^${x.entries.length} entries \\(\\d+ naps, \\d+ nights\\), \\d+ \\w+ 2026 to 13 Oct 2026\\.`),
  );
  assert.match(
    await b.text('#iwhat'),
    new RegExp(
      `Adds ${x.entries.length} new entries\\. Settings are not changed\\. Both phones will see the change\\.`,
    ),
  );
  await b.page.click('#igo');
  await until(async () => /Imported: added/.test(await b.text('#bkmsg')), { what: 'merged' });
  assert.equal(fs.entries(OTHER).length, x.entries.length + 1, 'existing entry kept');
  assert.equal(fs.family(OTHER)?.settings, undefined, 'Merge leaves settings alone');

  // Replace: the first confirmation is cancelled (nothing changes), then confirmed
  await importFile(b, file);
  await until(() => b.page.locator('#idlg').evaluate((d) => d.open));
  assert.match(await b.text('#iwhat'), /Everything in this file is already here/);
  assert.equal(await b.page.locator('#igo').isDisabled(), true);
  await b.page.check('input[name=imode][value=replace]');
  assert.match(await b.text('#iwhat'), new RegExp(`Deletes all ${x.entries.length + 1} entries`));
  assert.equal(await b.text('#igo'), 'Replace…');
  b.answers.push(false);
  await b.page.click('#igo');
  assert.equal(fs.entries(OTHER).length, x.entries.length + 1);
  await b.page.click('#igo');
  assert.match(b.dialogs.at(-1).message, /Really replace the whole log/);
  await until(async () => /Replaced the log/.test(await b.text('#bkmsg')), { what: 'replaced' });
  assert.equal(fs.entries(OTHER).length, x.entries.length);
  assert.ok(!fs.entries(OTHER).some((e) => e.id === 'mine1'));
  assert.deepEqual(fs.family(OTHER).settings, { targetNaps: 3, bedtime: '19:15' });

  // a broken file: refused, nothing written
  const writes = fs.writes.length;
  const bad = file + '.bad.json';
  nodeFs.writeFileSync(bad, JSON.stringify({ ...x, entries: [{ ...x.entries[0], id: '<img src=x>' }] }));
  await importFile(b, bad);
  await until(async () => /Nothing was imported/.test(await b.text('#bkmsg')), { what: 'refused' });
  assert.equal(await b.page.locator('#idlg').evaluate((d) => d.open), false);
  assert.equal(fs.writes.length, writes);
  await done();
});

test('export and import in local-only mode', async () => {
  const p = await phone({
    now: at(D0, 0, 12, 0),
    storage: { entries: madeUpHistory(D0, 4), settings: S3, family: '' },
  });
  await p.page.click('#cog');
  const [dl] = await Promise.all([p.page.waitForEvent('download'), p.page.click('#bkexp')]);
  const file = await dl.path();
  const x = JSON.parse(nodeFs.readFileSync(file, 'utf8'));
  assert.equal(x.entries.length, 17);
  await p.page.evaluate(() => localStorage.setItem('nap-log.entries', '[]'));
  await p.page.reload();
  await p.page.click('#cog');
  await importFile(p, file);
  await until(() => p.page.locator('#idlg').evaluate((d) => d.open));
  assert.doesNotMatch(await p.text('#iwhat'), /Both phones/);
  await p.page.click('#igo');
  await until(async () => (await p.storage('entries')).length === 17, { what: 'imported locally' });
  await done();
});

test('notifications box behind the bell', async () => {
  const p = await phone({ now: at(D0, 0, 12, 0) });
  assert.equal(await p.page.locator('#bell').getAttribute('class'), 'cog');
  await p.page.click('#bell');
  assert.equal(await p.page.locator('#ndlg').evaluate((d) => d.open), true);
  assert.match(await p.text('#pushstat'), /Needs sharing: add the family code in Settings/);
  assert.equal(await p.page.locator('#pushbtn').isDisabled(), true);
  await p.page.click('#nclose');
  assert.equal(await p.page.locator('#ndlg').evaluate((d) => d.open), false);
  await done();
});

test('iPhone in the browser: notifications need the home-screen app', async () => {
  const p = await phone({ now: at(D0, 0, 12, 0), device: 'iPhone 13' });
  await p.page.click('#bell');
  assert.match(await p.text('#pushstat'), /On iPhone, open the app from its home-screen icon first/);
  await done();
});

test('swiping changes tabs', async () => {
  const p = await phone({ now: at(D0, 0, 12, 0), storage: { entries: madeUpHistory(D0, 3), settings: S3 } });
  const swipe = (x0, x1) =>
    p.page.evaluate(
      ([x0, x1]) => {
        const t = (x) => [new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 })];
        document.body.dispatchEvent(new TouchEvent('touchstart', { touches: t(x0), bubbles: true }));
        for (let i = 1; i <= 5; i++)
          document.body.dispatchEvent(
            new TouchEvent('touchmove', { touches: t(x0 + ((x1 - x0) * i) / 5), bubbles: true }),
          );
        document.body.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
      },
      [x0, x1],
    );
  await swipe(300, 100);
  assert.equal(await p.page.locator('#v-hist').isVisible(), true);
  await swipe(300, 100);
  assert.equal(await p.page.locator('#v-stats').isVisible(), true);
  await swipe(100, 300);
  await swipe(100, 300);
  assert.equal(await p.page.locator('#v-today').isVisible(), true);
  await done();
});

test('works offline from the service worker; Check for updates', async () => {
  const p = await phone({
    now: at(D0, 0, 12, 0),
    serviceWorkers: 'allow',
    storage: { entries: madeUpHistory(D0, 3), settings: S3 },
  });
  await p.page.evaluate(() => navigator.serviceWorker.ready);
  await until(() => p.page.evaluate(() => !!navigator.serviceWorker.controller) || p.page.reload().then(() => false), {
    what: 'controlled',
    timeout: 8000,
  });
  const keys = await p.page.evaluate(() => caches.keys());
  assert.ok(keys.length && keys.every((k) => k.startsWith('nap-log-')), keys.join());
  await p.page.click('#cog');
  await p.page.click('#updbtn');
  await until(async () => /latest version/.test(await p.text('#updmsg')), { what: 'update check' });
  assert.equal(await p.text('#updmsg'), `You're on the latest version (${await p.text('#ver')}).`);
  await p.page.click('#scancel');
  await p.context.setOffline(true);
  await p.page.reload();
  await p.page.waitForFunction(() => document.querySelector('#plan')?.textContent.includes('Nap 1'));
  assert.match(await p.row('Nap 1').innerText(), /~/);
  await p.context.setOffline(false);
  await done();
});

// Opening the app must not wait for the server (one round trip per file made it slow after the split into files),
// and a new release must still reach the phone by itself. Runs on a copy of the app so the test can "release" one.
test('opens from the phone without downloading the app; a new release takes over by itself', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const root = new URL('../..', import.meta.url).pathname;
  const copy = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'nap-log-release-'));
  nodeFs.cpSync(root, copy, { recursive: true, filter: (f) => !/[/\\](\.git|node_modules|tests)([/\\]|$)/.test(f) });
  const own = await startServer(copy);
  const asked = [];
  own.server.on('request', (r) => asked.push(new URL(r.url, 'http://x').pathname.replace('/nap-log/', '')));
  try {
    const p = await openPhone(own.base, {
      now: at(D0, 0, 12, 0),
      serviceWorkers: 'allow',
      storage: { entries: madeUpHistory(D0, 3), settings: S3 },
    });
    phones.push(p);
    await p.page.evaluate(() => navigator.serviceWorker.ready);
    await until(
      () => p.page.evaluate(() => !!navigator.serviceWorker.controller) || p.page.reload().then(() => false),
      {
        what: 'controlled',
        timeout: 8000,
      },
    );
    await p.page.reload(); // anything not saved at install (icons) is kept from here on
    await p.page.waitForFunction(() => document.querySelector('#hero')?.innerHTML.length > 0);
    asked.length = 0;
    await p.page.reload();
    await p.page.waitForFunction(() => document.querySelector('#hero')?.innerHTML.length > 0);
    const appFiles = asked.filter((u) => /(^|\.html|\.js|\.css)$/.test(u) && u !== 'sw.js');
    assert.deepEqual(appFiles, [], 'opening the app downloaded app files');
    const ver = await p.text('#ver');

    // "release" a new version on the server: only the version changes, like a real release
    const swFile = path.join(copy, 'sw.js'),
      cfg = path.join(copy, 'js/version.js');
    const next = '99.' + (Date.now() % 1000);
    nodeFs.writeFileSync(swFile, nodeFs.readFileSync(swFile, 'utf8').replace(/C=P\+'v[\d.]+'/, `C=P+'v${next}'`));
    nodeFs.writeFileSync(
      cfg,
      nodeFs.readFileSync(cfg, 'utf8').replace(/const VER = '[\d.]+';/, `const VER = '${next}';`),
    );
    await p.page.reload(); // the phone opens the app as usual: still the old version, the new one installs meanwhile
    await until(async () => (await p.text('#ver').catch(() => '')) === 'v' + next, {
      what: `the app reloads into v${next} by itself (was ${ver})`,
      timeout: 10000,
    });
    const keys = await p.page.evaluate(() => caches.keys());
    assert.deepEqual(keys, ['nap-log-v' + next], 'only the new version is kept');
    await done();
  } finally {
    own.server.close();
    nodeFs.rmSync(copy, { recursive: true, force: true });
  }
});

test('a suggested extra nap can be added from its row and from the ring', async () => {
  const E = [
    ...madeUpHistory(D0, 10),
    { id: 'x1', type: 'nap', start: at(D0, 0, 8, 30), end: at(D0, 0, 9, 0) },
    { id: 'x2', type: 'nap', start: at(D0, 0, 12, 0), end: at(D0, 0, 12, 30) },
  ];
  const p = await phone({ now: at(D0, 0, 14, 40), storage: { entries: E, settings: S3 } });
  assert.match(await p.row('Extra nap\\?').innerText(), /short naps today\s+＋ Add/);
  await p.row('Extra nap\\?').click();
  assert.equal((await p.storage('extra')).n, 1);
  assert.equal(await p.row('Nap 4').count(), 1);
  await p.page.getByRole('button', { name: '− Remove extra nap' }).click();
  assert.equal(await p.row('Extra nap\\?').count(), 1);
  await p.page.locator('#hero svg g.hit:has(.sugx)').dispatchEvent('click');
  assert.equal((await p.storage('extra')).n, 1);
  await done();
});

test('the last nap can be resumed from its row and from the ring, earlier ones cannot', async () => {
  const E = [
    ...madeUpHistory(D0, 10),
    { id: 'td1', type: 'nap', start: at(D0, 0, 8, 30), end: at(D0, 0, 9, 20) },
    { id: 'td2', type: 'nap', start: at(D0, 0, 11, 30), end: at(D0, 0, 11, 40) },
  ];
  const p = await phone({ now: at(D0, 0, 11, 50), storage: { entries: E, settings: S3 } });
  await p.row('Nap 1').click();
  assert.equal(await p.page.isVisible('#eresume'), false, 'not the last one');
  await p.page.click('#ecancel');
  // the last nap, from the ring (its arc on the dial)
  await p.page.locator('#hero svg [data-id="td2"]').first().dispatchEvent('click');
  assert.equal(await p.text('#dt'), 'Nap · 10-14');
  assert.equal(await p.page.isVisible('#eresume'), true);
  await p.page.click('#eresume');
  assert.equal(await p.text('#nowbtns'), 'End nap');
  assert.match(await p.text('#hero'), /Asleep for/);
  const td2 = (await p.storage('entries')).find((e) => e.id === 'td2');
  assert.deepEqual([td2.start, td2.end], [at(D0, 0, 11, 30), null], 'the same nap, running again');
  // while it runs, nothing else offers Resume
  await p.row('Nap 1').click();
  assert.equal(await p.page.isVisible('#eresume'), false);
  await p.page.click('#ecancel');
  await p.setTime(at(D0, 0, 12, 30));
  await p.page.getByRole('button', { name: 'End nap' }).click();
  assert.match(await p.row('Nap 2').innerText(), /11:30–12:30\s+1h\s00m/);
  assert.equal((await p.storage('entries')).length, E.length, 'no new entry');
  await done();
});

test('the night can be resumed from the sun on the ring until the first nap', async () => {
  const p = await phone({ now: at(D0, 0, 7, 30), storage: { entries: madeUpHistory(D0, 10), settings: S3 } });
  await p.page.locator('#hero svg g.hit:has(circle[r="19"])').first().dispatchEvent('click'); // the sun
  assert.equal(await p.text('#dt'), 'Night sleep · 10-13');
  await p.page.click('#eresume');
  assert.equal(await p.text('#nowbtns'), 'Wake up');
  const night = (await p.storage('entries')).find((e) => e.type === 'night' && e.start >= at(D0, -1, 12, 0));
  assert.equal(night.end, null);
  await p.setTime(at(D0, 0, 8, 0));
  await p.page.getByRole('button', { name: 'Wake up' }).click();
  assert.match(await p.row('Wake-up').innerText(), /08:00/);
  // once a nap is logged, the night is no longer the last entry
  await p.page.getByRole('button', { name: 'Start nap' }).click();
  await p.setTime(at(D0, 0, 8, 40));
  await p.page.getByRole('button', { name: 'End nap' }).click();
  await p.row('Wake-up').click();
  assert.equal(await p.page.isVisible('#eresume'), false);
  await p.page.click('#ecancel');
  await done();
});

test('the sun on the ring logs an unlogged wake-up', async () => {
  const p = await phone({
    now: at(D0, 0, 7, 0),
    storage: { entries: madeUpHistory(D0, 10, { noLastNight: true }), settings: S3 },
  });
  await p.page.locator('#hero svg g.hit:has(circle[r="19"])').first().dispatchEvent('click');
  assert.equal(await p.text('#dt'), 'Last night · bedtime and wake-up');
  await p.page.click('#ecancel');
  await done();
});

// the nights the clocks change are 25 hours (October) and 23 hours (March) long: a typed wake-up must stay the typed time
for (const [name, y, m, d] of [
  ['autumn', 2026, 9, 25],
  ['spring', 2026, 2, 29],
]) {
  test(`${name} clock change: a typed wake-up is saved at the typed time`, async () => {
    const day = new Date(y, m, d).getTime();
    const E = [
      ...madeUpHistory(day, 7, { noLastNight: true }),
      { id: 'cc', type: 'night', start: at(day, -1, 19, 30), end: at(day, 0, 6, 30) },
    ];
    const p = await phone({ now: at(day, 0, 7, 0), storage: { entries: E, settings: S3 } });
    await p.row('Wake-up').click();
    await p.page.fill('#ee', '06:10');
    await p.page.click('#esave');
    const n = (await p.storage('entries')).find((e) => e.id === 'cc');
    assert.equal(n.end, new Date(y, m, d, 6, 10).getTime());
    assert.equal((await p.row('Wake-up').innerText()).replace(/\s+/g, ' '), 'Wake-up 06:10');
    await done();
  });
}

test('after a long nap the plan shortens the naps still to come and says by how much', async () => {
  // made-up history: naps of 60, 80 and 40 min a day; today nap 1 lasted 120 min
  const E = [...madeUpHistory(D0, 10), { id: 'long1', type: 'nap', start: at(D0, 0, 8, 30), end: at(D0, 0, 10, 30) }];
  const p = await phone({ now: at(D0, 0, 11, 0), storage: { entries: E, settings: S3 } });
  assert.match(await p.row('Nap 2').innerText(), /\(−32m\)/);
  assert.match(await p.row('Nap 3').innerText(), /\(−16m\)/);
  await done();
});

test('a night logged twice counts once (plan, export)', async () => {
  const fs = new FakeFirestore();
  const H = madeUpHistory(D0, 10);
  const dup = { ...H.find((e) => e.id === 'hn3'), id: 'imported-copy' }; // same night, another id
  fs.seedEntries(FAMILY, [...H, dup]);
  fs.seedDoc('families/' + FAMILY, { settings: S3 });
  const p = await phone({ fs, now: at(D0, 0, 12, 0), storage: { family: FAMILY } });
  await until(async () => (await p.text('#sync')) === 'shared');
  await p.page.click('#cog');
  const [dl] = await Promise.all([p.page.waitForEvent('download'), p.page.click('#bkexp')]);
  const x = JSON.parse(nodeFs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(x.entries.length, H.length, 'exported once');
  assert.equal(x.entries.filter((e) => e.start === dup.start && e.type === 'night').length, 1);
  await done();
});

test('Statistics plots how far off the plan was', async () => {
  // made-up: the last 7 days have saved predictions that were 10 min early and 20 min short of each nap and night
  const withPred = madeUpHistory(D0, 10).map((e) =>
    e.start >= at(D0, -7, 0) ? { ...e, pred: { s: e.start - 10 * MIN, len: (e.end - e.start) / MIN - 20 } } : e,
  );
  const p = await phone({ now: at(D0, 0, 12, 0), storage: { entries: withPred, settings: S3 } });
  await p.page.click('#t-stats');
  const chart = p.page.locator('#stats .chart[data-k=errors]');
  assert.equal(await chart.locator('h2').innerText(), 'How far off the plan was');
  assert.match(await chart.locator('.csub').innerText(), /Lower is better/);
  assert.deepEqual(
    (await chart.locator('.leg2 .lg').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
    ['Nap start 10 min (21)', 'Nap length 20 min (21)', 'Bedtime 10 min (7)', 'Wake-up 20 min (6)'],
  );
  assert.equal(await chart.locator('svg path[stroke]').count(), 4, 'four curves');
  const svg = chart.locator('svg');
  const box = await svg.boundingBox();
  await svg.dispatchEvent('pointermove', { clientX: box.x + box.width - 5, clientY: box.y + 20 });
  assert.match(await chart.locator('.tip').innerText(), /Nap start\s*10 min/);
  assert.equal(await p.page.locator('#stats .acc').count(), 0, 'the old table is gone');
  await done();
});

test('tapping a legend name shows only that line and fits the axis; tapping it again shows all', async () => {
  const p = await phone({ now: at(D0, 0, 12, 0), storage: { entries: madeUpHistory(D0, 10), settings: S3 } });
  await p.page.click('#t-stats');
  const chart = () => p.page.locator('#stats .chart[data-k=start]');
  const axis = async () =>
    (
      await chart()
        .locator('svg text[text-anchor=end]')
        .evaluateAll((t) => t.map((x) => x.textContent))
    ).filter((t) => t.includes(':'));
  const allAxis = await axis();
  assert.equal(await chart().locator('svg path[stroke]').count(), 4, 'three naps and bedtime');
  await chart()
    .getByRole('button', { name: /^Bedtime/ })
    .click();
  assert.equal(await chart().locator('svg path[stroke]').count(), 1);
  assert.equal(await chart().locator('svg path[stroke]').getAttribute('stroke'), '#d55181');
  const bedAxis = await axis();
  assert.ok(bedAxis.length >= 2 && bedAxis[0] >= '18:00', 'the axis fits bedtime only: ' + bedAxis);
  assert.notDeepEqual(bedAxis, allAxis);
  assert.equal(await chart().locator('.lg.off').count(), 3, 'the others are dimmed, still tappable');
  assert.equal(
    await chart()
      .getByRole('button', { name: /^Bedtime/ })
      .getAttribute('aria-pressed'),
    'true',
  );
  // another name switches to it; the same name again shows all
  await chart()
    .getByRole('button', { name: /^Nap 1/ })
    .click();
  assert.equal(await chart().locator('svg path[stroke]').getAttribute('stroke'), '#3987e5');
  await chart()
    .getByRole('button', { name: /^Nap 1/ })
    .click();
  assert.equal(await chart().locator('svg path[stroke]').count(), 4);
  assert.deepEqual(await axis(), allAxis);
  // the stacked day chart: one part on its own, with an axis in hours fitted to it
  const day = p.page.locator('#stats .chart[data-k=day]');
  await day.getByRole('button', { name: /^Naps/ }).click();
  assert.equal(new Set(await day.locator('svg rect').evaluateAll((r) => r.map((x) => x.getAttribute('fill')))).size, 1);
  const hours = (await day.locator('svg text[text-anchor=end]').evaluateAll((t) => t.map((x) => x.textContent))).at(-1);
  assert.ok(parseInt(hours) < 24, 'fitted, not the whole day: ' + hours);
  await done();
});

test('a copy at another address runs on its own until its settings are filled in', async () => {
  const fs = new FakeFirestore();
  const p = await phone({
    fs,
    now: at(D0, 0, 12, 0),
    address: 'https://a-friend.github.io/nap-log/',
    storage: { entries: madeUpHistory(D0, 3), settings: S3, family: 'their made-up code' },
  });
  assert.equal(await p.page.evaluate(() => location.origin), 'https://a-friend.github.io');
  assert.equal(
    await p.text('#sync'),
    'local only',
    'the family code is ignored: the settings are not for this address',
  );
  assert.match(await p.row('Nap 1').innerText(), /\d\d:\d\d/);
  assert.deepEqual(Object.keys(fs.docs), [], "nothing was written to the original's Firebase project");
  await p.page.click('#bell');
  assert.equal(await p.text('#pushstat'), 'Reminders are not set up in this copy of Nap Log.');
  await done();
});

// The settings files a parent's Claude writes when following SETUP.md, at the parent's own address.
const FRIEND = 'https://a-friend.github.io/nap-log/';
const level1Config = () =>
  nodeFs
    .readFileSync(new URL('../../SETUP.md', import.meta.url), 'utf8')
    .match(/```js\n([\s\S]*?const VAPID_PUBLIC = null;)\n\s*```/)[1]
    .replace(/^ {3}/gm, '')
    .replace('USERNAME', 'a-friend');

test('SETUP.md level 1: a copy with its own address and no sharing works on one phone', async () => {
  const fs = new FakeFirestore();
  const config = level1Config();
  assert.match(config, /APP_ADDRESS = 'https:\/\/a-friend\.github\.io\/nap-log\/'/);
  const p = await phone({ fs, now: at(D0, 0, 8, 30), address: FRIEND, config, storage: { settings: S3 } });
  assert.equal(await p.text('#sync'), 'local only');
  await p.page.getByRole('button', { name: 'Start nap' }).click();
  assert.equal(await p.text('#nowbtns'), 'End nap');
  assert.equal((await p.storage('entries')).length, 1, 'the nap is kept on the phone');
  await p.page.click('#bell');
  assert.equal(await p.text('#pushstat'), 'Reminders are not set up in this copy of Nap Log.');
  assert.deepEqual(Object.keys(fs.docs), []);
  await done();
});

test('SETUP.md level 2: a copy with its own Firebase project shares between two phones', async () => {
  const fs = new FakeFirestore();
  const config = level1Config().replace(
    'const FIREBASE_CONFIG = null;',
    "const FIREBASE_CONFIG = { apiKey: 'made-up-key', authDomain: 'friend-naps.firebaseapp.com', projectId: 'friend-naps', appId: '1:2:web:3' };",
  );
  const opts = { fs, now: at(D0, 0, 8, 30), address: FRIEND, config, storage: { settings: S3, family: FAMILY } };
  const a = await phone(opts);
  const b = await phone({ ...opts, device: 'iPhone 13' });
  for (const p of [a, b]) await until(async () => (await p.text('#sync')) === 'shared', { what: 'shared' });
  assert.equal(
    await a.page.evaluate(() => firebase.apps[0].options.projectId),
    'friend-naps',
    "the copy's own project",
  );
  await a.page.getByRole('button', { name: 'Start nap' }).click();
  await until(async () => (await b.text('#nowbtns')) === 'End nap', { what: 'B sees the nap' });
  assert.equal(fs.entries(FAMILY).length, 1);
  await done();
});
