// ONE-TIME import of past naps/nights into the shared family log. Deleted right after it has run.
import { readFileSync } from 'node:fs';
const PROJECT = 'nap-log-78cb6', KEY = 'AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4';
const ROOT = process.env.FS_ROOT || 'https://firestore.googleapis.com/v1';
const code = process.env.FAMILY_CODE;
if (!code) { console.error('Missing FAMILY_CODE secret'); process.exit(1); }
const data = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));
const db = `projects/${PROJECT}/databases/(default)/documents`;
let done = 0;
for (let i = 0; i < data.length; i += 100) {
  const writes = data.slice(i, i + 100).map(e => ({ update: {
    name: `${db}/families/${encodeURIComponent(code)}/entries/${e.id}`,
    fields: { id: { stringValue: e.id }, type: { stringValue: e.type }, start: { integerValue: String(e.start) }, end: { integerValue: String(e.end) } },
  } }));
  const r = await fetch(`${ROOT}/${db}:commit?key=${KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (!r.ok) { console.error('Write failed, HTTP ' + r.status); process.exit(1); }
  done += writes.length;
}
console.log(`Imported ${done} entries.`);
