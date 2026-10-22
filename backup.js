// Nap Log: export and import of the data (Settings > Export data / Import data), plus the validators every synced or
// typed-in value goes through (okE, okS). Pure: no screen, storage, network or clock here (`now` is always passed in),
// so tests/backup.test.mjs can run it directly in Node. index.html loads this file before its own script.
//
// An export never contains the family code or any other secret: makeExport only copies the fields listed below.

// ---------- validators (used for everything read from Firestore, localStorage or an imported file) ----------
// an entry: id is a short safe word (it ends up inside onclick="..." attributes), type is nap or night, times are numbers
const okE=e=>!!e&&typeof e.id==='string'&&/^[\w-]{1,64}$/.test(e.id)&&(e.type==='nap'||e.type==='night')&&Number.isFinite(e.start)&&(e.end==null||Number.isFinite(e.end));
// settings: always returns safe values (bad or missing ones fall back to the defaults)
const okS=s=>({targetNaps:Math.min(8,Math.max(1,Math.round(+(s&&s.targetNaps))||4)),bedtime:/^([01]\d|2[0-3]):[0-5]\d$/.test(s&&s.bedtime)?s.bedtime:'19:30'});

const Backup=(()=>{
  const FORMAT='nap-log-export',VERSION=1;           // bump VERSION only when the file layout changes; keep reading old ones
  const DAY=864e5,MAXBYTES=5e6,MAXENTRIES=50000,EARLIEST=Date.UTC(2020,0,1);
  const P=n=>String(n).padStart(2,'0');
  const localDay=t=>{const d=new Date(t);return d.getFullYear()+'-'+P(d.getMonth()+1)+'-'+P(d.getDate())};
  const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const isInt=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;

  // the prediction saved with an entry (plan.js predFor): {s: ms, len: min, n: nap number (naps only), v: app version}
  const okPred=p=>isObj(p)&&Number.isFinite(p.s)&&Number.isFinite(p.len)&&(p.n==null||isInt(p.n,1,20))
    &&(p.v==null||(typeof p.v==='string'&&/^[\w.-]{1,16}$/.test(p.v))||Number.isFinite(p.v));
  // only the known fields are kept, so nothing unexpected travels in or out
  const cleanE=e=>{const o={id:e.id,type:e.type,start:e.start,end:e.end==null?null:e.end};if(okPred(e.pred)){const{s,len,n,v}=e.pred;o.pred={s,len};if(n!=null)o.pred.n=n;if(v!=null)o.pred.v=v}return o};

  // ---------- export ----------
  // state: {entries, settings, extraNaps, prefs:{statsN, pushOff}}; anything else in it (the family code) is ignored
  function makeExport(state,now,appVer){
    const seen=new Set(),entries=[];
    for(const e of state.entries||[])if(okE(e)&&!seen.has(e.id)){seen.add(e.id);entries.push(cleanE(e))}
    entries.sort((a,b)=>a.start-b.start||(a.id<b.id?-1:1));
    const x=state.extraNaps,p=state.prefs||{};
    return{
      format:FORMAT,version:VERSION,app:String(appVer||''),exportedAt:now,
      settings:okS(state.settings),
      extraNaps:isObj(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x.day)&&isInt(+x.n,0,3)?{day:x.day,n:+x.n}:null,
      prefs:{statsN:[7,14,30].includes(+p.statsN)?+p.statsN:30,pushOff:!!p.pushOff},
      entries,
    };
  }
  const fileName=now=>`nap-log-${localDay(now)}.json`;
  const toText=obj=>JSON.stringify(obj,null,1);

  // ---------- import ----------
  // Checks the whole file before anything is written. Returns {ok:true, data, summary} or {ok:false, error} with a
  // plain-text error for the screen. Fields that older exports may lack (settings, extraNaps, prefs, app, exportedAt,
  // pred, end) are optional; anything present must be valid, or the whole file is refused.
  function parseImport(text,now){
    const fail=error=>({ok:false,error});
    if(typeof text!=='string'||!text.trim())return fail('The file is empty.');
    if(text.length>MAXBYTES)return fail('The file is too large to be a Nap Log export.');
    let j;try{j=JSON.parse(text)}catch{return fail('This is not a JSON file.')}
    if(!isObj(j)||j.format!==FORMAT)return fail('This is not a Nap Log export.');
    if(!Number.isInteger(j.version)||j.version<1)return fail('The export has no valid format version.');
    if(j.version>VERSION)return fail(`This export was made by a newer version of Nap Log (format ${j.version}). Update the app first (Settings > Check for updates).`);
    if(!Array.isArray(j.entries))return fail('The export has no list of entries.');
    if(j.entries.length>MAXENTRIES)return fail('The export has too many entries.');
    const ids=new Set(),entries=[];
    for(let i=0;i<j.entries.length;i++){
      const e=j.entries[i],where=`Entry ${i+1}`;
      if(isObj(e)&&!('end' in e))e.end=null;                  // very old layout: no end field means still running
      if(!okE(e))return fail(`${where} is not a valid nap or night.`);
      if(ids.has(e.id))return fail(`${where} has the same id as an earlier entry.`);
      ids.add(e.id);
      if(e.start<EARLIEST||e.start>now+DAY)return fail(`${where} has an impossible start time.`);
      if(e.end!=null&&(e.end<e.start||e.end-e.start>DAY))return fail(`${where} ends before it starts or lasts more than a day.`);
      if(e.end==null&&now-e.start>DAY)return fail(`${where} has no end time and started more than a day ago.`);
      if(e.pred!=null&&!okPred(e.pred))return fail(`${where} has a broken saved prediction.`);
      entries.push(cleanE(e));
    }
    let settings=null;
    if(j.settings!=null){
      const s=j.settings;
      if(!isObj(s)||!isInt(s.targetNaps,1,8)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.bedtime))return fail('The settings in the file are not valid.');
      settings=okS(s);
    }
    let extraNaps=null;
    if(j.extraNaps!=null){
      const x=j.extraNaps;
      if(!isObj(x)||!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||!isInt(x.n,0,3))return fail('The added extra naps in the file are not valid.');
      extraNaps={day:x.day,n:x.n};
    }
    let prefs=null;
    if(j.prefs!=null){
      const p=j.prefs;
      if(!isObj(p)||(p.statsN!=null&&![7,14,30].includes(p.statsN))||(p.pushOff!=null&&typeof p.pushOff!=='boolean'))return fail('The preferences in the file are not valid.');
      prefs={};if(p.statsN!=null)prefs.statsN=p.statsN;
    }
    if(j.app!=null&&!(typeof j.app==='string'&&/^[\w.-]{0,16}$/.test(j.app)))return fail('The app version in the file is not valid.');
    if(j.exportedAt!=null&&!Number.isFinite(j.exportedAt))return fail('The export date in the file is not valid.');
    entries.sort((a,b)=>a.start-b.start||(a.id<b.id?-1:1));
    return{ok:true,data:{entries,settings,extraNaps,prefs},summary:{...summarize(entries),version:j.version,app:j.app||null,exportedAt:j.exportedAt??null}};
  }

  // how many entries and which days they cover (for the preview)
  function summarize(entries){
    const naps=entries.filter(e=>e.type==='nap').length,ts=entries.map(e=>e.start);
    return{count:entries.length,naps,nights:entries.length-naps,first:ts.length?Math.min(...ts):null,last:ts.length?Math.max(...ts):null};
  }

  // What an import will do. existing = every entry stored now (all of them, not just the live 14 days).
  //   merge:   add the entries whose id is not there yet; existing entries are never changed
  //   replace: the log becomes exactly the file: every file entry is written, every other entry is deleted
  // Returns {put: entries to write, del: ids to delete, result: the log afterwards, added, kept, removed}
  function planImport(existing,incoming,mode){
    const have=new Map(existing.map(e=>[e.id,e]));
    if(mode==='replace'){
      const inc=new Set(incoming.map(e=>e.id)),del=[...have.keys()].filter(id=>!inc.has(id));
      return{mode,put:incoming.slice(),del,result:incoming.slice(),added:incoming.filter(e=>!have.has(e.id)).length,kept:0,removed:del.length};
    }
    const put=incoming.filter(e=>!have.has(e.id));
    return{mode:'merge',put,del:[],result:existing.concat(put),added:put.length,kept:incoming.length-put.length,removed:0};
  }

  return{FORMAT,VERSION,makeExport,fileName,toText,parseImport,summarize,planImport,cleanE,okPred};
})();

if(typeof module!=='undefined')module.exports={okE,okS,Backup};
