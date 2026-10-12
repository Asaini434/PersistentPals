-- Providers: the four attending physicians from the mock data, plus one admin
INSERT INTO users (email, display_name, title, specialty, role) VALUES
  ('sarah.jenkins@example.com', 'Dr. Sarah Jenkins', 'Attending Physician', 'Cardiology',  'Provider'),
  ('robert.miller@example.com', 'Dr. Robert Miller', 'Attending Physician', 'Orthopedics', 'Provider'),
  ('amanda.chen@example.com',   'Dr. Amanda Chen',   'Attending Physician', 'Neurology',   'Provider'),
  ('david.ross@example.com',    'Dr. David Ross',    'Attending Physician', 'Pulmonology', 'Provider'),
  ('admin@example.com',         'Admin User',        'Administrator',       '',            'Admin')
ON CONFLICT (email) DO NOTHING;

-- Patients: the four from the mock data (all synthetic)
INSERT INTO patients (email, first_name, last_name, phone, gender, date_of_birth) VALUES
  ('eleanor.vance@example.com', 'Eleanor', 'Vance',     '+1 (555) 234-5678', 'Female', '1984-03-14'),
  ('marcus.brody@example.com',  'Marcus',  'Brody',     '+1 (555) 876-5432', 'Male',   '1958-07-22'),
  ('sophia.patel@example.com',  'Sophia',  'Patel',     '+1 (555) 432-1098', 'Female', '1997-01-09'),
  ('arthur.p@example.com',      'Arthur',  'Pendelton', '+1 (555) 654-9870', 'Male',   '1971-05-30')
ON CONFLICT (email) DO NOTHING;

-- Assignments: each patient goes to their attending physician
INSERT INTO provider_patients (provider_id, patient_id)
SELECT u.id, p.id
FROM (VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com'),
  ('robert.miller@example.com', 'marcus.brody@example.com'),
  ('amanda.chen@example.com',   'sophia.patel@example.com'),
  ('david.ross@example.com',    'arthur.p@example.com')
) AS a(provider_email, patient_email)
JOIN users    u ON u.email = a.provider_email
JOIN patients p ON p.email = a.patient_email
ON CONFLICT (provider_id, patient_id) DO NOTHING;


-- ============ MEDICAL HISTORY (from mock "history", "diagnosis", "allergies") ============
INSERT INTO patient_medical_history (patient_id, condition, status, onset_date, notes)
SELECT p.id, v.condition, v.status, v.onset_date::date, v.notes
FROM (VALUES
  ('eleanor.vance@example.com', 'Acute coronary syndrome',        'Active',   '2026-10-02', 'Admitted via ER with mild chest tightness.'),
  ('eleanor.vance@example.com', 'Hypertension (stage 1)',         'Chronic',  NULL,         ''),
  ('eleanor.vance@example.com', 'Asthma (mild)',                  'Chronic',  NULL,         'No previous surgical complications.'),
  ('eleanor.vance@example.com', 'Penicillin allergy',             'Chronic',  NULL,         ''),
  ('eleanor.vance@example.com', 'Sulfa drug allergy',             'Chronic',  NULL,         ''),
  ('marcus.brody@example.com',  'Total knee arthroplasty, right', 'Active',   '2026-09-28', 'Post-op.'),
  ('marcus.brody@example.com',  'Osteoarthritis of both knees',   'Chronic',  NULL,         ''),
  ('marcus.brody@example.com',  'Type 2 diabetes',                'Chronic',  NULL,         'Controlled with Metformin.'),
  ('marcus.brody@example.com',  'Latex allergy',                  'Chronic',  NULL,         ''),
  ('sophia.patel@example.com',  'Migraine with aura / dehydration','Active',  '2026-10-05', ''),
  ('sophia.patel@example.com',  'Recurrent episodic migraines',   'Chronic',  NULL,         'Triggered by stress and sleep deprivation.'),
  ('arthur.p@example.com',      'Community-acquired pneumonia',   'Resolved', '2026-09-15', ''),
  ('arthur.p@example.com',      'COPD (mild)',                    'Chronic',  NULL,         'Former smoker, quit 2020.'),
  ('arthur.p@example.com',      'Ciprofloxacin allergy',          'Chronic',  NULL,         '')
) AS v(patient_email, condition, status, onset_date, notes)
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM patient_medical_history);

