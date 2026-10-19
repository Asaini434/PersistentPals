CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ PEOPLE ============
INSERT INTO users (email, display_name, title, specialty, role) VALUES
  ('sarah.jenkins@example.com', 'Dr. Sarah Jenkins', 'Attending Physician', 'Cardiology',  'Provider'),
  ('robert.miller@example.com', 'Dr. Robert Miller', 'Attending Physician', 'Orthopedics', 'Provider'),
  ('amanda.chen@example.com',   'Dr. Amanda Chen',   'Attending Physician', 'Neurology',   'Provider'),
  ('david.ross@example.com',    'Dr. David Ross',    'Attending Physician', 'Pulmonology', 'Provider'),
  ('admin@example.com',         'Admin User',        'Administrator',       '',            'Admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO patients (email, first_name, last_name, phone, gender, date_of_birth) VALUES
  ('eleanor.vance@example.com', 'Eleanor', 'Vance',     '+1 (555) 234-5678', 'Female', '1984-03-14'),
  ('marcus.brody@example.com',  'Marcus',  'Brody',     '+1 (555) 876-5432', 'Male',   '1958-07-22'),
  ('sophia.patel@example.com',  'Sophia',  'Patel',     '+1 (555) 432-1098', 'Female', '1997-01-09'),
  ('arthur.p@example.com',      'Arthur',  'Pendelton', '+1 (555) 654-9870', 'Male',   '1971-05-30')
ON CONFLICT (email) DO NOTHING;

INSERT INTO assignments (provider_id, patient_id)
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

-- ============ MODULES (placeholders until PTI sends the real list) ============
INSERT INTO modules (name, platform, description) VALUES
  ('Creative Calm',    'XR',     'Mandala coloring with instrumental music'),
  ('Explore Emotions', 'XR',     'Mixed-media virtual canvas for emotional expression'),
  ('Explore Self',     'XR',     'Guided mask-making to reflect on identity'),
  ('Explore Journey',  'XR',     'Guided visual timeline of experiences and growth'),
  ('Create',           'Mobile', ''),
  ('Learn',            'Mobile', ''),
  ('Reflect',          'Mobile', ''),
  ('Creative Calm',    'Mobile', '')
ON CONFLICT (name, platform) DO NOTHING;

-- ============ MEDICAL HISTORY ============
INSERT INTO patient_medical_history (patient_id, condition, status, onset_date, notes)
SELECT p.id, v.condition, v.status, v.onset_date::date, v.notes
FROM (VALUES
  ('eleanor.vance@example.com', 'Acute coronary syndrome',         'Active',   '2026-10-02', 'Admitted via ER with mild chest tightness.'),
  ('eleanor.vance@example.com', 'Hypertension (stage 1)',          'Chronic',  NULL,         ''),
  ('eleanor.vance@example.com', 'Asthma (mild)',                   'Chronic',  NULL,         'No previous surgical complications.'),
  ('eleanor.vance@example.com', 'Penicillin allergy',              'Chronic',  NULL,         ''),
  ('eleanor.vance@example.com', 'Sulfa drug allergy',              'Chronic',  NULL,         ''),
  ('marcus.brody@example.com',  'Total knee arthroplasty, right',  'Active',   '2026-09-28', 'Post-op.'),
  ('marcus.brody@example.com',  'Osteoarthritis of both knees',    'Chronic',  NULL,         ''),
  ('marcus.brody@example.com',  'Type 2 diabetes',                 'Chronic',  NULL,         'Controlled with Metformin.'),
  ('marcus.brody@example.com',  'Latex allergy',                   'Chronic',  NULL,         ''),
  ('sophia.patel@example.com',  'Migraine with aura / dehydration','Active',   '2026-10-05', ''),
  ('sophia.patel@example.com',  'Recurrent episodic migraines',    'Chronic',  NULL,         'Triggered by stress and sleep deprivation.'),
  ('arthur.p@example.com',      'Community-acquired pneumonia',    'Resolved', '2026-09-15', ''),
  ('arthur.p@example.com',      'COPD (mild)',                     'Chronic',  NULL,         'Former smoker, quit 2020.'),
  ('arthur.p@example.com',      'Ciprofloxacin allergy',           'Chronic',  NULL,         '')
) AS v(patient_email, condition, status, onset_date, notes)
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM patient_medical_history);

