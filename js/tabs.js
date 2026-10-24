// Switching tabs, by tapping or swiping.

function setTab(t) {
  currentTab = t;
  $('#v-today').hidden = t !== 'today';
  $('#v-hist').hidden = t !== 'hist';
  $('#v-stats').hidden = t !== 'stats';
  $('#t-today').classList.toggle('on', t === 'today');
  $('#t-hist').classList.toggle('on', t === 'hist');
  $('#t-stats').classList.toggle('on', t === 'stats');
  if (t === 'hist') {
    loadShownMonth();
    renderHistory();
  } else if (t === 'stats') {
    loadLast30Days();
    renderStats();
  } else drawAwakeSpan();
  window.scrollTo(0, 0);
}
// swipe left/right to change tab, with live feedback: the page follows the finger, a label names the next tab,
// and it lights up once the swipe is long enough to switch.
const TAB_ORDER = ['today', 'hist', 'stats'],
  TAB_NAMES = { today: 'Today', hist: 'History', stats: 'Statistics' },
  SWIPE_DISTANCE = 70;
const currentPane = () => $('#v-' + currentTab);
const tabButton = (k) => $('#t-' + k);
let swipe = null;
function resetSwipe() {
  const p = swipe && swipe.p;
  if (p) {
    p.style.transition = 'transform .18s,opacity .18s';
    p.style.transform = '';
    p.style.opacity = '';
  }
  $('#swh')?.remove();
  TAB_ORDER.forEach((k) => tabButton(k)?.classList.remove('nx'));
  swipe = null;
}
document.addEventListener(
  'touchstart',
  (e) => {
    swipe = null;
    if (e.touches.length !== 1 || !(!$('#dlg').open && !e.target.closest('input,select,textarea,dialog,.chart svg')))
      return;
    const t = e.touches[0];
    swipe = { x: t.clientX, y: t.clientY, m: 1, d: 0, p: currentPane() };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (!swipe) return;
    const t = e.touches[0],
      dx = t.clientX - swipe.x,
      dy = t.clientY - swipe.y;
    if (swipe.m === 1) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        swipe = null;
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      swipe.m = 2;
      swipe.p.style.transition = 'none';
    }
    const j = TAB_ORDER.indexOf(currentTab) + (dx < 0 ? 1 : -1),
      ok = j >= 0 && j < TAB_ORDER.length,
      k = Math.min(1, Math.abs(dx) / SWIPE_DISTANCE);
    swipe.d = ok ? dx : 0;
    swipe.p.style.transform = `translateX(${dx * (ok ? 0.55 : 0.15)}px)`;
    swipe.p.style.opacity = ok ? 1 - 0.35 * k : 1;
    TAB_ORDER.forEach((x, n) => tabButton(x)?.classList.toggle('nx', ok && n === j && k >= 1));
    let h = $('#swh');
    if (!h) {
      h = document.createElement('div');
      h.id = 'swh';
      document.body.appendChild(h);
    }
    if (ok) {
      h.textContent = (dx < 0 ? '' : '‹ ') + TAB_NAMES[TAB_ORDER[j]] + (dx < 0 ? ' ›' : '');
      h.className = (dx < 0 ? 'r' : 'l') + (k >= 1 ? ' go' : '');
      h.style.opacity = Math.min(1, k * 1.4);
    } else h.style.opacity = 0;
  },
  { passive: true },
);
document.addEventListener(
  'touchend',
  () => {
    if (!swipe) return;
    if (swipe.m !== 2) {
      swipe = null;
      return;
    }
    const dx = swipe.d,
      j = TAB_ORDER.indexOf(currentTab) + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) >= SWIPE_DISTANCE && j >= 0 && j < TAB_ORDER.length && !false) {
      const p = swipe.p;
      p.style.transition = '';
      p.style.transform = '';
      p.style.opacity = '';
      $('#swh')?.remove();
      TAB_ORDER.forEach((k) => tabButton(k)?.classList.remove('nx'));
      swipe = null;
      setTab(TAB_ORDER[j]);
      const np = currentPane();
      np.classList.remove('slr', 'sll');
      void np.offsetWidth;
      np.classList.add(dx < 0 ? 'slr' : 'sll');
      setTimeout(() => np.classList.remove('slr', 'sll'), 260);
    } else resetSwipe();
  },
  { passive: true },
);
document.addEventListener('touchcancel', resetSwipe, { passive: true });