-- ============ CLINICAL SESSIONS + SESSION NOTES (from mock "logs") ============
-- Temp table holds the eight log entries so two inserts can share them.
-- It disappears when psql exits.
CREATE TEMP TABLE seed_logs (
  provider_email text, patient_email text, mode text, local_ts text, note text
);
INSERT INTO seed_logs VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'InPerson', '2026-10-06 14:30', 'Vitals stable. Patient reports zero chest pain after morning medication.'),
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'InPerson', '2026-10-05 09:15', 'ECG performed - normal sinus rhythm observed.'),
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'InPerson', '2026-10-02 11:00', 'Admitted via ER presenting with mild chest tightness.'),
  ('robert.miller@example.com', 'marcus.brody@example.com',  'InPerson', '2026-10-06 11:00', 'Physical therapy session completed: 45° flexion achieved.'),
  ('robert.miller@example.com', 'marcus.brody@example.com',  'InPerson', '2026-10-04 16:20', 'Surgical site clean, dry, and intact with minimal edema.'),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'Remote',   '2026-10-06 08:00', 'Patient reports headache intensity reduced from 8/10 to 1/10.'),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'InPerson', '2026-10-05 22:45', 'IV hydration started, darkness protocol implemented in room.'),
  ('david.ross@example.com',    'arthur.p@example.com',      'InPerson', '2026-09-25 10:00', 'Discharge criteria met. Follow-up scheduled in 2 weeks.');

INSERT INTO clinical_sessions (provider_id, patient_id, mode, started_at, ended_at)
SELECT u.id, p.id, l.mode, t.ts, t.ts + make_interval(mins => 30)
FROM seed_logs l
JOIN users u ON u.email = l.provider_email
JOIN patients p ON p.email = l.patient_email
CROSS JOIN LATERAL (SELECT l.local_ts::timestamp AT TIME ZONE 'America/New_York' AS ts) t
WHERE NOT EXISTS (
  SELECT 1 FROM clinical_sessions cs WHERE cs.patient_id = p.id AND cs.started_at = t.ts
);

INSERT INTO provider_notes (provider_id, patient_id, clinical_session_id, note_type, content, date_created)
SELECT cs.provider_id, cs.patient_id, cs.id, 'SessionNote', l.note, cs.started_at
FROM seed_logs l
JOIN patients p ON p.email = l.patient_email
CROSS JOIN LATERAL (SELECT l.local_ts::timestamp AT TIME ZONE 'America/New_York' AS ts) t
JOIN clinical_sessions cs ON cs.patient_id = p.id AND cs.started_at = t.ts
WHERE NOT EXISTS (SELECT 1 FROM provider_notes n WHERE n.clinical_session_id = cs.id);

-- ============ TREND LOGS (generated, written to match the app usage below) ============
INSERT INTO provider_notes (provider_id, patient_id, note_type, content, date_created)
SELECT u.id, p.id, 'TrendLog', v.content, now() - make_interval(days => v.days_ago)
FROM (VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'Steady engagement, roughly every other day, mostly in the evening.', 4),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'App use dropped off over the past two weeks after a stretch of near-daily sessions. Raise at next visit.', 2)
) AS v(provider_email, patient_email, content, days_ago)
JOIN users u ON u.email = v.provider_email
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM provider_notes n WHERE n.patient_id = p.id AND n.note_type = 'TrendLog');

-- ============ COMMUNICATIONS (generated) ============
INSERT INTO patient_communications (provider_id, patient_id, direction, channel, occurred_at, duration_minutes, summary)
SELECT u.id, p.id, v.direction, v.channel, now() - make_interval(days => v.days_ago), v.mins, v.summary
FROM (VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'Outbound', 'Email', 3, 0,  'Sent a reminder about evening sessions in the app.'),
  ('robert.miller@example.com', 'marcus.brody@example.com',  'Inbound',  'Phone', 5, 12, 'Patient called with questions about at-home exercises.'),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'Outbound', 'Text',  2, 0,  'Checked in after the drop in app use; no reply yet.')
) AS v(provider_email, patient_email, direction, channel, days_ago, mins, summary)
JOIN users u ON u.email = v.provider_email
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM patient_communications);