-- ============ CLINICAL SESSIONS + SESSION NOTES (from mock "logs") ============
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

INSERT INTO provider_notes (provider_id, patient_id, note_type, content, date_created)
SELECT u.id, p.id, 'TrendLog', v.content, now() - make_interval(days => v.days_ago)
FROM (VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'Steady engagement, roughly every other day, mostly in the evening.', 4),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'App use dropped off over the past two weeks after a stretch of near-daily sessions. Raise at next visit.', 2)
) AS v(provider_email, patient_email, content, days_ago)
JOIN users u ON u.email = v.provider_email
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM provider_notes n WHERE n.patient_id = p.id AND n.note_type = 'TrendLog');

-- ============ SESSIONS (generated, relative to today so the 30-day view is never empty) ============
-- Eleanor: Reflect XR every other day, evenings
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
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
  AND NOT EXISTS (SELECT 1 FROM sessions a WHERE a.patient_id = p.id);

-- Marcus: mobile, every third day
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
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
  AND NOT EXISTS (SELECT 1 FROM sessions a WHERE a.patient_id = p.id);

-- Sophia: XR, near-daily until two weeks ago, then almost nothing
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
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
  AND NOT EXISTS (SELECT 1 FROM sessions a WHERE a.patient_id = p.id);

-- Arthur: discharged, mobile, only a few early sessions
INSERT INTO sessions (patient_id, module_id, started_at, ended_at)
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
  AND NOT EXISTS (SELECT 1 FROM sessions a WHERE a.patient_id = p.id);

-- ============ RTM ENROLLMENT ============
INSERT INTO rtm_enrollments (patient_id, provider_id, status, consent_given, consent_date, enrolled_on)
SELECT p.id, u.id, v.status, v.consent, v.consent_date::date, v.enrolled_on::date
FROM (VALUES
  ('eleanor.vance@example.com', 'sarah.jenkins@example.com', 'Enrolled',    true,  '2026-10-03', '2026-10-03'),
  ('marcus.brody@example.com',  'robert.miller@example.com', 'Enrolled',    true,  '2026-09-29', '2026-09-29'),
  ('sophia.patel@example.com',  'amanda.chen@example.com',   'Enrolled',    true,  '2026-10-06', '2026-10-06'),
  ('arthur.p@example.com',      'david.ross@example.com',    'NotEnrolled', false, NULL,         NULL)
) AS v(patient_email, provider_email, status, consent, consent_date, enrolled_on)
JOIN patients p ON p.email = v.patient_email
JOIN users u ON u.email = v.provider_email
ON CONFLICT (patient_id) DO NOTHING;

-- ============ RTM ACTIVITIES: reviews, communications, management time ============
-- Reviews (generated, feeds the admin 30-day calendar)
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at)
SELECT pp.provider_id, pp.patient_id, 'Review', t.start_ts, t.start_ts + make_interval(mins => t.mins)
FROM assignments pp
JOIN users u ON u.id = pp.provider_id
CROSS JOIN LATERAL (
  SELECT g,
         date_trunc('day', now()) - make_interval(days => g)
           + make_interval(hours => 10, mins => length(u.email) % 30) AS start_ts,
         5 + ((g * 3 + length(u.email)) % 16) AS mins
  FROM generate_series(1, 30) AS g
  WHERE (g + length(u.email)) % 3 <> 0
) t
WHERE NOT EXISTS (SELECT 1 FROM rtm_activities WHERE activity_type = 'Review');

-- Communications (logged by the provider, happened on another platform)
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, direction, channel, started_at, ended_at, summary)
SELECT u.id, p.id, 'Communication', v.direction, v.channel,
       now() - make_interval(days => v.days_ago),
       now() - make_interval(days => v.days_ago) + make_interval(mins => v.mins),
       v.summary
