const polishMonths = new Map([
  ['stycznia','01'], ['lutego','02'], ['marca','03'], ['kwietnia','04'],
  ['maja','05'], ['czerwca','06'], ['lipca','07'], ['sierpnia','08'],
  ['września','09'], ['października','10'], ['listopada','11'], ['grudnia','12'],
]);

function plainText(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function extractGdanskEventCards(html, targetDates) {
  const dates = targetDates instanceof Set ? targetDates : new Set(targetDates);
  const year = String([...dates][0] || '').slice(0, 4);
  const results = [];
  const anchors = /<a\b[^>]*href=["'](https:\/\/www\.gdansk\.pl\/wydarzenia\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchors)) {
    const [, url, card] = match;
    const titleMarkup = card.match(/<div[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMarkup ? plainText(titleMarkup[1]) : '';
    if (!title) continue;

    const cardText = plainText(card);
    const timeMatch = cardText.match(/(?:^|\s)(\d{1,2})[.:](\d{2})(?=\s|$)/);
    const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : 'уточняется';
    for (const dateMatch of cardText.matchAll(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\b/gi)) {
      const day = dateMatch[1].padStart(2, '0');
      const month = polishMonths.get(dateMatch[2].toLocaleLowerCase('pl-PL'));
      const date = `${year}-${month}-${day}`;
      if (dates.has(date)) results.push({title, date, time, url});
    }
  }

  return [...new Map(results.map(event => [`${event.url}|${event.date}`, event])).values()];
}
