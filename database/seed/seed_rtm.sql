CREATE TEMP TABLE numbered AS
SELECT p.id, row_number() OVER (ORDER BY p.email)::int AS n, a.provider_id
FROM patients p
JOIN assignments a ON a.patient_id = p.id AND a.is_deleted = false
WHERE p.is_deleted = false;

-- ============ ENROLLMENT ============
-- n % 5 <> 4: enrolled.  n % 10 = 4: withdrew.  n % 10 = 9: never enrolled.
INSERT INTO rtm_enrollments (patient_id, provider_id, status, consent_given, consent_date, enrolled_on)
SELECT nu.id, nu.provider_id,
       CASE WHEN nu.n % 5 <> 4 THEN 'Enrolled' WHEN nu.n % 10 = 4 THEN 'Withdrawn' ELSE 'NotEnrolled' END,
       nu.n % 10 <> 9,
       CASE WHEN nu.n % 10 <> 9 THEN current_date - (70 + nu.n % 15) END,
       CASE WHEN nu.n % 10 <> 9 THEN current_date - (70 + nu.n % 15) END
FROM numbered nu
ON CONFLICT (patient_id) DO NOTHING;

-- ============ 30-DAY DOCUMENTATION PERIODS (enrolled patients) ============
INSERT INTO rtm_documentation (patient_id, period_start, period_end, status, updated_by)
SELECT e.patient_id, d.period_start, d.period_start + 29,
       CASE WHEN d.is_current AND e.patient_id IN (SELECT id FROM numbered WHERE n % 6 = 0) THEN 'NotStarted'
            WHEN d.is_current THEN 'InProgress'
            ELSE 'Complete' END,
       e.provider_id
FROM rtm_enrollments e
CROSS JOIN (VALUES (current_date - 59, false), (current_date - 29, true)) AS d(period_start, is_current)
WHERE e.status = 'Enrolled'
ON CONFLICT (patient_id, period_start) DO NOTHING;

-- ============ REVIEWS (provider reviews the patient's app data) ============
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at)
SELECT e.provider_id, e.patient_id, 'Review', t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM rtm_enrollments e
JOIN numbered nu ON nu.id = e.patient_id
CROSS JOIN LATERAL (
  SELECT g,
         date_trunc('day', now()) - make_interval(days => g) + make_interval(hours => 10 + nu.n % 3) AS start_ts,
         4 + (nu.n * g) % 9 AS mins
  FROM generate_series(1, 30) AS g
  WHERE g % (8 + nu.n % 6) = 0
) t
WHERE e.status = 'Enrolled'
  AND NOT EXISTS (SELECT 1 FROM rtm_activities x WHERE x.patient_id = e.patient_id AND x.activity_type = 'Review');

-- ============ COMMUNICATIONS (logged by the provider, happened elsewhere) ============
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, direction, channel, started_at, ended_at, summary)
SELECT e.provider_id, e.patient_id, 'Communication',
       CASE WHEN nu.n % 5 = 1 THEN 'Outbound' ELSE 'Inbound' END,
       CASE WHEN nu.n % 5 = 1 THEN 'Text' ELSE 'Phone' END,
       now() - make_interval(days => 2 + nu.n % 6),
       now() - make_interval(days => 2 + nu.n % 6) + make_interval(mins => CASE WHEN nu.n % 5 = 1 THEN 0 ELSE 10 END),
       CASE WHEN nu.n % 5 = 1 THEN 'Checked in after the drop in app use; no reply yet.'
            ELSE 'Patient called with questions about between-session exercises.' END
FROM rtm_enrollments e
JOIN numbered nu ON nu.id = e.patient_id
WHERE e.status = 'Enrolled' AND nu.n % 5 IN (0, 1)
  AND NOT EXISTS (SELECT 1 FROM rtm_activities x WHERE x.patient_id = e.patient_id AND x.activity_type = 'Communication');

-- ============ MANAGEMENT TIME ============
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at, summary)
SELECT e.provider_id, e.patient_id, 'ManagementTime',
       date_trunc('day', now()) - make_interval(days => d.days_ago) + make_interval(hours => 15),
       date_trunc('day', now()) - make_interval(days => d.days_ago) + make_interval(hours => 15, mins => d.mins),
       'Reviewed trends and updated treatment plan.'
FROM rtm_enrollments e
JOIN numbered nu ON nu.id = e.patient_id
CROSS JOIN (VALUES (5, 12), (18, 15)) AS d(days_ago, mins)
WHERE e.status = 'Enrolled'
  AND nu.n % 3 <> 0
  AND (nu.n % 2 = 0 OR d.days_ago = 5)
  AND NOT EXISTS (SELECT 1 FROM rtm_activities x WHERE x.patient_id = e.patient_id AND x.activity_type = 'ManagementTime');
