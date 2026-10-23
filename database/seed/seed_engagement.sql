-- Same numbering as seed_therapy.sql: the 40 Synthea patients get n = 1..40
CREATE TEMP TABLE numbered AS
SELECT id, row_number() OVER (ORDER BY email)::int AS n
FROM patients
WHERE is_deleted = false
  AND email NOT IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                    'sophia.patel@example.com',  'arthur.p@example.com');

-- Number the modules 1..4 within each platform so we can pick one by arithmetic
CREATE TEMP TABLE mod_pick AS
SELECT id, platform,
       row_number() OVER (PARTITION BY platform ORDER BY name)::int AS k
FROM modules
WHERE is_deleted = false;

-- One row per (patient, day-ago) when the patient used the app. n % 5 = the engagement style:
--   0 steady (every other day, XR + mobile)   1 drop-off (daily, then stops 2 weeks ago)
--   2 mobile only (every 3rd day)             3 XR only (every 3rd day)
--   4 sporadic (every 5th day, mobile)
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
SELECT nu.id, mp.id, s.start_ts, s.start_ts + make_interval(mins => s.mins)
FROM numbered nu
CROSS JOIN LATERAL (
  SELECT g,
         date_trunc('day', now()) - make_interval(days => g)
           + make_interval(hours => 17 + nu.n % 4) AS start_ts,
         8 + (nu.n * g * 7) % 18 AS mins,
         CASE nu.n % 5
           WHEN 0 THEN CASE WHEN g % 4 = 0 THEN 'XR' ELSE 'Mobile' END
           WHEN 1 THEN 'XR'
           WHEN 2 THEN 'Mobile'
           WHEN 3 THEN 'XR'
           ELSE 'Mobile' END AS platform
  FROM generate_series(1, 30) AS g
  WHERE CASE nu.n % 5
          WHEN 0 THEN g % 2 = 0
          WHEN 1 THEN g >= 14 OR g = 3
          WHEN 2 THEN g % 3 = 0
          WHEN 3 THEN g % 3 = 1
          ELSE g % 5 = 0 END
) s
JOIN mod_pick mp ON mp.platform = s.platform AND mp.k = 1 + (nu.n + s.g) % 4
WHERE NOT EXISTS (SELECT 1 FROM sessions x WHERE x.patient_id = nu.id);

-- Mood (1 low .. 5 high) after every other session.
-- Most patients slowly improve; the drop-off group (n % 5 = 1) has low recent scores.
INSERT INTO response_entries (patient_id, session_id, mood_score, recorded_at)
SELECT s.patient_id, s.id,
       GREATEST(1, LEAST(5,
         CASE WHEN nu.n % 5 = 1 AND d.days_ago < 14 THEN 2
              ELSE 2 + (30 - d.days_ago) / 12 + (nu.n + d.days_ago) % 2 END)),
       s.ended_at
FROM sessions s
JOIN numbered nu ON nu.id = s.patient_id
CROSS JOIN LATERAL (SELECT (now()::date - s.started_at::date) AS days_ago) d
WHERE d.days_ago % 2 = 0
  AND NOT EXISTS (SELECT 1 FROM response_entries r WHERE r.patient_id = nu.id);
