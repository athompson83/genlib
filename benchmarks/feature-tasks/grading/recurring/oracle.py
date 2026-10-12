#!/usr/bin/env python3
"""Independent oracle for recurring.hidden.test.ts.

Expands RRULEs with python-dateutil 2.9 (dateutil.rrule) over naive local
wall-clock times, then resolves each wall-clock time to an instant with
zoneinfo using fold=0. PEP 495 fold=0 gives exactly the task's DST rules:
a time in a spring-forward gap uses the offset from before the transition
(so it lands gap-length later), and an ambiguous fall-back time takes the
first (earlier) instant.

Two corrections make the oracle follow RFC 5545 where dateutil does not:

1. DTSTART always counts as the first occurrence (RFC 5545 3.8.5.3, COUNT:
   "The DTSTART property value always counts as the first occurrence").
   dateutil only yields DTSTART when it matches the rule, so an
   unsynchronized start is prepended and counted towards COUNT here.
2. WEEKLY with BYSETPOS: RFC 5545 applies BYSETPOS to the whole interval
   (the full week beginning on WKST) and then discards instances before
   DTSTART. dateutil builds the first week only from DTSTART onwards, so
   positions in the first week are counted over a truncated set. Here the
   rule is expanded from the WKST day of DTSTART's week and filtered.

UNTIL ending in Z is compared with each occurrence's UTC instant (applied
after resolution), because dateutil would compare naive wall times.

Run: python3 oracle.py  -> prints JSON {case: [[originalStart, localStart, startUtc], ...]}
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from itertools import islice
from zoneinfo import ZoneInfo

import dateutil
from dateutil.rrule import rrulestr, rruleset

assert dateutil.__version__.startswith('2.9'), dateutil.__version__

WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
FMT = '%Y-%m-%dT%H:%M:%S'
MAX = datetime(2200, 12, 31, 23, 59, 59)


def parse_local(s):
    return datetime.strptime(s, FMT)


def resolve(tz, naive):
    aware = naive.replace(tzinfo=ZoneInfo(tz), fold=0)
    utc = aware.astimezone(timezone.utc)
    local = utc.astimezone(ZoneInfo(tz)).replace(tzinfo=None)
    return local.strftime(FMT), utc.strftime('%Y-%m-%dT%H:%M:%SZ')


def rule_starts(tz, start, rule, limit_items=20000):
    """Original local starts from the RRULE, RFC 5545 semantics (see module doc)."""
    parts = dict(p.split('=', 1) for p in rule.split(';'))
    count = int(parts.pop('COUNT')) if 'COUNT' in parts else None
    until = parts.pop('UNTIL', None)
    until_utc = None
    if until and until.endswith('Z'):
        until_utc = datetime.strptime(until, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
    elif until:
        parts['UNTIL'] = until
    gen_start = start
    if parts['FREQ'] == 'WEEKLY' and 'BYSETPOS' in parts:
        # RFC 5545 correction 2: BYSETPOS over the whole first week.
        if 'BYDAY' not in parts:
            parts['BYDAY'] = WD[start.weekday()]
        wkst = WD.index(parts.get('WKST', 'MO'))
        gen_start = start - timedelta(days=(start.weekday() - wkst) % 7)
    text = ';'.join(f'{k}={v}' for k, v in parts.items())
    out = []
    for dt in islice(rrulestr(text, dtstart=gen_start), limit_items):
        if dt > MAX:
            break
        if dt < start:
            continue
        out.append(dt)
    # RFC 5545 correction 1: DTSTART is always the first occurrence.
    if not out or out[0] != start:
        out.insert(0, start)
    if count is not None:
        out = out[:count]
    if until_utc is not None:
        kept = []
        for dt in out:
            if datetime.strptime(resolve(tz, dt)[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc) > until_utc:
                break
            kept.append(dt)
        out = kept
    return out


def occurrences(tz, start, rule, exdates=(), rdates=(), limit_items=20000):
    start = parse_local(start)
    rs = rruleset()
    for dt in rule_starts(tz, start, rule, limit_items) if rule else [start]:
        rs.rdate(dt)
    for r in rdates:
        rs.rdate(parse_local(r))
    for x in exdates:
        rs.exdate(parse_local(x))
    rows = []
    for dt in rs:
        local, utc = resolve(tz, dt)
        rows.append([dt.strftime(FMT), local, utc])
    rows.sort(key=lambda r: (r[2], r[0]))
    return rows


def plain_dateutil(start, rule, n=6):
    """What dateutil alone yields (for the divergence comments)."""
    return [d.strftime(FMT) for d in islice(rrulestr(rule, dtstart=parse_local(start)), n)]


NY, LON, LHI, SCL = 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'America/Santiago'

CASES = {
    # DST: New York
    'ny_weekly': (NY, '2026-03-02T09:00:00', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=8'),
    'ny_gap': (NY, '2026-03-07T02:30:00', 'FREQ=DAILY;COUNT=3'),
    'ny_fold': (NY, '2026-10-30T01:30:00', 'FREQ=DAILY;COUNT=4'),
    # DST: London
    'lon_gap': (LON, '2026-03-27T01:30:00', 'FREQ=DAILY;COUNT=4'),
    'lon_fold': (LON, '2026-10-18T01:15:00', 'FREQ=WEEKLY;BYDAY=SU;COUNT=3'),
    'lon_dst_days': (LON, '2026-03-29T01:30:00', 'FREQ=YEARLY;BYMONTH=3,10;BYDAY=-1SU;COUNT=6'),
    # DST: Lord Howe (30-minute shift)
    'lhi_gap': (LHI, '2026-10-02T02:15:00', 'FREQ=DAILY;COUNT=4'),
    'lhi_fold': (LHI, '2026-04-03T01:45:00', 'FREQ=DAILY;COUNT=4'),
    # DST: Santiago (transitions at local midnight)
    'scl_fold': (SCL, '2026-03-21T23:30:00', 'FREQ=WEEKLY;BYDAY=SA;COUNT=4'),
    'scl_gap': (SCL, '2026-09-04T00:30:00', 'FREQ=DAILY;COUNT=4'),
    # Monthly / yearly BY rules
    'm_2tu': (NY, '2026-01-13T18:00:00', 'FREQ=MONTHLY;BYDAY=2TU;COUNT=6'),
    'm_last_fri': (LON, '2026-01-30T17:00:00', 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=6'),
    'm_monthday_neg': (NY, '2026-01-15T08:00:00', 'FREQ=MONTHLY;BYMONTHDAY=-1,15;COUNT=7'),
    'm_31st': (NY, '2026-01-31T10:00:00', 'FREQ=MONTHLY;COUNT=6'),
    'm_interval_ord': (NY, '2026-01-05T07:00:00', 'FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO,-1MO;COUNT=6'),
    'm_fri13': (NY, '2026-02-13T20:00:00', 'FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=4'),
    'y_thanksgiving': (NY, '2026-11-26T12:00:00', 'FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=4'),
    'y_leap': (NY, '2028-02-29T09:00:00', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=3'),
    'y_20mo': (NY, '2026-05-18T09:00:00', 'FREQ=YEARLY;BYDAY=20MO;COUNT=3'),
    # BYSETPOS
    'sp_last_weekday': (NY, '2026-01-30T16:00:00', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=6'),
    'sp_weekend_ends': (LON, '2026-01-03T10:00:00', 'FREQ=MONTHLY;BYDAY=SA,SU;BYSETPOS=1,-1;COUNT=6'),
    'sp_us_dst_day': (NY, '2026-03-08T02:30:00', 'FREQ=YEARLY;BYMONTH=3;BYDAY=SU;BYSETPOS=2;COUNT=4'),
    'sp_weekly_mwf': (NY, '2026-03-04T09:00:00', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYSETPOS=2;COUNT=4'),
    'sp_weekly_tuth': (LON, '2026-10-29T18:00:00', 'FREQ=WEEKLY;BYDAY=TU,TH;BYSETPOS=2;COUNT=3'),
    # WKST
    'wkst_mo': (NY, '2026-08-04T09:00:00', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO'),
    'wkst_su': (NY, '2026-08-04T09:00:00', 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU'),
    # UNTIL
    'until_utc': (NY, '2026-03-05T09:00:00', 'FREQ=DAILY;UNTIL=20260309T130000Z'),
    'until_floating': (NY, '2026-10-04T01:30:00', 'FREQ=WEEKLY;UNTIL=20261101T013000'),
    # DTSTART not matching the rule
    'unsync_start': (NY, '2026-03-04T09:00:00', 'FREQ=WEEKLY;BYDAY=MO;COUNT=3'),
}


def main():
    out = {}
    for name, (tz, start, rule) in CASES.items():
        out[name] = occurrences(tz, start, rule)
    # EXDATE / RDATE (rruleset)
    out['ex_rdate'] = occurrences(NY, '2026-03-02T09:00:00', 'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
                                  exdates=['2026-03-09T09:00:00', '2026-03-20T09:00:00'],
                                  rdates=['2026-03-11T14:00:00', '2026-03-16T09:00:00', '2026-03-20T09:00:00', '2026-04-06T09:00:00'])
    # Long COUNT series, queried far ahead: keep the tail only.
    long_rows = occurrences(LON, '2026-01-05T08:00:00', 'FREQ=WEEKLY;BYDAY=MO,TH;COUNT=2010', limit_items=5000)
    assert len(long_rows) == 2010
    out['long_count_tail'] = long_rows[-8:]
    # Infinite daily series, a week in 2150.
    inf = rrulestr('FREQ=DAILY', dtstart=parse_local('2026-01-01T07:45:00'))
    week = [d for d in islice(inf.xafter(datetime(2150, 3, 5), inc=True), 7)]
    out['far_2150'] = [[d.strftime(FMT), *resolve(NY, d)] for d in week]
    # Where plain dateutil differs from RFC 5545 (printed to stderr for the record).
    for name in ('sp_weekly_mwf', 'sp_weekly_tuth', 'unsync_start'):
        tz, start, rule = CASES[name]
        print(f'# {name}: dateutil alone -> {plain_dateutil(start, rule, 4)}', file=sys.stderr)
    json.dump(out, sys.stdout, indent=1)
    print()


if __name__ == '__main__':
    main()