FROM (VALUES
  ('sarah.jenkins@example.com', 'eleanor.vance@example.com', 'Outbound', 'Email', 3, 0,  'Sent a reminder about evening sessions in the app.'),
  ('robert.miller@example.com', 'marcus.brody@example.com',  'Inbound',  'Phone', 5, 12, 'Patient called with questions about at-home exercises.'),
  ('amanda.chen@example.com',   'sophia.patel@example.com',  'Outbound', 'Text',  2, 0,  'Checked in after the drop in app use; no reply yet.')
) AS v(provider_email, patient_email, direction, channel, days_ago, mins, summary)
JOIN users u ON u.email = v.provider_email
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM rtm_activities WHERE activity_type = 'Communication');

-- Management time (enrolled patients only)
INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at, summary)
SELECT e.provider_id, e.patient_id, 'ManagementTime',
       date_trunc('day', now()) - make_interval(days => d.days_ago) + make_interval(hours => 15),
       date_trunc('day', now()) - make_interval(days => d.days_ago) + make_interval(hours => 15, mins => d.mins),
       'Reviewed trends and updated care plan.'
FROM rtm_enrollments e
CROSS JOIN (VALUES (3, 14), (10, 18), (20, 12)) AS d(days_ago, mins)
WHERE e.status = 'Enrolled'
  AND NOT EXISTS (SELECT 1 FROM rtm_activities WHERE activity_type = 'ManagementTime');

-- ============ RESPONSE ENTRIES (mood, 1 low to 5 high) ============
INSERT INTO response_entries (patient_id, session_id, mood_score, recorded_at)
SELECT s.patient_id, s.id,
       CASE WHEN p.email = 'sophia.patel@example.com' AND s.started_at > now() - interval '14 days'
            THEN 2
            ELSE 1 + (extract(day FROM s.started_at)::int + length(p.email)) % 5 END,
       s.ended_at
FROM sessions s
JOIN patients p ON p.id = s.patient_id
WHERE extract(day FROM s.started_at)::int % 2 = 0
  AND NOT EXISTS (SELECT 1 FROM response_entries);

-- ============ RTM DOCUMENTATION (previous and current 30-day periods) ============
INSERT INTO rtm_documentation (patient_id, period_start, period_end, status, updated_by)
SELECT e.patient_id, d.period_start, d.period_start + 29, d.status, e.provider_id
FROM rtm_enrollments e
CROSS JOIN (VALUES
  (current_date - 59, 'Complete'),
  (current_date - 29, 'InProgress')
) AS d(period_start, status)
WHERE e.status = 'Enrolled'
  AND NOT EXISTS (SELECT 1 FROM rtm_documentation);

-- ============ AUDIT LOG (samples; the API writes the real ones) ============
INSERT INTO audit_log (user_id, action, entity_type, patient_id, detail, occurred_at)
SELECT u.id, v.action, v.entity_type, p.id, v.detail, now() - make_interval(hours => v.hours_ago)
FROM (VALUES
  ('sarah.jenkins@example.com', 'ViewPatient',   'patient',       'eleanor.vance@example.com', 'Opened patient detail', 5),
  ('amanda.chen@example.com',   'ViewPatient',   'patient',       'sophia.patel@example.com',  'Opened patient detail', 3),
  ('amanda.chen@example.com',   'CreateNote',    'provider_note', 'sophia.patel@example.com',  'Added trend log',       2),
  ('admin@example.com',         'AssignPatient', 'assignment',    'arthur.p@example.com',      'Assigned to Dr. David Ross', 30)
) AS v(user_email, action, entity_type, patient_email, detail, hours_ago)
JOIN users u ON u.email = v.user_email
JOIN patients p ON p.email = v.patient_email
WHERE NOT EXISTS (SELECT 1 FROM audit_log);

-- ============ LOGINS (demo password for everyone: demo-password) ============
INSERT INTO user_credentials (user_id, username, password_hash)
SELECT u.id, v.username, crypt('demo-password', gen_salt('bf'))
FROM (VALUES
  ('admin@example.com',         'admin'),
  ('sarah.jenkins@example.com', 'sjenkins'),
  ('robert.miller@example.com', 'rmiller'),
  ('amanda.chen@example.com',   'achen'),
  ('david.ross@example.com',    'dross')
) AS v(email, username)
JOIN users u ON u.email = v.email
ON CONFLICT DO NOTHING;