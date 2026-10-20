import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

OUT = Path('data/telegram-events.json')
WARSAW = ZoneInfo('Europe/Warsaw')
CHANNEL_ID = int(os.getenv('TG_CHANNEL_ID', '-1001596565827'))


def weekend_dates():
    today = datetime.now(WARSAW).date()
    day = today.weekday()  # Monday=0
    saturday = today - timedelta(days=1) if day == 6 else today + timedelta(days=5 - day)
    next_saturday = saturday + timedelta(days=7)
    return {d.isoformat() for start in (saturday, next_saturday) for d in (start, start + timedelta(days=1))}


def dates_in(text):
    found = set()
    for d, m, y in re.findall(r'(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?!\d)', text):
        try: found.add(datetime(int(y), int(m), int(d)).date().isoformat())
        except ValueError: pass
    months = {'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12,'stycznia':1,'lutego':2,'marca':3,'kwietnia':4,'maja':5,'czerwca':6,'lipca':7,'sierpnia':8,'września':9,'października':10,'listopada':11,'grudnia':12}
    for d, month, y in re.findall(r'(?<!\d)(\d{1,2})\s+([A-Za-ząćęłńóśźżА-Яа-я]+)\s+(20\d{2})', text, re.I):
        if month.lower() in months:
            try: found.add(datetime(int(y), months[month.lower()], int(d)).date().isoformat())
            except ValueError: pass
    return found


def title_from(text):
    for line in (x.strip(' -–—•#') for x in text.splitlines()):
        line = re.sub(r'https?://\S+', '', line).strip()
        if len(line) >= 8 and not re.match(r'^(дата|date|miejsce|место|время|time)\b', line, re.I):
            return line[:180]
    return 'Событие из Telegram'


def make_event(message, date, text):
    msg_id = message.id
    url = f'https://t.me/c/{abs(CHANNEL_ID) % 1000000000}/{msg_id}'
    time_match = re.search(r'(?<!\d)([01]?\d|2[0-3]):[0-5]\d(?!\d)', text)
    return {
        'id': f'telegram-{abs(CHANNEL_ID)}-{msg_id}-{date}',
        'title': title_from(text), 'date': date, 'time': time_match.group(0) if time_match else 'уточняется',
        'place': 'Gdańsk / Trójmiasto', 'area': 'Gdańsk / Trójmiasto',
        'free': bool(re.search(r'бесплат|bezpłat|darmow|wstęp wolny|free', text, re.I)),
        'price': 'уточняется', 'solo': True, 'outdoor': bool(re.search(r'plener|улиц|outdoor|spacer|прогул', text, re.I)),
        'registration': bool(re.search(r'rejestr|регистрац|zapisy|запис', text, re.I)),
        'tags': ['Telegram', 'автосбор'],
        'description': re.sub(r'\s+', ' ', text).strip()[:800], 'source': url,
    }


async def main():
    OUT.write_text('[]\n', encoding='utf-8')
    api_id, api_hash, session = (os.getenv('TG_API_ID') or '').strip(), (os.getenv('TG_API_HASH') or '').strip(), (os.getenv('TG_SESSION') or '').strip()
    if not (api_id and api_hash and session):
        print('Telegram secrets are not configured; skipping private channel collection.')
        return
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        try:
            api_id_number = int(api_id)
        except ValueError:
            print('Telegram collection skipped: TG_API_ID is not an integer.')
            return
        try:
            session_obj = StringSession(session)
        except ValueError:
            print('Telegram collection skipped: TG_SESSION format is invalid.')
            return
        target = weekend_dates()
        events = []
        async with TelegramClient(session_obj, api_id_number, api_hash) as client:
            async for message in client.iter_messages(CHANNEL_ID, limit=300):
                text = message.message or ''
                if not text or not re.search(r'gdańsk|gdansk|gdañsk|trójmiasto|trojmiasto', text, re.I):
                    continue
                for date in sorted(dates_in(text) & target):
                    events.append(make_event(message, date, text))
        unique = {event['id']: event for event in events}
        OUT.write_text(json.dumps(list(unique.values()), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Telegram collection completed: {len(unique)} events.')
    except Exception as exc:
        # Do not expose Telegram credentials or session data in CI logs.
        OUT.write_text('[]\n', encoding='utf-8')
        print(f'Telegram collection skipped: {type(exc).__name__}')


asyncio.run(main())
