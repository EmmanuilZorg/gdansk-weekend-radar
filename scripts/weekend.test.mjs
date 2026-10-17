import test from 'node:test';
import assert from 'node:assert/strict';
import {formatWeekend, isEventUpcoming, retainUpcomingEvents, upcomingWeekend, warsawDate} from '../weekend.mjs';

test('Friday and Saturday belong to the same upcoming weekend', () => {
  assert.deepEqual(upcomingWeekend(new Date('2026-10-16T10:00:00Z')), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(upcomingWeekend(new Date('2026-10-17T10:00:00Z')), ['2026-10-17', '2026-10-18']);
});

test('Sunday advances to the following weekend', () => {
  assert.deepEqual(upcomingWeekend(new Date('2026-10-18T10:00:00Z')), ['2026-10-24', '2026-10-25']);
});

test('weekend calculation handles the year boundary in Warsaw time', () => {
  assert.equal(warsawDate(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.deepEqual(upcomingWeekend(new Date('2026-12-31T23:30:00Z')), ['2027-01-02', '2027-01-03']);
});

test('period label is generated from the calculated dates', () => {
  assert.equal(formatWeekend(['2026-10-17', '2026-10-18']), '17–18 октября 2026');
});

test('only valid events happening today or later are retained', () => {
  const events = [
    {id: 'past', date: '2026-10-16'},
    {id: 'today', date: '2026-10-17'},
    {id: 'future', date: '2026-10-24'},
    {id: 'invalid', date: 'not-a-date'},
  ];
  assert.deepEqual(retainUpcomingEvents(events, '2026-10-17').map(event => event.id), ['today', 'future']);
});

test('same-day events disappear after their end time in Warsaw', () => {
  const now = new Date('2026-10-17T17:20:00Z');
  assert.equal(isEventUpcoming({date: '2026-10-17', time: '19:00'}, now), false);
  assert.equal(isEventUpcoming({date: '2026-10-17', time: '18:00–19:45'}, now), true);
  assert.equal(isEventUpcoming({date: '2026-10-17', time: '20:00'}, now), true);
});

test('collector prunes ended same-day events while preserving future times', () => {
  const events = [
    {id: 'ended', date: '2026-10-17', time: '19:00'},
    {id: 'ongoing', date: '2026-10-17', time: '18:00–19:45'},
    {id: 'later', date: '2026-10-17', time: '20.00'},
  ];
  assert.deepEqual(retainUpcomingEvents(events, '2026-10-17', '19:20').map(event => event.id), ['ongoing', 'later']);
});
