import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverInformatorArticleLinks, extractInformatorEvents} from './informator-parser.mjs';

const targetDates = new Set(['2026-10-24', '2026-10-25']);

test('discovers the article that covers the requested weekend, not the stale weekly article', () => {
  const html = `
    <a href="/artykul/co-robic-w-trojmiescie-w-weekend-16-18-pazdziernika">Co robić w Trójmieście w weekend 16-18 października?</a>
    <a href="/artykul/co-robic-w-trojmiescie-w-weekend-23-25-pazdziernika">Co robić w Trójmieście w weekend 23-25 października?</a>
    <a href="https://example.com/artykul/co-robic-w-trojmiescie-w-weekend-23-25-pazdziernika">Co robić w Trójmieście w weekend 23-25 października?</a>`;
  assert.deepEqual(discoverInformatorArticleLinks(html, targetDates), [{
    url: 'https://informator-pomorza.pl/artykul/co-robic-w-trojmiescie-w-weekend-23-25-pazdziernika',
    title: 'Co robić w Trójmieście w weekend 23-25 października?',
    startDate: '2026-10-23', endDate: '2026-10-25',
  }]);
});

test('extracts only event paragraphs for dates inside the target weekend', () => {
  const article = `
    <div class="text">
      <h3>Co dzieje się w Trójmieście w weekend?</h3>
      <p><strong>Piątek, 23 października</strong></p>
      <p>O godz. 19:00 odbędzie się spektakl „Przed weekendem” w Gdańsku.</p>
      <p><strong>Sobota, 24 października</strong></p>
      <p>W Teatrze Muzycznym w Gdyni odbędzie się spektakl „Sen o mieście” o godz. 18:30. Bilety kosztują 45 zł.</p>
      <p><strong>Niedziela, 25 października</strong></p>
      <p>Wstęp wolny: odbędzie się festiwal „Jesienna scena” w Sopocie o godz. 12:00.</p>
      <p>Fot. redakcja</p><div class="galeria"></div>
    </div>`;
  const events = extractInformatorEvents(article, targetDates, 'https://informator-pomorza.pl/artykul/weekend-23-25-pazdziernika');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => [event.title, event.date, event.time]), [
    ['Sen o mieście', '2026-10-24', '18:30'],
    ['Jesienna scena', '2026-10-25', '12:00'],
  ]);
  assert.equal(events[0].place, 'Teatrze Muzycznym, Gdyni');
  assert.equal(events[0].price, '45 zł');
  assert.equal(events[1].free, true);
});

test('does not invent events when the page has no structured content block', () => {
  assert.deepEqual(extractInformatorEvents('<html><body>Gdańsk weekend events</body></html>', targetDates, 'https://informator-pomorza.pl/test'), []);
});
