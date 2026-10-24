// Drawing helpers for the day ring (SVG) and the plan rows.

// ---------- day dial ----------
// The ring is the day: wake-up (sun) to bedtime (moon) along a 290 degree arc. Angles are degrees clockwise from the top.
const GR = 128,
  GST = 215,
  GSW = 290,
  GHW = 15,
  GFONT = "'Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',sans-serif",
  GSANS = "'Hanken Grotesk',system-ui,sans-serif";
const f1 = (n) => n.toFixed(1);
const gpt = (r, t) => {
  const a = (t * Math.PI) / 180;
  return [150 + r * Math.sin(a), 150 - r * Math.cos(a)];
};
const garc = (r, t1, t2, sw = 1) => {
  const p = gpt(r, t2);
  return `A${r} ${r} 0 ${Math.abs(t2 - t1) > 180 ? 1 : 0} ${sw} ${f1(p[0])} ${f1(p[1])}`;
};
const gline = (t1, t2, col, w) => {
  if (t2 - t1 < 0.05) return '';
  const p = gpt(GR, t1);
  return `<path d="M${f1(p[0])} ${f1(p[1])} ${garc(GR, t1, t2)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
};
// The outline of a capsule between two angles (half-height hw), or a circle when it is too short; attrs styles it.
function gshape(t1, t2, hw, attrs) {
  const px = (GR * (t2 - t1) * Math.PI) / 180;
  if (px < 2 * hw) {
    const p = gpt(GR, (t1 + t2) / 2);
    return `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${hw}"${attrs}/>`;
  }
  const d0 = ((hw / GR) * 180) / Math.PI,
    a1 = t1 + d0,
    a2 = t2 - d0,
    o1 = gpt(GR + hw, a1),
    i2 = gpt(GR - hw, a2);
  return `<path d="M${f1(o1[0])} ${f1(o1[1])} ${garc(GR + hw, a1, a2)} A${hw} ${hw} 0 0 1 ${f1(i2[0])} ${f1(i2[1])} ${garc(GR - hw, a2, a1, 0)} A${hw} ${hw} 0 0 1 ${f1(o1[0])} ${f1(o1[1])}Z"${attrs}/>`;
}
// A suggested extra nap: a faint, gently pulsing dashed bubble with a plus, tap to add it to the plan.
const gextra = (t1, t2) => {
  const p = gpt(GR, (t1 + t2) / 2);
  return `<g class="sugx">${gshape(t1, t2, GHW, ' fill="#1F2358" stroke="#FFB547" stroke-opacity=".7" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"')}<text x="${f1(p[0])}" y="${f1(p[1] + 7)}" text-anchor="middle" font-family="${GSANS}" font-weight="600" font-size="22" fill="#FFB547">+</text></g>`;
};
// A nap bar between two angles. Rule: the bar is only drawn as a capsule when it is at least 30px long; anything shorter
// is a dot. The 💤 is full size from 38px and small (13px, which fits inside the 30px dot) below that, so every nap is
// recognisable as a nap and the emoji never spills outside it.
function gcap(t1, t2, dashed) {
  const px = (GR * (t2 - t1) * Math.PI) / 180,
    fill = dashed ? '#1F2358' : '#9C96F2',
    st = dashed ? ' stroke="#FFB547" stroke-width="2.2" stroke-dasharray="4 4"' : '',
    mid = (t1 + t2) / 2;
  const zz = (sz, dy) => {
    const p = gpt(GR, mid);
    return `<text x="${f1(p[0])}" y="${f1(p[1] + dy)}" text-anchor="middle" font-size="${sz}" font-family="${GFONT}" filter="url(#${dashed ? 'zza' : 'zzd'})">💤</text>`;
  };
  if (px < 30) {
    const p = gpt(GR, mid);
    return `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${GHW}" fill="${fill}"${st}/>` + zz(13, 4.6);
  } // a short nap: a dot with a small 💤 that fits inside it
  const d0 = ((GHW / GR) * 180) / Math.PI,
    a1 = t1 + d0,
    a2 = t2 - d0,
    o1 = gpt(GR + GHW, a1),
    i2 = gpt(GR - GHW, a2);
  let s = `<path d="M${f1(o1[0])} ${f1(o1[1])} ${garc(GR + GHW, a1, a2)} A${GHW} ${GHW} 0 0 1 ${f1(i2[0])} ${f1(i2[1])} ${garc(GR - GHW, a2, a1, 0)} A${GHW} ${GHW} 0 0 1 ${f1(o1[0])} ${f1(o1[1])}Z" fill="${fill}"${st}/>`;
  s += px >= 38 ? zz(17, 6) : zz(13, 4.6);
  return s;
}
const gsun = (x, y, c) =>
  `<g transform="translate(${f1(x - 10)} ${f1(y - 10)})" stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none"><circle cx="10" cy="10" r="3.6" fill="${c}" stroke="none"/><path d="M10 2.2v2.4M10 15.4v2.4M2.2 10h2.4M15.4 10h2.4M4.5 4.5l1.7 1.7M13.8 13.8l1.7 1.7M4.5 15.5l1.7-1.7M13.8 6.2l1.7-1.7"/></g>`;
