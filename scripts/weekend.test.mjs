import test from 'node:test';
import assert from 'node:assert/strict';
import {displayWeekends, formatDisplayedWeekends, formatWeekend, isEventInDisplayWindow, upcomingWeekend, warsawDate, retainDisplayedWeekendEvents} from '../weekend.mjs';

test('upcoming weekend calculation remains Warsaw-local at week boundaries', () => {
  assert.deepEqual(upcomingWeekend(new Date('2026-10-16T10:00:00Z')), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(upcomingWeekend(new Date('2026-10-17T10:00:00Z')), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(upcomingWeekend(new Date('2026-10-18T10:00:00Z')), ['2026-10-24', '2026-10-25']);
});

test('on Saturday or Sunday the calendar shows the ongoing weekend and the next one', () => {
  const expected = [['2026-10-17', '2026-10-18'], ['2026-10-24', '2026-10-25']];
  assert.deepEqual(displayWeekends(new Date('2026-10-17T10:00:00Z')), expected);
  assert.deepEqual(displayWeekends(new Date('2026-10-18T10:00:00Z')), expected);
});

test('on weekdays the calendar shows the next and following weekends', () => {
  assert.deepEqual(displayWeekends(new Date('2026-10-19T10:00:00Z')), [['2026-10-24', '2026-10-25'], ['2026-10-31', '2026-11-01']]);
});

test('display weekend ranges handle year boundaries in Warsaw time', () => {
  const date = new Date('2026-12-27T10:00:00Z');
  assert.equal(warsawDate(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.deepEqual(displayWeekends(date), [['2026-12-26', '2026-12-27'], ['2027-01-02', '2027-01-03']]);
});

test('period labels are formatted for both weekends', () => {
  assert.equal(formatWeekend(['2026-10-17', '2026-10-18']), '17–18 октября 2026');
  assert.equal(formatDisplayedWeekends([['2026-10-17', '2026-10-18'], ['2026-10-24', '2026-10-25']]), '17–18 октября 2026 и 24–25 октября 2026');
});

test('current-weekend events stay visible through Sunday, including passed event times', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  assert.equal(isEventInDisplayWindow({date: '2026-10-17', time: '09:00'}, now), true);
  assert.equal(isEventInDisplayWindow({date: '2026-10-18', time: '09:00'}, now), true);
  assert.equal(isEventInDisplayWindow({date: '2026-10-24', time: '09:00'}, now), true);
  assert.equal(isEventInDisplayWindow({date: '2026-10-31', time: '09:00'}, now), false);
  assert.equal(isEventInDisplayWindow({date: 'not-a-date'}, now), false);
});

test('collector retains both displayed weekends until the ongoing weekend ends', () => {
  const events = [
    {id: 'friday', date: '2026-10-16'},
    {id: 'saturday', date: '2026-10-17', time: '10:00'},
    {id: 'sunday', date: '2026-10-18', time: '10:00'},
    {id: 'next-saturday', date: '2026-10-24'},
    {id: 'next-sunday', date: '2026-10-25'},
    {id: 'later', date: '2026-10-31'},
  ];
  assert.deepEqual(retainDisplayedWeekendEvents(events, '2026-10-18').map(event => event.id), ['saturday', 'sunday', 'next-saturday', 'next-sunday']);
  assert.deepEqual(retainDisplayedWeekendEvents(events, '2026-10-19').map(event => event.id), ['next-saturday', 'next-sunday', 'later']);
});
