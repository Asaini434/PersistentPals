-- Gives every provider a realistic "today" so the admin day view has something to show.
-- Safe to rerun on any day (it skips providers who already have sessions today).
-- Run it during the day: sessions are scheduled 9:00 to 15:50 New York time.
CREATE TEMP TABLE day_start AS
SELECT (date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York') AS ts;

-- Each provider's patients, numbered 1.. in a stable order
CREATE TEMP TABLE prov_patients AS
SELECT a.provider_id, a.patient_id,
       row_number() OVER (PARTITION BY a.provider_id ORDER BY p.email)::int AS k
FROM assignments a
JOIN patients p ON p.id = a.patient_id AND p.is_deleted = false
JOIN users u ON u.id = a.provider_id AND u.role = 'Provider'
WHERE a.is_deleted = false;

-- Four therapy sessions per provider
INSERT INTO clinical_sessions (provider_id, patient_id, mode, started_at, ended_at)
SELECT pp.provider_id, pp.patient_id,
       CASE WHEN pp.k % 2 = 0 THEN 'Remote' ELSE 'InPerson' END,
       d.ts + s.start_offset,
       d.ts + s.start_offset + interval '50 minutes'
FROM prov_patients pp
CROSS JOIN day_start d
JOIN (VALUES (1, interval '9 hours'), (2, interval '10 hours 30 minutes'),
             (3, interval '13 hours'), (4, interval '15 hours')) AS s(k, start_offset) ON s.k = pp.k
WHERE NOT EXISTS (
  SELECT 1 FROM clinical_sessions x
  CROSS JOIN day_start d2
  WHERE x.provider_id = pp.provider_id AND x.started_at >= d2.ts AND x.started_at < d2.ts + interval '1 day'
);

-- Chart-review time on three clients per provider (feeds "time spent per client")
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at)
SELECT pp.provider_id, pp.patient_id, 'Review',
       now() - make_interval(mins => 40 + pp.k * 45),
       now() - make_interval(mins => 40 + pp.k * 45) + make_interval(mins => 6 + pp.k * 3)
FROM prov_patients pp
CROSS JOIN day_start d
WHERE pp.k <= 3
  AND NOT EXISTS (
    SELECT 1 FROM rtm_activities x
    WHERE x.provider_id = pp.provider_id AND x.activity_type = 'Review' AND x.started_at >= d.ts
  );

-- Two new notes per provider today
INSERT INTO provider_notes (provider_id, patient_id, note_type, content, date_created)
SELECT pp.provider_id, pp.patient_id, 'TrendLog',
       CASE pp.k WHEN 1 THEN 'Engagement steady this week; mood check-ins consistently positive.'
                 ELSE 'App use has slowed. Plan to check in at the next session.' END,
       now() - make_interval(mins => 20 * pp.k)
FROM prov_patients pp
CROSS JOIN day_start d
WHERE pp.k <= 2
  AND NOT EXISTS (
    SELECT 1 FROM provider_notes x
    WHERE x.provider_id = pp.provider_id AND x.note_type = 'TrendLog' AND x.date_created >= d.ts
  );