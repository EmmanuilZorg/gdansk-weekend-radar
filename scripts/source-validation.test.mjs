import test from 'node:test';
import assert from 'node:assert/strict';
import {isGdanskPlace, isKnownLocalSource, isStructuredEvent, isVirtualEvent} from './source-validation.mjs';

test('global event results need an explicit Gdańsk/Tricity location', () => {
  assert.equal(isGdanskPlace('Gdańsk, Poland'), true);
  assert.equal(isGdanskPlace('Gdynia'), true);
  assert.equal(isGdanskPlace('Online event'), false);
  assert.equal(isGdanskPlace('Warsaw'), false);
});

test('only known city-specific source pages may omit an event location', () => {
  assert.equal(isKnownLocalSource('https://www.gdansk.pl/wydarzenia'), true);
  assert.equal(isKnownLocalSource('https://ecs.gda.pl/wydarzenia/'), true);
  assert.equal(isKnownLocalSource('https://culture.pl/pl/wydarzenia'), false);
});

test('schema objects need an explicit Event type', () => {
  assert.equal(isStructuredEvent({'@type': 'Event'}), true);
  assert.equal(isStructuredEvent({'@type': ['Thing', 'MusicEvent']}), true);
  assert.equal(isStructuredEvent({'@type': 'Article', datePublished: '2026-10-18'}), false);
  assert.equal(isStructuredEvent({startDate: '2026-10-18'}), false);
});

test('online event results are rejected', () => {
  assert.equal(isVirtualEvent('Concert livestream', ''), true);
  assert.equal(isVirtualEvent('Local concert', 'Gdańsk'), false);
});
