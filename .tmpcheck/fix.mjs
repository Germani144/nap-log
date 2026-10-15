import { readFileSync } from 'node:fs';
const P='nap-log-78cb6',K='AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4',code=process.env.FAMILY_CODE;
const note=(...a)=>console.log('::notice::'+a.join(' '));
const db=`projects/${P}/databases/(default)/documents`;
const data=JSON.parse(readFileSync(new URL('./data.json',import.meta.url)));
const commit=async writes=>{const r=await fetch(`https://firestore.googleapis.com/v1/${db}:commit?key=${K}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes})});if(!r.ok){note('commit failed HTTP '+r.status);process.exit(1)}};
const wrong=encodeURIComponent(code);
note('code needs encoding:', wrong!==code);
let ins=0,del=0;
for(let i=0;i<data.length;i+=100){
  const chunk=data.slice(i,i+100);
  await commit(chunk.map(e=>({update:{name:`${db}/families/${code}/entries/${e.id}`,fields:{id:{stringValue:e.id},type:{stringValue:e.type},start:{integerValue:String(e.start)},end:{integerValue:String(e.end)}}}})));ins+=chunk.length;
  if(wrong!==code){await commit(chunk.map(e=>({delete:`${db}/families/${wrong}/entries/${e.id}`})));del+=chunk.length}
}
note(`inserted ${ins}, removed ${del} stray`);
