import {createHash} from 'node:crypto';

export function isGdanskPlace(location = '') {
  return /gdańsk|gdansk|gdynia|sopot|trójmiast|trojmiast/i.test(String(location));
}

export function isKnownLocalSource(url = '') {
  return /(?:^|\.)gdansk\.pl\//i.test(url) || /ecs\.gda\.pl\//i.test(url) ||
    /openhouseworldwide\.org\/gdansk/i.test(url) || /informator-pomorza\.pl/i.test(url) ||
    /t\.me\/s\/trojmiast/i.test(url);
}

export function isStructuredEvent(item) {
  const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
  return types.some(type => typeof type === 'string' && /Event$/i.test(type));
}

export function isVirtualEvent(title = '', location = '') {
  return /\b(?:online|virtual|virtually|livestream|livestreamed|streaming)\b|wydarzenie\s+online|online event/i.test(`${title} ${location}`);
}

export function stableEventId(sourceName, title, date, url) {
  const digest = createHash('sha256').update(`${sourceName}-${title}-${date}-${url}`).digest('hex').slice(0, 24);
  return `auto-${digest}`;
}
