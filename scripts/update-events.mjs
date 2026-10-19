import fs from 'node:fs/promises';
import path from 'node:path';
import {displayWeekends, formatDisplayedWeekends, formatWeekend, retainDisplayedWeekendEvents, warsawDate} from '../weekend.mjs';
import {extractGdanskEventCards} from './gdansk-parser.mjs';
import {discoverInformatorArticleLinks, extractInformatorEvents} from './informator-parser.mjs';
import {isGdanskPlace, isKnownLocalSource, isStructuredEvent, isVirtualEvent, stableEventId} from './source-validation.mjs';

const root = process.cwd();
const eventsPath = path.join(root, 'data/events.json');
const sourcesPath = path.join(root, 'data/sources.json');
const current = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
const checked = [];
const discovered = [];
const USER_AGENT = 'gdansk-weekend-radar/1.2 (+GitHub Actions; public event indexer)';
const targetWeekends = displayWeekends();
const targetDates = new Set(targetWeekends.flat());
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
  if (!value || typeof value !== 'string') return '';
  const iso = value.match(/^\s*(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  if (iso && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`))) return iso;
  const eu = value.match(/^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:$|\s)/);
  if (eu) return `${eu[3]}-${eu[2].padStart(2,'0')}-${eu[1].padStart(2,'0')}`;
  return '';
}
function eventTime(value) { return String(value || '').match(/T(\d{2}:\d{2})/)?.[1] || String(value || '').match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/)?.[1] || 'уточняется'; }
function locationName(location) {
  if (Array.isArray(location)) return location.map(locationName).filter(Boolean).join(', ');
  if (typeof location === 'string') return text(location);
  return text(location?.name) || text(location?.address?.name) || text(location?.address?.addressLocality) || text(location?.address?.addressRegion) || '';
}
function makeEvent(source, item, override = {}) {
  const start = item.startDate || item.start_date || item.startTime || item.date || override.date;
  const date = eventDate(start);
  if (!date || !targetDates.has(date)) return null;
  const title = text(item.name || item.title || item.eventName || override.title);
  const location = locationName(item.location || item.venue || item.place || override.place);
  if (!title || (!isGdanskPlace(location) && !isKnownLocalSource(source.url))) return null;
  if (isVirtualEvent(title, location)) return null;
  const url = item.url || item.link || override.url || source.url;
  const description = text(item.description || item.summary || override.description) || `Найдено автоматическим сбором в источнике ${source.name}; проверьте условия на странице события.`;
  const tags = source.type === 'eventbrite' ? ['Eventbrite', 'автосбор'] : source.type === 'kultura.pl' ? ['kultura.pl', 'автосбор'] : ['автосбор'];
  return {
    id: stableEventId(source.name, title, date, url),
    title, date, time: item.time && item.time !== 'уточняется' ? item.time : eventTime(start), place: location || 'место уточняется', area: 'Gdańsk / Trójmiasto',
    free: /free|bezpłat|darmow|wstęp wolny/i.test(`${item.offers?.price || ''} ${description}`),
    price: 'уточняется', solo: true, outdoor: false, registration: false, tags, description, source: url,
  };
}
function fromStructuredData(source, html) {
  const result = [];
  for (const value of parseJsonScripts(html)) {
    for (const item of flatten(value)) {
      if (isStructuredEvent(item)) {
        const event = makeEvent(source, item);
        if (event) result.push(event);
      }
    }
  }
  return result;
}
function parseEventbrite(source, html) {
  // Eventbrite JSON-LD is accepted only for an explicitly local, in-person venue.
  return fromStructuredData(source, html);
}
function parseKultura(source, html) {
  const result = fromStructuredData(source, html);
  for (const match of html.matchAll(/(?:data-date|data-event-date|eventDate|startDate)["'=:\s]+["']?([^"'<>\s,}]+)/gi)) {
    const date = eventDate(match[1]);
    if (!targetDates.has(date)) continue;
    const around = html.slice(Math.max(0, match.index - 700), match.index + 1000);
    const title = text(around.match(/<(?:h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/i)?.[1]);
    if (title) {
      const event = makeEvent(source, {title, date, description: 'Найдено в календаре Kultura.pl', link: source.url});
      if (event) result.push(event);
    }
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
      if (event) { event.tags = ['городской календарь', 'автосбор']; result.push(event); }
    }
  }
  return result;
}

for (const source of sources) {
  try {
    if (source.type === 'telegram-bot' || source.type === 'telegram-post') {
      checked.push({name: source.name, status: 'manual-interaction-required', parser: source.type, note: 'Telegram content is not publicly readable without an authorized Telegram session or accessible public channel history.'});
      continue;
    }
    const res = await fetch(source.url, {headers: {'user-agent': USER_AGENT, 'accept-language': 'pl,en;q=0.8'}});
    checked.push({name: source.name, status: res.status, parser: source.type === 'informator' ? 'informator-discovery' : source.url.includes('gdansk.pl/wydarzenia') ? 'gdansk-calendar' : source.type === 'eventbrite' ? 'eventbrite-local-only' : source.type === 'kultura.pl' ? 'kultura.pl-local-only' : 'json-ld-events-only'});
    if (!res.ok) continue;
    const html = await res.text();
    if (source.type === 'informator') {
      const candidates = discoverInformatorArticleLinks(html, targetDates).sort((a,b) => b.endDate.localeCompare(a.endDate));
      const fetchedArticles = new Set();
      for (const weekend of targetWeekends) {
        const article = candidates.find(candidate => candidate.startDate <= weekend[1] && candidate.endDate >= weekend[0]);
        if (!article) {
          checked.push({name: `${source.name} — ${formatWeekend(weekend)}`, status: 'not-published', parser: 'informator-discovery'});
          continue;
        }
        if (fetchedArticles.has(article.url)) continue;
        fetchedArticles.add(article.url);
        const articleResponse = await fetch(article.url, {headers: {'user-agent': USER_AGENT, 'accept-language': 'pl,en;q=0.8'}});
        checked.push({name: `${source.name} — актуальная статья`, status: articleResponse.status, parser: 'informator-article', url: article.url});
        if (articleResponse.ok) {
          const articleHtml = await articleResponse.text();
          for (const item of extractInformatorEvents(articleHtml, targetDates, article.url)) {
            const event = makeEvent(source, {...item, location: item.place, url: article.url});
            if (event) {
              event.tags = ['Informator Pomorza', 'автосбор'];
              event.description = item.description;
              event.price = item.price;
              event.free = item.free;
              discovered.push(event);
            }
          }
        }
      }
      continue;
    }
    discovered.push(...parseSource(source, html));
  } catch (error) {
    checked.push({name: source.name, status: 'error', error: String(error)});
  }
}

const unique = [...new Map(discovered.map(event => [event.id, event])).values()];
const retainedEvents = retainDisplayedWeekendEvents(current.events, today);
const removedEvents = current.events.length - retainedEvents.length;
const existingIds = new Set(retainedEvents.map(event => event.id));
const eventKeys = new Set(retainedEvents.map(event => `${event.title.trim().toLocaleLowerCase('ru-RU')}|${event.date}`));
const newEvents = unique.filter(event => {
  const key = `${event.title.trim().toLocaleLowerCase('ru-RU')}|${event.date}`;
  if (existingIds.has(event.id) || eventKeys.has(key)) return false;
  eventKeys.add(key);
  return true;
});
current.events = [...retainedEvents, ...newEvents].sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
current.meta = {...current.meta, lastChecked: new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short'}).format(new Date()), lastRun: 'github-actions', weekend: formatDisplayedWeekends(targetWeekends), targetWeekend: targetWeekends.flat().join(' / '), sourcesChecked: checked.length, newEvents: newEvents.length, removedEvents, sourceStatus: checked};
await fs.writeFile(eventsPath, JSON.stringify(current, null, 2) + '\n');
console.log(JSON.stringify({targetWeekends, removedEvents, checked: checked.length, newEvents: newEvents.length, checkedSources: checked}, null, 2));
