import {readFile,mkdir,writeFile} from 'node:fs/promises';
const js=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(js+'\nexport {generateOne,unpackZIP,zip,crc32,policyRates,calc};').toString('base64'));
const base=new Uint8Array(await readFile(new URL('../assets/original_template.docx',import.meta.url)));
const trip={title:'Fictional training',purpose:'Demonstration of DSA calculation',mode:'Road',organizer:'a2i',
itinerary:[{date:'2026-10-17',location:'Chuadanga',activity:'Training'},{date:'2026-10-18',location:'Chuadanga',activity:'Training'}],
legs:[{from:'Dhaka',to:'Chuadanga',departDate:'2026-10-16',departTime:'10:15',arriveDate:'2026-10-16',arriveTime:'18:40',mode:'Road',distance:217},{from:'Chuadanga',to:'Dhaka',departDate:'2026-10-19',departTime:'08:30',arriveDate:'2026-10-19',arriveTime:'14:20',mode:'Road',distance:217}]};
const people=[{name:'Fictional Traveler One',designation:'Consultant',team:'Demo',dsaBand:2,travelBand:4,transportClass:'other',dailyRate:0,fullDays:3,halfDays:0,multiplier:1},{name:'Fictional Traveler Two',designation:'Officer',team:'Demo',dsaBand:3,travelBand:6,transportClass:'other',dailyRate:0,fullDays:2,halfDays:1,multiplier:0}];
const generated=await Promise.all(people.map(x=>worker.generateOne(base,trip,x)));
if(generated[0].totals.total!==21312||generated[1].totals.total!==6250)throw Error('Incorrect totals');
await mkdir(new URL('./test-output/',import.meta.url),{recursive:true});
const entries=[];
for(let i=0;i<generated.length;i++){const b=generated[i].bytes;await writeFile(new URL('./test-output/0'+(i+1)+'.docx',import.meta.url),b);entries.push({name:'0'+(i+1)+'_'+people[i].name.replaceAll(' ','_')+'.docx',method:0,crc:worker.crc32(b),usize:b.length,data:b})}
const csv=new TextEncoder().encode('Name,Total\nFictional Traveler One,21312\nFictional Traveler Two,6250\n');
entries.push({name:'claim_summary.csv',method:0,crc:worker.crc32(csv),usize:csv.length,data:csv});
await writeFile(new URL('./test-output/batch.zip',import.meta.url),worker.zip(entries));
console.log('PASS: two individual DOCX and one batch ZIP');

const policyTrip={...trip,dsaArea:'special'};
const p3={name:'Fictional Policy Traveler',designation:'Young Professional',team:'Project',office:'a2i',dsaBand:3,travelBand:6,transportClass:'other',dailyRate:0,fullDays:2,halfDays:1,multiplier:1};
const policyGenerated=await worker.generateOne(base,policyTrip,p3);
if(policyGenerated.totals.rate!==3000||policyGenerated.totals.travelRate!==10||policyGenerated.totals.dsa!==7500||policyGenerated.totals.ta!==4340||policyGenerated.totals.total!==11840)throw Error('Policy schedule calculation mismatch');
await writeFile(new URL('./test-output/03.docx',import.meta.url),policyGenerated.bytes);
const other=worker.calc({...trip,dsaArea:'other'},p3);
if(other.rate!==2500||other.total!==10590)throw Error('Other area rate mismatch');
const p4={...p3,dsaBand:1,travelBand:5,transportClass:'air',dailyRate:0,fullDays:1,halfDays:0};
const eligible=worker.calc(policyTrip,p4);
if(eligible.rate!==6000||eligible.travelRate!==24)throw Error('Air travel allowance mismatch');
try{worker.calc(policyTrip,{...p3,transportClass:'air'});throw Error('Invalid air rate accepted')}catch(e){if(e.message==='Invalid air rate accepted')throw e}
console.log('PASS: 4 DSA bands, transport eligibility and location-specific rates');

const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
const jsMatch=html.match(/<script>([\s\S]*?)<\/script>/);
if(!jsMatch)throw Error('No inline application script');
const {Script}=await import('node:vm');
new Script(jsMatch[1],{filename:'dsa-app-inline.js'});
for(const label of ['name="office_name"','name="dsa_band"','name="travel_band"','name="dsa_area"','Continue with Google'])if(!html.includes(label))throw Error('Missing required UI input '+label);
console.log('PASS: browser JS syntax and employee/area inputs');

const seedSQL=await readFile(new URL('../supabase/seed_employee_directory.sql',import.meta.url),'utf8');
const candidateEntries=seedSQL.match(/^    \('([^']+)', '([^']+)', [1234], [1-7]\)/gm)||[];
if(candidateEntries.length!==18)throw Error('Expected exactly 18 employee seed records, found '+candidateEntries.length);
if(candidateEntries.some(x=>/Jeyson Jaman Sawan|Jeson Jaman Sawan/i.test(x)))throw Error('Excluded employee appeared in initial directory');
if(!seedSQL.includes('employee_directory_setup')||!seedSQL.includes('pg_advisory_xact_lock')||!seedSQL.includes('security invoker'))throw Error('One-time owned import protections missing');
for(const element of ['id="employeeEditor"','id="editEmployeeForm"','data-edit-employee','office_name','seed_initial_employee_directory'])if(!html.includes(element))throw Error('Missing editable directory component '+element);
console.log('PASS: exactly 18 approved seed records, excluded name absent, editing UI and one-time import available');

for(const marker of ['iBAS++ Distance Matrix','class="distanceVerified"','distance_verified:true','distance_source:\'iBAS++ Distance Matrix\''])if(!html.includes(marker))throw Error('iBAS distance integration missing '+marker);
console.log('PASS: iBAS distance citation, explicit verification and distance provenance');

for(const [input,expected] of [['16:45','04:45PM'],['09:00','09:00AM'],['00:00','12:00AM'],['12:00','12:00PM'],['23:59','11:59PM'],['04:05:00','04:05AM'],['18:40:00','06:40PM'],['04:45PM','04:45PM']]){
 if(worker.time12(input)!==expected)throw Error('Incorrect 12h time: '+input);
}
const xmlEntry=worker.unpackZIP(generated[0].bytes).find(e=>e.name==='word/document.xml');
const {inflateRawSync}=await import('node:zlib');
const xml=(xmlEntry.method===8?inflateRawSync(xmlEntry.data):Buffer.from(xmlEntry.data)).toString('utf8');
for(const expected of ['10:15AM','06:40PM','08:30AM','02:20PM'])if(!xml.includes(expected))throw Error('DOCX missing formatted time '+expected);
if(html.includes("label:'Rate / KM BDT'"))throw Error('Travel legs still accept manually set KM rate');
const forged={...trip,legs:trip.legs.map(x=>({...x,kmRate:9999}))};
if(worker.calc(forged,people[0]).total!==worker.calc(trip,people[0]).total)throw Error('Manually supplied rate affected calculation');
try{worker.calc(trip,{...people[0],travelBand:null});throw Error('Invalid employee category accepted')}catch(e){if(e.message==='Invalid employee category accepted')throw e}
console.log('PASS: category-only rates and 12-hour Word times');
