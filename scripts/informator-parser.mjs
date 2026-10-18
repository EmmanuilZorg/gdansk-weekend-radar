const MONTHS = new Map([
  ['stycznia', '01'], ['lutego', '02'], ['marca', '03'], ['kwietnia', '04'],
  ['maja', '05'], ['czerwca', '06'], ['lipca', '07'], ['sierpnia', '08'],
  ['września', '09'], ['października', '10'], ['listopada', '11'], ['grudnia', '12'],
]);

function decode(value = '') {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&bdquo;|&#8222;/gi, '„')
    .replace(/&ldquo;|&#8220;/gi, '“').replace(/&rdquo;|&#8221;/gi, '”')
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, '–').replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&oacute;/gi, 'ó').replace(/&aacute;/gi, 'á').replace(/&eogon;/gi, 'ę')
    .replace(/&oelig;/gi, 'œ').replace(/&oacute;/gi, 'ó').replace(/&ecirc;/gi, 'ê')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function plain(value = '') {
  return decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function monthNumber(month) { return MONTHS.get(month.toLocaleLowerCase('pl-PL')); }

function datesInArticleTitle(title, year) {
  const clean = decode(title).toLocaleLowerCase('pl-PL');
  const months = [...MONTHS.keys()].join('|');
  const match = clean.match(new RegExp(`(?:weekend\\s+)?(\\d{1,2})(?:\\s*[-–]\\s*(\\d{1,2}))?\\s+(${months})(?:\\s+(\\d{4}))?`, 'i'));
  if (!match) return [];
  const [, firstDay, lastDay, month, explicitYear] = match;
  const y = Number(explicitYear || year);
  const first = `${y}-${monthNumber(month)}-${firstDay.padStart(2, '0')}`;
  const last = `${y}-${monthNumber(month)}-${(lastDay || firstDay).padStart(2, '0')}`;
  return [first, last];
}

export function discoverInformatorArticleLinks(html, targetDates) {
  const targets = [...targetDates].sort();
  if (!targets.length) return [];
  const dates = new Set(targets);
  const year = targets[0].slice(0, 4);
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*\/artykul\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(match[1], 'https://informator-pomorza.pl').href;
    if (new URL(url).hostname !== 'informator-pomorza.pl') continue;
    const title = plain(match[2]);
    if (!/co robić w trójmieście w weekend/i.test(title + ' ' + url)) continue;
    const [start, end] = datesInArticleTitle(title || url, year);
    if (!start || !end) continue;
    if (![...dates].some(date => date >= start && date <= end)) continue;
    links.push({url, title, startDate: start, endDate: end});
  }
  return [...new Map(links.map(link => [link.url, link])).values()];
}

function extractTitle(paragraph) {
  const quoted = paragraph.match(/[„“"]([^”"]{2,100})[”"]/);
  if (quoted) return quoted[1].trim();
  const named = paragraph.match(/\b(?:Targi|Festiwal|Koncert|Spektakl|Mecz|Wystawa|Pokaz|Premiera|Warsztaty|Spotkanie)\s+[A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\p{N}'’&-]*(?:\s+[A-ZŁŚŻŹĆŃÓĄĘ][\p{L}\p{N}'’&-]*){0,6}/u);
  if (named) return named[0].trim();
  const properName = paragraph.match(/\b(?:John Porter|Nocny Kochanek|Stare Dobre Małżeństwo|Grupa MoCarta|Nocny Kochanek|The Echoes Project)\b/u);
  return properName?.[0] || '';
}

function parsePolishDay(block, year) {
  const match = block.match(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\b/i);
  if (!match) return '';
  return `${year}-${monthNumber(match[2])}-${match[1].padStart(2, '0')}`;
}

export function extractInformatorEvents(html, targetDates, articleUrl) {
  const target = new Set(targetDates);
  const year = [...target][0]?.slice(0, 4);
  if (!year) return [];
  const container = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*galeria|<div\b[^>]*id=["']komentarze)/gi)]
    .map(match => match[1]).find(block => /Co dzieje się w Trójmieście w weekend/i.test(plain(block)));
  if (!container) return [];

  const blocks = [...container.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const events = [];
  let currentDate = '';
  for (const block of blocks) {
    const markup = block[1] || block[2] || '';
    const text = plain(markup);
    const dayDate = parsePolishDay(text, year);
    if (dayDate) currentDate = dayDate;
    if (!currentDate || !target.has(currentDate) || !/\b(?:godz\.?|o\s+\d{1,2}[.:]\d{2}|koncert|spektakl|targi|festiwal|mecz|wystaw|pokaz|spotkanie|warsztat|premier|wydarzenie)\b/i.test(text)) continue;
    const title = extractTitle(text);
    if (!title || /^Co dzieje się/i.test(title)) continue;
    const times = [...text.matchAll(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\b/g)].map(match => `${match[1].padStart(2, '0')}:${match[2]}`);
    const venue = text.match(/\b(Plenum|B90|Starym Maneżu|Teatrze Atelier|Teatrze Muzycznym|Teatr Gdynia Główna|Operze Bałtyckiej|Filharmonii Bałtyckiej|Europejskim Centrum Solidarności|Blues Club)\b/i)?.[1];
    const city = text.match(/\b(Gdańsku|Gdańsk|Gdyni|Gdynia|Sopocie|Sopot)\b/i)?.[1];
    const location = [venue, city].filter(Boolean).join(', ') || (city || 'Trójmiasto (szczegóły w artykule)');
    const priceMatch = text.match(/(?:bilet\w*|cena\w*|koszt\w*|wstęp)[^.!?]{0,60}?\b(\d{1,4})\s*(zł|PLN)/i);
    const free = /bezpłatn|wstęp wolny/i.test(text);
    events.push({
      title,
      date: currentDate,
      time: times[0] || 'уточняется',
      place: decode(location),
      free,
      price: free ? 'Бесплатно' : priceMatch ? `${priceMatch[1]} zł` : 'Условия на странице источника',
      description: text,
      source: articleUrl,
    });
  }
  return [...new Map(events.map(event => [`${event.title.toLocaleLowerCase('pl-PL')}|${event.date}`, event])).values()];
}
