import test from 'node:test';
import assert from 'node:assert/strict';
import {extractGdanskEventCards} from './gdansk-parser.mjs';

const html = `
<a class="thumb" href="https://www.gdansk.pl/wydarzenia/Idzie-Chopin,w,43723">
  <div class="title"><span>Idzie Chopin i…BACH</span></div>
  <div class="date">18 października <div>17.00</div></div>
</a>
<a class="thumb" href="https://www.gdansk.pl/wydarzenia/next-week,w,12345">
  <div class="title"><span>Jazzowy wieczór</span></div>
  <div class="date">24 października <div>19:30</div></div>
</a>`;

test('extracts a matching official Gdańsk event card and normalizes its time', () => {
  assert.deepEqual(extractGdanskEventCards(html, new Set(['2026-10-17', '2026-10-18'])), [
    {title: 'Idzie Chopin i…BACH', date: '2026-10-18', time: '17:00', url: 'https://www.gdansk.pl/wydarzenia/Idzie-Chopin,w,43723'},
  ]);
});

test('does not return events outside the target weekend', () => {
  assert.deepEqual(extractGdanskEventCards(html, new Set(['2026-10-24', '2026-10-25'])).map(event => event.date), ['2026-10-24']);
});
