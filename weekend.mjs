const TIME_ZONE = 'Europe/Warsaw';
const DAY_MS = 24 * 60 * 60 * 1000;

export function warsawDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function upcomingWeekend(date = new Date()) {
  const today = warsawDate(date);
  const [year, month, day] = today.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date);
  const daysFromTodayToSaturday = ({Sun: 6, Mon: 5, Tue: 4, Wed: 3, Thu: 2, Fri: 1, Sat: 0})[weekday];
  const saturday = new Date(Date.UTC(year, month - 1, day + daysFromTodayToSaturday));
  const sunday = new Date(saturday.getTime() + DAY_MS);
  const iso = value => value.toISOString().slice(0, 10);
  return [iso(saturday), iso(sunday)];
}

export function formatWeekend([saturday, sunday]) {
  const format = value => Object.fromEntries(new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(new Date(`${value}T12:00:00Z`)).map(({type, value: part}) => [type, part]));
  const {day: satDay, month: satMonth, year: satYear} = format(saturday);
  const {day: sunDay, month: sunMonth, year: sunYear} = format(sunday);
  if (satMonth === sunMonth && satYear === sunYear) return `${satDay}–${sunDay} ${sunMonth} ${satYear}`;
  return `${satDay} ${satMonth} — ${sunDay} ${sunMonth} ${sunYear}`;
}

export function retainUpcomingEvents(events, today = warsawDate()) {
  return events.filter(event => /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date >= today);
}

export function formatWeekendTab(date, weekday) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = new Intl.DateTimeFormat('ru-RU', {timeZone: 'UTC', day: 'numeric'}).format(value);
  const month = new Intl.DateTimeFormat('ru-RU', {timeZone: 'UTC', month: 'short'}).format(value).replace('.', '');
  return `${weekday} ${day} ${month}`;
}
