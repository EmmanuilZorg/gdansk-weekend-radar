import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const eventsPath = path.join(root, 'data/events.json');
const sourcesPath = path.join(root, 'data/sources.json');
const current = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
const checked = [];
const discovered = [];

for (const source of sources) {
  try {
    const res = await fetch(source.url, {headers:{'user-agent':'gdansk-weekend-radar/1.0 (+GitHub Actions)'}});
    checked.push({name:source.name,status:res.status});
    if (!res.ok) continue;
    const html = await res.text();
    // Lightweight discovery: preserve only JSON-LD events that explicitly match the configured weekend.
    const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of blocks) {
      try {
        const value = JSON.parse(match[1].trim());
        const list = Array.isArray(value) ? value : (value['@graph'] || [value]);
        for (const item of list) {
          const start = String(item.startDate || '');
          if (!start.startsWith('2026-10-10') && !start.startsWith('2026-10-11')) continue;
          if (!item.name) continue;
          discovered.push({id:`auto-${Buffer.from(`${source.name}-${item.name}-${start}`).toString('base64url').slice(0,20)}`,title:item.name,date:start.slice(0,10),time:start.slice(11,16)||'уточняется',place:item.location?.name || item.location?.address?.addressLocality || 'место уточняется',area:'Gdańsk / Trójmiasto',free:false,price:'уточняется',solo:true,outdoor:false,registration:false,tags:['автосбор'],description:'Найдено в структурированных данных источника; проверьте условия на странице события.',source:source.url});
        }
      } catch {}
    }
  } catch (error) {
    checked.push({name:source.name,status:'error',error:String(error)});
  }
}
const existingIds = new Set(current.events.map(e=>e.id));
const newEvents = discovered.filter(e=>!existingIds.has(e.id));
current.events = [...current.events, ...newEvents].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
current.meta = {...current.meta,lastChecked:new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'short'}).format(new Date()),lastRun:'github-actions',sourcesChecked:checked.length,newEvents:newEvents.length,sourceStatus:checked};
await fs.writeFile(eventsPath, JSON.stringify(current,null,2)+'\n');
console.log(JSON.stringify({checked:checked.length,newEvents:newEvents.length,checkedSources:checked},null,2));
