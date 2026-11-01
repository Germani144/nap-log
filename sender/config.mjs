// The push sender's settings come from the app's own js/config.js, so a copy of the app (a fork) only edits that one
// file: its address (APP_ADDRESS), its Firebase project (FIREBASE_CONFIG) and its public push key (VAPID_PUBLIC).
import fs from 'node:fs';
import vm from 'node:vm';

// js/config.js is a plain script with three constants; run it in an empty sandbox and read them
export function readAppConfig(file) {
  const code = fs.readFileSync(file, 'utf8');
  return vm.runInNewContext(
    code +
      '\n;({ APP_ADDRESS: typeof APP_ADDRESS === "undefined" ? null : APP_ADDRESS, FIREBASE_CONFIG: typeof FIREBASE_CONFIG === "undefined" ? null : FIREBASE_CONFIG, VAPID_PUBLIC: typeof VAPID_PUBLIC === "undefined" ? null : VAPID_PUBLIC })',
    {},
  );
}

// the GitHub Pages address of a repository "Owner/name": https://owner.github.io/name/ (or the site root for a
// repository named owner.github.io). GitHub Actions passes it as GITHUB_REPOSITORY.
export function pagesAddress(repository) {
  const [owner, name] = String(repository || '').split('/');
  if (!owner || !name) return null;
  const host = owner.toLowerCase() + '.github.io';
  return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}
