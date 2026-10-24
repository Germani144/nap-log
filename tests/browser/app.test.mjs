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
import { startServer, openPhone, FakeFirestore, madeUpHistory, at, until, closeBrowser, H, MIN, DAY } from './harness.mjs';

const D0 = new Date(2026, 9, 14).getTime(); // "today": Wednesday 14 Oct 2026, local midnight (Copenhagen)
const S3 = { targetNaps: 3, bedtime: '19:30' };
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
const lines = (s) => s.replace(/\u00a0/g, ' ').split('\n').map((x) => x.trim()).filter(Boolean);

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
    'Wake-up', '06:30',
    'Nap 1', '~08:30–09:30  1h 00m', 'awake 2h 00m first',
    'Nap 2', '~12:00–13:20  1h 20m', 'awake 2h 30m first',
    'Nap 3', '~16:00–16:40  40m', 'awake 2h 40m first',
    'Bedtime', '~19:34', 'target 19:30 (+4m) · awake 2h 54m',
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
  assert.equal(await p.page.evaluate(() => document.activeElement?.tagName), 'H2', 'no time field focused (no keyboard)');
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
  assert.deepEqual([await p.text('#dt'), await p.text('#esl'), await p.text('#eel')], ['Log bedtime · 10-08', 'Bedtime', 'Wake-up']);
  await p.page.fill('#es', '19:45');
  await p.page.fill('#ee', '06:20');
  await p.page.click('#esave');
  const n = (await p.storage('entries')).find((e) => e.type === 'night' && e.start === at(D0, -6, 19, 45));
  assert.equal(n.end, at(D0, -5, 6, 20), 'the wake-up is the next morning');
  assert.match(await p.text('#day'), /Bedtime\s+19:45/);
  await done();
});

test('an unlogged wake-up can be set from the plan and the ring', async () => {
  const E = [...madeUpHistory(D0, 10, { noLastNight: true }), { id: 'td1', type: 'nap', start: at(D0, 0, 6, 40), end: at(D0, 0, 7, 28) }];
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

test('sharing: two phones see each other\'s naps, settings and extra naps', async () => {
  const fs = new FakeFirestore();
  fs.seedEntries(FAMILY, madeUpHistory(D0, 10));
  fs.docs['families/' + FAMILY] = { settings: S3 };
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
  assert.ok(f.notifyKey && f.notifyAt === f.notifyEvent - 30 * MIN && /^Nap \d$/.test(f.notifyLabel), JSON.stringify(f));
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
  assert.equal(await p.page.locator('#stats .chart').count(), 5);
  assert.deepEqual(await p.page.locator('#stats .chart h2').allInnerTexts(), ['When she falls asleep', 'When she wakes up', 'How long naps last', 'Night sleep', 'Her day']);
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
  fs.docs['families/' + FAMILY] = { settings: { targetNaps: 3, bedtime: '19:15' } };
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
  assert.match(await b.text('#iprev'), new RegExp(`^${x.entries.length} entries \\(\\d+ naps, \\d+ nights\\), \\d+ \\w+ 2026 to 13 Oct 2026\\.`));
  assert.match(await b.text('#iwhat'), new RegExp(`Adds ${x.entries.length} new entries\\. Settings are not changed\\. Both phones will see the change\\.`));
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
  const p = await phone({ now: at(D0, 0, 12, 0), storage: { entries: madeUpHistory(D0, 4), settings: S3, family: '' } });
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
    p.page.evaluate(([x0, x1]) => {
      const t = (x) => [new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 })];
      document.body.dispatchEvent(new TouchEvent('touchstart', { touches: t(x0), bubbles: true }));
      for (let i = 1; i <= 5; i++) document.body.dispatchEvent(new TouchEvent('touchmove', { touches: t(x0 + ((x1 - x0) * i) / 5), bubbles: true }));
      document.body.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
    }, [x0, x1]);
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
  const p = await phone({ now: at(D0, 0, 12, 0), serviceWorkers: 'allow', storage: { entries: madeUpHistory(D0, 3), settings: S3 } });
  await p.page.evaluate(() => navigator.serviceWorker.ready);
  await until(() => p.page.evaluate(() => !!navigator.serviceWorker.controller) || p.page.reload().then(() => false), { what: 'controlled', timeout: 8000 });
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
