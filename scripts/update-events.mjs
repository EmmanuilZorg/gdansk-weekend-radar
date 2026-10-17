import fs from 'node:fs/promises';
import path from 'node:path';
import {formatWeekend, retainUpcomingEvents, upcomingWeekend, warsawDate} from '../weekend.mjs';
import {extractGdanskEventCards} from './gdansk-parser.mjs';

const root = process.cwd();
const eventsPath = path.join(root, 'data/events.json');
const sourcesPath = path.join(root, 'data/sources.json');
const current = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
const checked = [];
const discovered = [];
const USER_AGENT = 'gdansk-weekend-radar/1.1 (+GitHub Actions; public event indexer)';

const targetWeekend = upcomingWeekend();
const targetDates = new Set(targetWeekend);
const today = warsawDate();

function parseJsonScripts(html) {
  const values = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(match[1].trim())); } catch {}
  }
  for (const match of html.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(match[1].trim())); } catch {}
  }
  return values;
}
function flatten(value, out = []) {
  if (!value || typeof value !== 'object' || out.length > 5000) return out;
  if (Array.isArray(value)) { for (const item of value) flatten(item, out); return out; }
  out.push(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') flatten(child, out);
  return out;
}
function text(value) { return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
function eventDate(value) {
  const raw = String(value || '');
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const eu = raw.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\D|$)/);
  if (eu) return `${eu[3]}-${eu[2].padStart(2,'0')}-${eu[1].padStart(2,'0')}`;
  return '';
}
function eventTime(value) { return String(value || '').match(/T(\d{2}:\d{2})/)?.[1] || String(value || '').match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/)?.[1] || 'уточняется'; }
function locationName(location) {
  if (typeof location === 'string') return text(location);
  return text(location?.name) || text(location?.address?.name) || text(location?.address?.addressLocality) || 'место уточняется';
}
function makeEvent(source, item, override = {}) {
  const start = item.startDate || item.start_date || item.startTime || item.date || override.date;
  const date = eventDate(start);
  if (!date || !targetDates.has(date)) return null;
  const title = text(item.name || item.title || item.eventName || override.title);
  if (!title || !/gdańsk|gdansk|trójmiasto|trojmiasto/i.test(`${title} ${locationName(item.location || item.venue || item.place)}`) && !['eventbrite','kultura.pl','official'].includes(source.type)) return null;
  const url = item.url || item.link || override.url || source.url;
  const description = text(item.description || item.summary || override.description) || `Найдено специализированным парсером ${source.name}; проверьте условия на странице события.`;
  const location = locationName(item.location || item.venue || item.place || override.place);
  return {id:`auto-${Buffer.from(`${source.name}-${title}-${date}-${url}`).toString('base64url').slice(0,24)}`,title,date,time:eventTime(start),place:location,area:'Gdańsk / Trójmiasto',free:/free|bezpłat|darmow|wstęp wolny/i.test(`${item.offers?.price || ''} ${description}`),price:'уточняется',solo:true,outdoor:false,registration:false,tags:[source.type === 'eventbrite' ? 'Eventbrite' : source.type === 'kultura.pl' ? 'kultura.pl' : 'автосбор'],description,source:url};
}
function fromStructuredData(source, html) {
  const result = [];
  for (const value of parseJsonScripts(html)) {
    for (const item of flatten(value)) {
      if (item['@type'] === 'Event' || item.startDate || item.start_date || item.eventName) {
        const event = makeEvent(source, item);
        if (event) result.push(event);
      }
    }
  }
  return result;
}
function parseEventbrite(source, html) {
  // Eventbrite exposes event cards through JSON-LD and, on some responses, __NEXT_DATA__.
  return fromStructuredData(source, html);
}
function parseKultura(source, html) {
  // Culture.pl uses JSON-LD for detail pages and embedded event objects on its calendar page.
  const result = fromStructuredData(source, html);
  for (const match of html.matchAll(/(?:data-date|data-event-date|eventDate|startDate)["'=:\s]+["']?([^"'<>\s,}]+)/gi)) {
    const date = eventDate(match[1]);
    if (!targetDates.has(date)) continue;
    const around = html.slice(Math.max(0, match.index - 700), match.index + 1000);
    const title = text(around.match(/<(?:h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/i)?.[1]);
    if (title) { const event = makeEvent(source, {title,date,description:'Найдено в календаре Kultura.pl',link:source.url}); if (event) result.push(event); }
  }
  return result;
}
function parseSource(source, html) {
  if (source.type === 'eventbrite') return parseEventbrite(source, html);
  if (source.type === 'kultura.pl') return parseKultura(source, html);
  const result = fromStructuredData(source, html);
  if (source.url.includes('gdansk.pl/wydarzenia')) {
    for (const item of extractGdanskEventCards(html, targetDates)) {
      const event = makeEvent(source, {...item, startDate: item.time === 'уточняется' ? item.date : `${item.date}T${item.time}`, location: 'Gdańsk', description: 'Официальная карточка события на портале города Гданьска.'});
      if (event) {
        event.tags = ['городской календарь', 'автосбор'];
        result.push(event);
      }
    }
  }
  return result;
}

for (const source of sources) {
  try {
    const res = await fetch(source.url, {headers:{'user-agent':USER_AGENT, 'accept-language':'pl,en;q=0.8'}});
    checked.push({name:source.name,status:res.status,parser:source.url.includes('gdansk.pl/wydarzenia') ? 'gdansk-calendar' : source.type === 'eventbrite' ? 'eventbrite' : source.type === 'kultura.pl' ? 'kultura.pl' : 'json-ld'});
    if (!res.ok) continue;
    const html = await res.text();
    discovered.push(...parseSource(source, html));
  } catch (error) {
    checked.push({name:source.name,status:'error',error:String(error)});
  }
}

const unique = [...new Map(discovered.map(event => [event.id, event])).values()];
const retainedEvents = retainUpcomingEvents(current.events, today);
const removedEvents = current.events.length - retainedEvents.length;
const existingIds = new Set(retainedEvents.map(e => e.id));
const eventKeys = new Set(retainedEvents.map(e => `${e.title.trim().toLocaleLowerCase('ru-RU')}|${e.date}`));
const newEvents = unique.filter(event => {
  const key = `${event.title.trim().toLocaleLowerCase('ru-RU')}|${event.date}`;
  if (existingIds.has(event.id) || eventKeys.has(key)) return false;
  eventKeys.add(key);
  return true;
});
current.events = [...retainedEvents, ...newEvents].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
current.meta = {...current.meta,lastChecked:new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'short'}).format(new Date()),lastRun:'github-actions',weekend:formatWeekend(targetWeekend),targetWeekend:targetWeekend.join(' / '),sourcesChecked:checked.length,newEvents:newEvents.length,removedEvents,sourceStatus:checked};
await fs.writeFile(eventsPath, JSON.stringify(current,null,2)+'\n');
console.log(JSON.stringify({targetWeekend,removedEvents,checked:checked.length,newEvents:newEvents.length,checkedSources:checked},null,2));
