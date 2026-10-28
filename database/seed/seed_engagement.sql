-- App usage for the 40 Synthea patients: which modules they use, when in the day, and mood after.
-- Same numbering as seed_therapy.sql: the patients get n = 1..40.
-- Safe to rerun: a patient who already has sessions is skipped. To regenerate, run
-- database/maintenance/reseed_engagement.sql first.
CREATE TEMP TABLE numbered AS
SELECT id, row_number() OVER (ORDER BY email)::int AS n
FROM patients
WHERE is_deleted = false
  AND email NOT IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                    'sophia.patel@example.com',  'arthur.p@example.com');

-- Pool of modules to pick from (the Training Tutorial is handled separately below).
-- prog_rank / k_prog: position of the program and of the module inside it; k_plat: position inside the platform.
CREATE TEMP TABLE mod_pick AS
SELECT m.id, m.platform, m.program,
       dense_rank() OVER (PARTITION BY m.platform ORDER BY m.program)::int AS prog_rank,
       row_number() OVER (PARTITION BY m.platform, m.program ORDER BY m.name)::int AS k_prog,
       count(*)     OVER (PARTITION BY m.platform, m.program)::int AS prog_size,
       row_number() OVER (PARTITION BY m.platform ORDER BY m.program, m.name)::int AS k_plat,
       count(*)     OVER (PARTITION BY m.platform)::int AS plat_size
FROM modules m
WHERE m.is_deleted = false AND m.program <> '' AND m.name <> 'Training Tutorial';

-- One row per (patient, day-ago) the patient used the app. n % 5 = how often / which platform:
--   0 steady (every other day, XR + mobile)   1 drop-off (daily, then stops about 9 days ago)
--   2 mobile only (every 3rd day)             3 XR only (every 3rd day)
--   4 sporadic (every 5th day, mobile)
-- Time of day: each patient has a usual slot (morning, midday, evening or late night) plus some drift,
-- and uses their favourite program on most days. Times are America/New_York.
CREATE TEMP TABLE plan AS
SELECT nu.id AS patient_id, nu.n, s.g, s.platform,
       (s.local_midnight + make_interval(hours => s.hr, mins => s.jitter)) AT TIME ZONE 'America/New_York' AS start_ts,
       s.mins,
       ((nu.n * s.g) % 3 <> 0) AS use_fav,
       (s.platform = 'XR' AND row_number() OVER (PARTITION BY nu.id, s.platform ORDER BY s.g DESC) = 1) AS is_tutorial
FROM numbered nu
CROSS JOIN LATERAL (
  SELECT g,
         date_trunc('day', now() AT TIME ZONE 'America/New_York') - make_interval(days => g) AS local_midnight,
         CASE WHEN g % 6 = 0 THEN LEAST(base.hr + 4, 22) ELSE base.hr END AS hr,
         (nu.n * g * 11) % 75 AS jitter,
         8 + (nu.n * g * 7) % 18 + CASE WHEN plat.platform = 'XR' THEN 6 ELSE 0 END AS mins,
         plat.platform
  FROM generate_series(1, 30) AS g
  CROSS JOIN LATERAL (
    SELECT CASE nu.n % 5
             WHEN 0 THEN CASE WHEN g % 4 = 0 THEN 'XR' ELSE 'Mobile' END
             WHEN 1 THEN 'XR'
             WHEN 2 THEN 'Mobile'
             WHEN 3 THEN 'XR'
             ELSE 'Mobile' END AS platform
  ) plat
  CROSS JOIN LATERAL (
    SELECT CASE (nu.n * 3 + nu.n / 5) % 4 WHEN 0 THEN 7 WHEN 1 THEN 12 WHEN 2 THEN 18 ELSE 21 END AS hr
  ) base
  WHERE CASE nu.n % 5
          WHEN 0 THEN g % 2 = 0
          WHEN 1 THEN g >= 9
          WHEN 2 THEN g % 3 = 0
          WHEN 3 THEN g % 3 = 1
          ELSE g % 5 = 0 END
) s
WHERE NOT EXISTS (SELECT 1 FROM sessions x WHERE x.patient_id = nu.id);

-- Every client's first VR session is the Training Tutorial
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
SELECT p.patient_id, m.id, p.start_ts, p.start_ts + make_interval(mins => p.mins)
FROM plan p
JOIN modules m ON m.name = 'Training Tutorial' AND m.platform = 'XR' AND m.is_deleted = false
WHERE p.is_tutorial;

-- All other sessions: favourite program most days, anything else the rest of the time
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
SELECT p.patient_id, mp.id, p.start_ts, p.start_ts + make_interval(mins => p.mins)
FROM plan p
JOIN mod_pick mp ON mp.platform = p.platform
 AND ( (p.use_fav     AND mp.prog_rank = 1 + p.n % 4 AND mp.k_prog = 1 + p.g % mp.prog_size)
    OR (NOT p.use_fav AND mp.k_plat = 1 + (p.n * 3 + p.g) % mp.plat_size) )
WHERE NOT p.is_tutorial;

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
CROSS JOIN LATERAL (SELECT ((now() AT TIME ZONE 'America/New_York')::date
                            - (s.started_at AT TIME ZONE 'America/New_York')::date) AS days_ago) d
WHERE d.days_ago % 2 = 0
  AND NOT EXISTS (SELECT 1 FROM response_entries r WHERE r.patient_id = nu.id);