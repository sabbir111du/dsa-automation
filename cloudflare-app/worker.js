// DSA Automation Cloudflare Worker. Original a2i Word template retained.
// Supabase publishable key is safe for browser use; all records are protected by RLS.
const templateURL = 'https://raw.githubusercontent.com/sabbir111du/dsa-automation/main/assets/original_template.docx';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function fail(message, status=400){return Response.json({error:message},{status,headers:{'cache-control':'no-store'}})}
function xmlEsc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function currency(n){return (Math.round((Number(n)+Number.EPSILON)*100)/100).toFixed(2)}
function num(n, label){n=Number(n);if(!Number.isFinite(n)||n<0||n>1e9)throw Error(label+' must be a valid non-negative number');return n}
function date(s){if(!/^\d{4}-\d\d-\d\d$/.test(s||''))throw Error('Expected YYYY-MM-DD date');return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}
function words(n){n=Math.floor(n);const u=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];const t=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];const small=k=>{let a=[];if(k>=100){a.push(u[Math.floor(k/100)]+' hundred');k%=100}if(k>=20){a.push(t[Math.floor(k/10)]+(k%10?'-'+u[k%10]:''))}else if(k) a.push(u[k]);return a.join(' ')};if(n===0)return 'Zero taka.';let a=[];for(const [v,name] of [[1e9,'billion'],[1e6,'million'],[1000,'thousand'],[1,'']]){const q=Math.floor(n/v);n%=v;if(q)a.push(small(q)+(name?' '+name:''))}return (a.join(' ')+' taka.').replace(/^./,v=>v.toUpperCase())}
const r16=(d,p)=>d.getUint16(p,true),r32=(d,p)=>d.getUint32(p,true);
function w16(a,p,v){a[p]=v&255;a[p+1]=(v>>>8)&255}function w32(a,p,v){w16(a,p,v&65535);w16(a,p+2,(v>>>16)&65535)}
function crc32(a){let crc=0xffffffff;for(const b of a){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}return (crc^0xffffffff)>>>0}
async function inflate(data){return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
async function deflate(data){return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())}
function unpackZIP(input){const d=new DataView(input.buffer,input.byteOffset,input.byteLength),b=input;let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65558);i--){if(r32(d,i)===0x06054b50){end=i;break}}if(end<0)throw Error('Invalid Word template ZIP');let pos=r32(d,end+16),count=r16(d,end+10),entries=[];for(let i=0;i<count;i++){if(r32(d,pos)!==0x02014b50)throw Error('Invalid ZIP directory');const method=r16(d,pos+10),crc=r32(d,pos+16),size=r32(d,pos+20),usize=r32(d,pos+24),fn=r16(d,pos+28),ex=r16(d,pos+30),cm=r16(d,pos+32),off=r32(d,pos+42),name=decoder.decode(b.subarray(pos+46,pos+46+fn)),localFn=r16(d,off+26),localEx=r16(d,off+28),start=off+30+localFn+localEx;entries.push({name,method,crc,size,usize,data:b.slice(start,start+size)});pos+=46+fn+ex+cm}return entries}
function zip(entries){let n=22;const processed=entries.map(e=>({...e,nameBytes:encoder.encode(e.name)}));for(const e of processed)n+=30+e.nameBytes.length+e.data.length+46+e.nameBytes.length;const out=new Uint8Array(n),dirs=[];let p=0;for(const e of processed){const offset=p;w32(out,p,0x04034b50);w16(out,p+4,20);w16(out,p+6,0);w16(out,p+8,e.method);w32(out,p+14,e.crc);w32(out,p+18,e.data.length);w32(out,p+22,e.usize);w16(out,p+26,e.nameBytes.length);out.set(e.nameBytes,p+30);p+=30+e.nameBytes.length;out.set(e.data,p);p+=e.data.length;dirs.push({...e,offset})}const centralStart=p;for(const e of dirs){w32(out,p,0x02014b50);w16(out,p+4,20);w16(out,p+6,20);w16(out,p+10,e.method);w32(out,p+16,e.crc);w32(out,p+20,e.data.length);w32(out,p+24,e.usize);w16(out,p+28,e.nameBytes.length);w32(out,p+42,e.offset);out.set(e.nameBytes,p+46);p+=46+e.nameBytes.length}w32(out,p,0x06054b50);w16(out,p+8,dirs.length);w16(out,p+10,dirs.length);w32(out,p+12,p-centralStart);w32(out,p+16,centralStart);return out}
function setCell(c,text){const value=xmlEsc(text);let first=true;if(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/.test(c))return c.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g,()=>{if(first){first=false;return '<w:t xml:space="preserve">'+value+'</w:t>'}return '<w:t></w:t>'});return c.replace(/(<w:p(?:\s[^>]*)?>)/, '$1<w:r><w:t>'+value+'</w:t></w:r>')}
function rowCells(row,values){let idx=0;return row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g,c=>{const result=idx<values.length?setCell(c,values[idx]):c;idx++;return result})}
function rowData(t){return [...t.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map(m=>m[0])}
function setTable(t,rows){return t.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g,'__ROW_PLACEHOLDER__').replace(/(?:__ROW_PLACEHOLDER__)+/,()=>rows.join(''))}
function patchXML(xml,trip,traveler,calculations){
 let tableIndex=0;
 return xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g,t=>{
  const rows=rowData(t);
  if(tableIndex===0){tableIndex++;
   rows[0]=rowCells(rows[0],['Name of Official: '+traveler.name]);
   rows[1]=rowCells(rows[1],['Designation: '+traveler.designation]);
   rows[2]=rowCells(rows[2],['Team/Office: '+traveler.team]);
   rows[3]=rowCells(rows[3],['Purpose of Visit/Program Name: '+trip.purpose]);
   rows[4]=rowCells(rows[4],['Total Number of Days:',String(Number(traveler.fullDays)+Number(traveler.halfDays))]);
   rows[5]=rowCells(rows[5],['Mode of Travel:',trip.mode||'Road']);
   rows[6]=rowCells(rows[6],['Total DSA',currency(calculations.dsa)]);
   rows[7]=rowCells(rows[7],['Total Travel Allowance',currency(calculations.ta)+'/-']);
   rows[8]=rowCells(rows[8],['Total Amount Claim',currency(calculations.total)+'/-']);
   rows[9]=rowCells(rows[9],['Travel arranger (Please specify): '+(trip.organizer||'a2i')]);
   return setTable(t,rows);
  }
  if(tableIndex===1){tableIndex++;
   const itinerary=(trip.itinerary||[]).map(v=>rowCells(rows[2],[date(v.date),'1',v.location,v.activity]));
   const legs=(trip.legs||[]).map(v=>rowCells(rows[7],[v.from+'-'+v.to,v.mode||'Road',date(v.departDate),v.departTime||'',date(v.arriveDate),v.arriveTime||'']));
   return setTable(t,[...rows.slice(0,2),...itinerary,...rows.slice(4,7),...legs,...rows.slice(9,11).map(x=>rowCells(x,['','','','','','']))]);
  }
  if(tableIndex===2){tableIndex++;
   const dsarows=[];
   if(Number(traveler.fullDays)>0)dsarows.push(rowCells(rows[2],[traveler.fullDays,currency(calculations.rate),'Full',currency(calculations.full),'']));
   if(Number(traveler.halfDays)>0)dsarows.push(rowCells(rows[2],[traveler.halfDays,currency(calculations.rate),'Half',currency(calculations.half),'50%']));
   const tarows=trip.legs.map(v=>rowCells(rows[9],[date(v.departDate),v.distance,v.mode||'Road',currency(v.kmRate),currency(v.distance*v.kmRate*traveler.multiplier),v.from+'-'+v.to]));
   const tail=[rowCells(rows[16],['Total Travel Allowance Claim',currency(calculations.ta)+'/-','']),rowCells(rows[17],['Total DSA and Travel Allowance (C+D) =',currency(calculations.total)+'/-',''])];
   return setTable(t,[...rows.slice(0,2),...dsarows,rowCells(rows[6],['Total DSA',currency(calculations.dsa)+'/-','']),...rows.slice(7,9),...tarows,...tail]);
  }
  if(tableIndex===3){tableIndex++;rows[0]=rowCells(rows[0],['Traveler Signature and Seal with date: '+traveler.name+', '+traveler.designation+', '+traveler.team,'Team Leader’s Signature and Seal with date']);return setTable(t,rows)}
  tableIndex++;return t;
 }).replace(/Total Amount in Word:[^<]*/g, 'Total Amount in Word: '+xmlEsc(words(calculations.total)));
}
function calc(trip,person){const rate=num(person.dailyRate,'Daily rate'),full=num(person.fullDays,'Full days'),half=num(person.halfDays,'Half days'),mult=num(person.multiplier,'Mileage multiplier');if(full>365||half>365||mult>10)throw Error('Allowance values outside allowed range');const dsa=Math.round((full+half*.5)*rate*100)/100,ta=Math.round(trip.legs.reduce((a,l)=>a+num(l.distance,'Distance')*num(l.kmRate,'Km rate')*mult,0)*100)/100;return {rate,full:full*rate,half:half*.5*rate,dsa,ta,total:dsa+ta}}
async function generateOne(base,trip,person){const c=calc(trip,person);const entries=unpackZIP(base);const j=entries.findIndex(e=>e.name==='word/document.xml');if(j===-1)throw Error('Word template missing document.xml');const old=entries[j],raw=old.method===8?await inflate(old.data):old.data;const xml=patchXML(decoder.decode(raw),trip,person,c);const data=encoder.encode(xml),compressed=await deflate(data);entries[j]={...old,data:compressed,method:8,crc:crc32(data),usize:data.length};return {bytes:zip(entries),totals:c}}
function safeName(s){return String(s).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60)||'traveler'}
async function authenticated(req,env){const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw Error('Sign in required');const r=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token}});if(!r.ok)throw Error('Session expired. Sign in again.');return r.json()}
async function exportDocs(req,env){try{await authenticated(req,env);const body=await req.json();const trip=body.trip||{};if(!trip.purpose||!trip.title)throw Error('Trip details incomplete');const people=body.travelers;if(!Array.isArray(people)||people.length<1||people.length>20)throw Error('Choose 1 to 20 travelers');if(!Array.isArray(trip.legs)||!trip.legs.length||trip.legs.length>12)throw Error('Enter 1 to 12 travel legs');if(!Array.isArray(trip.itinerary)||trip.itinerary.length>15)throw Error('Maximum 15 itinerary entries');const origin=await fetch(templateURL);if(!origin.ok)throw Error('Cannot load original Word template');const base=new Uint8Array(await origin.arrayBuffer());if(base.length>2e6)throw Error('Template is unexpectedly large');const generated=[],summary=['Name,DSA,Travel Allowance,Total Claim'];for(const p of people){if(!p.name||!p.designation)throw Error('Missing traveler details');const g=await generateOne(base,trip,p);generated.push({name:safeName(p.name)+'.docx',method:0,crc:crc32(g.bytes),usize:g.bytes.length,data:g.bytes});summary.push([p.name,g.totals.dsa,g.totals.ta,g.totals.total].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','))}const csv=encoder.encode('\uFEFF'+summary.join('\r\n'));generated.push({name:'claim_summary.csv',method:0,crc:crc32(csv),usize:csv.length,data:csv});const combined=zip(generated);return new Response(combined,{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="DSA_Claims.zip"','cache-control':'no-store','x-content-type-options':'nosniff'}})}catch(e){return fail(String(e.message||e),400)}}
export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname==='/health')return Response.json({status:'ok',application:'dsa-automation',version:'0.2',databaseConfigured:Boolean(env.SUPABASE_URL)});if(url.pathname==='/config')return Response.json({supabaseUrl:env.SUPABASE_URL,supabaseKey:env.SUPABASE_PUBLISHABLE_KEY},{headers:{'cache-control':'no-store'}});if(url.pathname==='/api/generate'&&req.method==='POST')return exportDocs(req,env);if(url.pathname==='/'&&req.method==='GET')return new Response(__APP_HTML__,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"}});return fail('Not found',404)}};
