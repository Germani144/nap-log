// Tests for the plan maths. Run: TZ=Europe/Copenhagen node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {makePlan,hm}=createRequire(import.meta.url)('../plan.js');

const T0=new Date(2026,9,15).getTime();                     // "today" = 15 Oct 2026, local midnight
const at=(day,h,m)=>T0+day*864e5+(h*60+m)*6e4;              // day 0 = today, -1 = yesterday
let n=0;const nap=(d,h1,m1,h2,m2)=>({id:'n'+n++,type:'nap',start:at(d,h1,m1),end:h2==null?null:at(d,h2,m2)});
const night=(d,h1,m1,h2,m2)=>({id:'g'+n++,type:'night',start:at(d,h1,m1),end:h2==null?null:at(d+1,h2,m2)});
const S={targetNaps:3,bedtime:'19:30'};
// a regular week: wake 06:30, naps 08:30-09:30, 12:00-13:30, 16:00-16:45, bed 19:30
function week(days=7){const E=[];for(let d=-days;d<0;d++)E.push(night(d-1,19,30,6,30),nap(d,8,30,9,30),nap(d,12,0,13,30),nap(d,16,0,16,45));E.push(night(-1,19,30,6,30));return E}
const starts=p=>p.rows.filter(r=>!r.nodata).map(r=>hm(r.s));

test('no history: naps say "no data", nothing to notify',()=>{
  const p=makePlan([],at(0,9,0),S);
  assert.equal(p.rows.length,3);assert.ok(p.rows.every(r=>r.nodata));
  assert.equal(p.next,null);assert.equal(p.want,null);assert.equal(p.T,null);
});

test('a regular week reproduces the usual day',()=>{
  const p=makePlan(week(),at(0,7,0),S);
  assert.deepEqual(starts(p),['08:30','12:00','16:00']);
  assert.equal(hm(p.B),'19:30');
  assert.equal(p.next.label,'Next nap');assert.equal(hm(p.next.t),'08:30');
  assert.equal(p.want.at,at(0,8,0));                       // notification 30 min before
});

test('a late wake-up moves the naps after it (awake windows, not clock times)',()=>{
  const E=week();E[E.length-1]=night(-1,19,30,7,30);       // woke an hour late
  assert.deepEqual(starts(makePlan(E,at(0,8,0),S)).slice(0,2),['09:30','13:00']);
});

test('a long nap pushes the next one later',()=>{
  const E=[...week(),nap(0,8,30,10,30)];                   // nap 1 an hour longer than usual
  assert.equal(starts(makePlan(E,at(0,10,40),S))[1],'13:00');
});

test('awake windows never exceed 3h 30m',()=>{
  const E=[];for(let d=-7;d<0;d++)E.push(night(d-1,19,30,6,0),nap(d,11,0,12,0));E.push(night(-1,19,30,6,0));
  const p=makePlan(E,at(0,7,0),{targetNaps:1,bedtime:'19:30'});
  assert.equal(hm(p.rows[0].s),'09:30');                   // usual 5h gap capped to 3h30
});

test('bedtime stays within 30 minutes of the target when the naps allow it',()=>{
  for(const bt of['18:30','19:30','20:30']){
    const p=makePlan(week(),at(0,7,0),{targetNaps:3,bedtime:bt});
    const[h,m]=bt.split(':').map(Number);assert.ok(Math.abs(p.B-(h*60+m))<=30,bt+' -> '+hm(p.B));
  }
});

test('short naps today lengthen the remaining ones, never beyond 3 hours',()=>{
  const E=[...week(),nap(0,8,30,8,50),nap(0,11,0,11,20)];
  const r=makePlan(E,at(0,11,30),S).rows[2];
  assert.ok(r.add>0);assert.ok(r.e-r.s<=180);
});

test('recent days count more',()=>{
  const E=week();E.splice(E.findIndex(e=>e.type==='nap'&&e.start===at(-1,8,30)),1,nap(-1,7,30,8,30)); // yesterday nap 1 an hour earlier
  const s=makePlan(E,at(0,7,0),S).rows[0].s;
  assert.ok(s<8*60+30-60/7,'weighted more than a plain 1-in-7 average: '+hm(s));
});

test('while asleep there is no next event to notify about',()=>{
  const p=makePlan([...week(),nap(0,8,30,null)],at(0,9,0),S);
  assert.equal(p.run.type,'nap');assert.equal(p.next,null);assert.equal(p.want,null);
});

test('night ring: expected length is the average of the last 8 nights, or 10h 30m without data',()=>{
  const p=makePlan([...week(),night(0,19,30,null)],at(0,22,0),S);
  assert.equal(Math.round(p.avgN),660);                    // 19:30 -> 06:30
  assert.equal(makePlan([night(0,19,30,null)],at(0,22,0),S).avgN,630);
});

test('the result only depends on the inputs',()=>{
  const E=week(),a=JSON.stringify(makePlan(E,at(0,10,0),S)),b=JSON.stringify(makePlan(E,at(0,10,0),S));
  assert.equal(a,b);
});

test('predFor: what a starting nap or night was predicted to be',async()=>{
  const {predFor}=createRequire(import.meta.url)('../plan.js');
  const p=makePlan(week(),at(0,8,25),S);
  assert.deepEqual(predFor(p,'nap'),{s:at(0,8,30),len:60,n:1});
  const q=makePlan([...week(),nap(0,8,30,9,30),nap(0,12,0,13,30),nap(0,16,0,16,45)],at(0,19,20),S);
  const pn=predFor(q,'night');assert.equal(pn.len,660);assert.ok(Math.abs(pn.s-at(0,19,30))<=30*6e4);
  assert.equal(predFor(makePlan([],at(0,9,0),S),'nap'),null);   // no data, no prediction
});

test('nap in progress: target = day goal − naps done − usual later naps, kept between 20 min and 3 h',()=>{
  // usual day: 1h + 1h30 + 45m = 3h15 of naps
  const long=makePlan([...week(),nap(0,8,30,10,30),nap(0,12,0,14,0),nap(0,16,0,null)],at(0,16,10),S);
  assert.equal(Math.round(long.cur.len),20);                       // 4h done already: only a short catnap left
  const short=makePlan([...week(),nap(0,8,30,9,0),nap(0,12,0,12,30),nap(0,16,0,null)],at(0,16,10),S);
  assert.equal(Math.round(short.cur.len),135);                     // 1h done: this nap catches up (3h15 − 1h)
  const first=makePlan([...week(),nap(0,8,30,null)],at(0,8,40),S);
  assert.equal(Math.round(first.cur.len),60);                      // on a normal day it is the usual length
  assert.equal(makePlan([nap(0,8,30,null)],at(0,8,40),S).cur,null); // no data, no target
});

test('past the target the plan counts from now',()=>{
  const p=makePlan([...week(),nap(0,8,30,10,30),nap(0,12,0,14,0),nap(0,16,0,null)],at(0,17,0),S);
  assert.equal(p.rows[2].e,17*60);
});