const gmoon = (x, y, c) =>
  `<g transform="translate(${f1(x - 9)} ${f1(y - 9)}) scale(.9)"><path d="M13.5 3a8 8 0 1 0 3.5 14 6.5 6.5 0 0 1-3.5-14z" fill="${c}"/></g>`;
const gdisc = (t, icon, col, dash) => {
  const p = gpt(GR, t);
  return (
    `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="19" fill="#1F2358" stroke="${col}" stroke-width="2.5"${dash ? ' stroke-dasharray="4 3.5"' : ''}/>` +
    icon(p[0], p[1], col)
  );
};
const gtext = (x, y, t, col, w, sz) =>
  `<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-family="${GSANS}" font-weight="${w || 600}" font-size="${sz || 13}" fill="${col}">${t}</text>`;
const gunder = (t, txt, col) => {
  const p = gpt(GR, t);
  return gtext(p[0], p[1] + 38, txt, col);
};
// text written along the ring, rotated to follow it with the bottom of the letters always facing the ring
const gtan = (t, txt) => {
  const p = gpt(GR + GHW + 13, t),
    rot = ((t % 360) + 360) % 360;
  return `<text x="${f1(p[0])}" y="${f1(p[1])}" transform="rotate(${f1(rot)} ${f1(p[0])} ${f1(p[1])})" text-anchor="middle" dominant-baseline="central" font-family="${GSANS}" font-weight="600" font-size="12" fill="#FFB547" opacity=".85">${txt}</text>`;
};
const gnow = (t, txt) => {
  const p = gpt(GR + 34, t);
  return gtext(p[0], p[1] + 4, txt, '#FFB547', 700, 12.5);
};
const GDEFS =
  '<defs><linearGradient id="cool" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8C86EE"/><stop offset="1" stop-color="#C4BFFF"/></linearGradient></defs>';
const IC = {
  sun: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#14163A" stroke-width="2.2" stroke-linecap="round"><circle cx="10" cy="10" r="3.4" fill="#14163A" stroke="none"/><path d="M10 1.8v2.6M10 15.6v2.6M1.8 10h2.6M15.6 10h2.6M4.2 4.2l1.8 1.8M14 14l1.8 1.8M4.2 15.8L6 14M14 6l1.8-1.8"/></svg>',
  check:
    '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#14163A" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>',
  moon: '<svg width="13" height="13" viewBox="0 0 20 20"><path d="M13.5 3a8 8 0 1 0 3.5 14 6.5 6.5 0 0 1-3.5-14z" fill="#14163A"/></svg>',
  sunA: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#FFB547" stroke-width="2.2" stroke-linecap="round"><circle cx="10" cy="10" r="3.4" fill="#FFB547" stroke="none"/><path d="M10 1.8v2.6M10 15.6v2.6M1.8 10h2.6M15.6 10h2.6M4.2 4.2l1.8 1.8M14 14l1.8 1.8M4.2 15.8L6 14M14 6l1.8-1.8"/></svg>',
  moonA:
    '<svg width="12" height="12" viewBox="0 0 20 20"><path d="M13.5 3a8 8 0 1 0 3.5 14 6.5 6.5 0 0 1-3.5-14z" fill="#FFB547"/></svg>',
};
// one timeline row: node icon, label, right-hand details
const tlRow = (icon, cls, t, r, action, k) =>
  `<div class="it${action ? ' tap' : ''}"${k ? ` data-k="${k}"` : ''}${action || ''}><div class="nd ${cls || ''}">${icon}</div><span class="t">${t}</span><span class="r">${r}</span></div>`;
