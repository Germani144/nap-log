// Switching tabs, by tapping or swiping.

function setTab(t) {
  tab = t;
  $('#v-today').hidden = t !== 'today';
  $('#v-hist').hidden = t !== 'hist';
  $('#v-stats').hidden = t !== 'stats';
  $('#t-today').classList.toggle('on', t === 'today');
  $('#t-hist').classList.toggle('on', t === 'hist');
  $('#t-stats').classList.toggle('on', t === 'stats');
  if (t === 'hist') {
    ensureMonth();
    renderHistory();
  } else if (t === 'stats') {
    ensureRecent();
    renderStats();
  } else drawDaySpan();
  window.scrollTo(0, 0);
}
// swipe left/right to change tab, with live feedback: the page follows the finger, a label names the next tab,
// and it lights up once the swipe is long enough to switch.
const SWT = ['today', 'hist', 'stats'],
  SWN = { today: 'Today', hist: 'History', stats: 'Statistics' },
  SWTH = 70;
const swPane = () => $('#v-' + tab);
const swBtn = (k) => $('#t-' + k);
let sw = null;
function swReset() {
  const p = sw && sw.p;
  if (p) {
    p.style.transition = 'transform .18s,opacity .18s';
    p.style.transform = '';
    p.style.opacity = '';
  }
  $('#swh')?.remove();
  SWT.forEach((k) => swBtn(k)?.classList.remove('nx'));
  sw = null;
}
document.addEventListener(
  'touchstart',
  (e) => {
    sw = null;
    if (e.touches.length !== 1 || !(!$('#dlg').open && !e.target.closest('input,select,textarea,dialog,.chart svg')))
      return;
    const t = e.touches[0];
    sw = { x: t.clientX, y: t.clientY, m: 1, d: 0, p: swPane() };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (!sw) return;
    const t = e.touches[0],
      dx = t.clientX - sw.x,
      dy = t.clientY - sw.y;
    if (sw.m === 1) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        sw = null;
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      sw.m = 2;
      sw.p.style.transition = 'none';
    }
    const j = SWT.indexOf(tab) + (dx < 0 ? 1 : -1),
      ok = j >= 0 && j < SWT.length,
      k = Math.min(1, Math.abs(dx) / SWTH);
    sw.d = ok ? dx : 0;
    sw.p.style.transform = `translateX(${dx * (ok ? 0.55 : 0.15)}px)`;
    sw.p.style.opacity = ok ? 1 - 0.35 * k : 1;
    SWT.forEach((x, n) => swBtn(x)?.classList.toggle('nx', ok && n === j && k >= 1));
    let h = $('#swh');
    if (!h) {
      h = document.createElement('div');
      h.id = 'swh';
      document.body.appendChild(h);
    }
    if (ok) {
      h.textContent = (dx < 0 ? '' : '‹ ') + SWN[SWT[j]] + (dx < 0 ? ' ›' : '');
      h.className = (dx < 0 ? 'r' : 'l') + (k >= 1 ? ' go' : '');
      h.style.opacity = Math.min(1, k * 1.4);
    } else h.style.opacity = 0;
  },
  { passive: true },
);
document.addEventListener(
  'touchend',
  () => {
    if (!sw) return;
    if (sw.m !== 2) {
      sw = null;
      return;
    }
    const dx = sw.d,
      j = SWT.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) >= SWTH && j >= 0 && j < SWT.length && !false) {
      const p = sw.p;
      p.style.transition = '';
      p.style.transform = '';
      p.style.opacity = '';
      $('#swh')?.remove();
      SWT.forEach((k) => swBtn(k)?.classList.remove('nx'));
      sw = null;
      setTab(SWT[j]);
      const np = swPane();
      np.classList.remove('slr', 'sll');
      void np.offsetWidth;
      np.classList.add(dx < 0 ? 'slr' : 'sll');
      setTimeout(() => np.classList.remove('slr', 'sll'), 260);
    } else swReset();
  },
  { passive: true },
);
document.addEventListener('touchcancel', swReset, { passive: true });
