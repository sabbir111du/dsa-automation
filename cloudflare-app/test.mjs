import {readFile,mkdir,writeFile} from 'node:fs/promises';
const js=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(js+'\nexport {generateOne,unpackZIP,zip,crc32};').toString('base64'));
const base=new Uint8Array(await readFile(new URL('../assets/original_template.docx',import.meta.url)));
const trip={title:'Fictional training',purpose:'Demonstration of DSA calculation',mode:'Road',organizer:'a2i',
itinerary:[{date:'2026-10-17',location:'Chuadanga',activity:'Training'},{date:'2026-10-18',location:'Chuadanga',activity:'Training'}],
legs:[{from:'Dhaka',to:'Chuadanga',departDate:'2026-10-16',departTime:'10:15',arriveDate:'2026-10-16',arriveTime:'18:40',mode:'Road',distance:217,kmRate:18},{from:'Chuadanga',to:'Dhaka',departDate:'2026-10-19',departTime:'08:30',arriveDate:'2026-10-19',arriveTime:'14:20',mode:'Road',distance:217,kmRate:18}]};
const people=[{name:'Fictional Traveler One',designation:'Consultant',team:'Demo',dailyRate:4500,fullDays:3,halfDays:0,multiplier:1},{name:'Fictional Traveler Two',designation:'Officer',team:'Demo',dailyRate:3200,fullDays:2,halfDays:1,multiplier:0}];
const generated=await Promise.all(people.map(x=>worker.generateOne(base,trip,x)));
if(generated[0].totals.total!==21312||generated[1].totals.total!==8000)throw Error('Incorrect totals');
await mkdir(new URL('./test-output/',import.meta.url),{recursive:true});
const entries=[];
for(let i=0;i<generated.length;i++){const b=generated[i].bytes;await writeFile(new URL('./test-output/0'+(i+1)+'.docx',import.meta.url),b);entries.push({name:'0'+(i+1)+'_'+people[i].name.replaceAll(' ','_')+'.docx',method:0,crc:worker.crc32(b),usize:b.length,data:b})}
const csv=new TextEncoder().encode('Name,Total\nFictional Traveler One,21312\nFictional Traveler Two,8000\n');
entries.push({name:'claim_summary.csv',method:0,crc:worker.crc32(csv),usize:csv.length,data:csv});
await writeFile(new URL('./test-output/batch.zip',import.meta.url),worker.zip(entries));
console.log('PASS: two individual DOCX and one batch ZIP');