-- ============ APP SESSIONS (generated, relative to today so the 30-day view is never empty) ============
-- Eleanor: Reflect XR every other day, evenings
INSERT INTO app_sessions (patient_id, module_id, started_at, ended_at)
SELECT p.id, m.id, t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM patients p
CROSS JOIN LATERAL (
  SELECT g AS d,
         date_trunc('day', now()) - make_interval(days => g) + make_interval(hours => 19) AS start_ts,
         10 + (g * 7 % 16) AS mins
  FROM generate_series(1, 30) AS g
  WHERE g % 2 = 0
) t
JOIN modules m ON m.platform = 'XR'
  AND m.name = (ARRAY['Creative Calm','Explore Emotions','Explore Self','Explore Journey'])[1 + (t.d / 2) % 4]
WHERE p.email = 'eleanor.vance@example.com'
  AND NOT EXISTS (SELECT 1 FROM app_sessions a WHERE a.patient_id = p.id);

-- Marcus: mobile, every third day
INSERT INTO app_sessions (patient_id, module_id, started_at, ended_at)
SELECT p.id, m.id, t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM patients p
CROSS JOIN LATERAL (
  SELECT g AS d,
         date_trunc('day', now()) - make_interval(days => g) + make_interval(hours => 19) AS start_ts,
         8 + (g * 5 % 13) AS mins
  FROM generate_series(1, 30) AS g
  WHERE g % 3 = 0
) t
JOIN modules m ON m.platform = 'Mobile'
  AND m.name = (ARRAY['Create','Learn','Reflect','Creative Calm'])[1 + (t.d / 3) % 4]
WHERE p.email = 'marcus.brody@example.com'
  AND NOT EXISTS (SELECT 1 FROM app_sessions a WHERE a.patient_id = p.id);

-- Sophia: XR, near-daily until two weeks ago, then almost nothing (gives the trend feature a story)
INSERT INTO app_sessions (patient_id, module_id, started_at, ended_at)
SELECT p.id, m.id, t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM patients p
CROSS JOIN LATERAL (
  SELECT g AS d,
         date_trunc('day', now()) - make_interval(days => g) + make_interval(hours => 19) AS start_ts,
         12 + (g * 3 % 14) AS mins
  FROM generate_series(1, 30) AS g
  WHERE g >= 13 OR g IN (2, 6)
) t
JOIN modules m ON m.platform = 'XR'
  AND m.name = (ARRAY['Creative Calm','Explore Emotions','Explore Self','Explore Journey'])[1 + t.d % 4]
WHERE p.email = 'sophia.patel@example.com'
  AND NOT EXISTS (SELECT 1 FROM app_sessions a WHERE a.patient_id = p.id);

-- Arthur: discharged, mobile, only a few early sessions
INSERT INTO app_sessions (patient_id, module_id, started_at, ended_at)
SELECT p.id, m.id, t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM patients p
CROSS JOIN LATERAL (
  SELECT g AS d,
         date_trunc('day', now()) - make_interval(days => g) + make_interval(hours => 19) AS start_ts,
         8 + (g * 5 % 11) AS mins
  FROM generate_series(1, 30) AS g
  WHERE g >= 20 AND g % 3 = 0
) t
JOIN modules m ON m.platform = 'Mobile'
  AND m.name = (ARRAY['Create','Learn','Reflect','Creative Calm'])[1 + (t.d / 3) % 4]
WHERE p.email = 'arthur.p@example.com'
  AND NOT EXISTS (SELECT 1 FROM app_sessions a WHERE a.patient_id = p.id);

-- ============ PROVIDER REVIEW SESSIONS (generated, for the admin 30-day calendar) ============
INSERT INTO provider_review_sessions (provider_id, patient_id, started_at, ended_at)
SELECT pp.provider_id, pp.patient_id, t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM provider_patients pp
JOIN users u ON u.id = pp.provider_id
CROSS JOIN LATERAL (
  SELECT g,
         date_trunc('day', now()) - make_interval(days => g)
           + make_interval(hours => 10, mins => length(u.email) % 30) AS start_ts,
         5 + ((g * 3 + length(u.email)) % 16) AS mins
  FROM generate_series(1, 30) AS g
  WHERE (g + length(u.email)) % 3 <> 0
) t
WHERE NOT EXISTS (SELECT 1 FROM provider_review_sessions);