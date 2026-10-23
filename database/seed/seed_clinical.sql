CREATE TEMP TABLE numbered AS
SELECT id, row_number() OVER (ORDER BY email)::int AS n
FROM patients
WHERE is_deleted = false;

CREATE TEMP TABLE concern_idx AS
SELECT nu.id AS patient_id, nu.n, nu.n % 8 AS idx FROM numbered nu;

-- ============ SEVERITY + HOW LONG IN TREATMENT ============
UPDATE patient_medical_history h
SET severity = (ARRAY['Mild','Moderate','Moderate','Severe'])[1 + c.n % 4],
    treatment_start_date = LEAST(current_date, h.onset_date + (7 + (c.n * 5) % 40))
FROM concern_idx c
WHERE h.patient_id = c.patient_id AND h.severity = '';

-- ============ MEDICATIONS ============
-- tier 1 = prescribed when severity is Moderate or Severe; tier 2 = only when Severe.
CREATE TEMP TABLE med_plan (idx int, tier int, name text, dosage text, frequency text);
INSERT INTO med_plan VALUES
  (0, 1, 'Escitalopram',  '10 mg',  'Once daily'),
  (0, 2, 'Buspirone',     '10 mg',  'Twice daily'),
  (1, 1, 'Sertraline',    '50 mg',  'Once daily'),
  (1, 2, 'Hydroxyzine',   '25 mg',  'As needed'),
  (2, 1, 'Sertraline',    '100 mg', 'Once daily'),
  (2, 2, 'Bupropion XL',  '150 mg', 'Once daily'),
  (3, 1, 'Fluoxetine',    '20 mg',  'Once daily'),
  (3, 2, 'Bupropion XL',  '150 mg', 'Once daily'),
  (4, 1, 'Sertraline',    '100 mg', 'Once daily'),
  (4, 2, 'Prazosin',      '2 mg',   'At bedtime'),
  (5, 1, 'Hydroxyzine',   '25 mg',  'As needed'),
  (6, 2, 'Sertraline',    '50 mg',  'Once daily'),
  (7, 2, 'Trazodone',     '50 mg',  'At bedtime');

INSERT INTO patient_medications (patient_id, name, dosage, frequency, started_on, status, notes)
SELECT c.patient_id, m.name, m.dosage, m.frequency,
       LEAST(current_date, h.treatment_start_date + 14),
       CASE WHEN c.n % 9 = 0 AND m.tier = 2 THEN 'Stopped' ELSE 'Active' END,
       CASE WHEN c.n % 9 = 0 AND m.tier = 2 THEN 'Discontinued after review with prescriber.' ELSE '' END
FROM concern_idx c
JOIN patient_medical_history h ON h.patient_id = c.patient_id
JOIN med_plan m ON m.idx = c.idx
WHERE ((m.tier = 1 AND h.severity IN ('Moderate', 'Severe'))
    OR (m.tier = 2 AND h.severity = 'Severe'))
  AND NOT EXISTS (SELECT 1 FROM patient_medications x WHERE x.patient_id = c.patient_id);

-- ============ THERAPY SESSIONS + SESSION NOTES ============
CREATE TEMP TABLE note_bank (idx int, k int, note text);
INSERT INTO note_bank VALUES
 (0,1,'Intake session. Reports persistent worry about work and finances, difficulty relaxing, and poor sleep. Agreed on CBT-based treatment goals.'),
 (0,2,'Reviewed worry log. Practiced diaphragmatic breathing and cognitive restructuring. Patient uses Reflect Mobile reflection prompts between sessions.'),
 (0,3,'Worry frequency reduced from daily to a few times a week. Reviewed progress on goals and planned graded exposure to avoided tasks.'),
 (1,1,'Intake. Describes recurring panic episodes with racing heart and fear of losing control, mostly in crowded places. Psychoeducation on the panic cycle provided.'),
 (1,2,'Introduced interoceptive exposure and slow-breathing practice. Episodes tracked in app journal: two this month, down from five.'),
 (1,3,'Practiced exposure in a mildly crowded setting without leaving. Confidence rising; plan to continue weekly practice.'),
 (2,1,'Intake. Reports low mood, loss of interest and low energy for several months. Behavioral activation plan agreed; medication follow-up with prescriber.'),
 (2,2,'Completed two scheduled pleasant activities this week. Mood still low in the mornings. Using Creative Calm in Reflect XR in the evenings.'),
 (2,3,'Energy and motivation improving. Mood ratings trending up over the past two weeks. Continuing behavioral activation and reviewing sleep routine.'),
 (3,1,'Intake. Long-standing low mood described as just how I am. Explored patterns of negative self-talk. Set goals around routine and self-compassion.'),
 (3,2,'Worked on identifying core beliefs about self-worth. Patient engaged with Explore Self in Reflect XR and shared reflections.'),
 (3,3,'Small but consistent gains in mood and daily structure. Discussed relapse-prevention strategies.'),
 (4,1,'Intake. Reports intrusive memories, hypervigilance and avoidance related to a past event. Focus on grounding and stabilization skills before any trauma processing.'),
 (4,2,'Practiced grounding techniques; nightmares less frequent. Patient reports Creative Calm helps with winding down before bed.'),
 (4,3,'Began structured work on the trauma narrative at a tolerable pace. Distress ratings manageable; will continue gradual processing.'),
 (5,1,'Intake following a recent distressing event. Reports re-experiencing, irritability and trouble sleeping. Psychoeducation on normal stress responses.'),
 (5,2,'Symptoms easing. Reviewed coping strategies and sleep hygiene. Patient using Reflect Mobile daily check-ins.'),
 (5,3,'Symptoms largely resolved. Reviewed relapse prevention and agreed to space sessions out.'),
 (6,1,'Intake. Struggling with a recent major life change; reports irritability, low mood and worry. Explored stressors and supports.'),
 (6,2,'Worked on problem-solving and boundary setting. Patient used Explore Journey in Reflect XR to map the transition.'),
 (6,3,'Coping improving and mood steadier. Patient has re-engaged with social activities. Plan to taper session frequency.'),
 (7,1,'Intake. Patient is grieving a significant loss; reports waves of sadness, difficulty concentrating and withdrawal. Space given to share memories.'),
 (7,2,'Discussed continuing bonds and rituals. Patient used Explore Emotions in Reflect XR to express feelings through art.'),
 (7,3,'Grief intensity easing; patient able to recall good memories alongside sadness. Reviewed supports and upcoming difficult dates.');

CREATE TEMP TABLE session_plan AS
SELECT c.patient_id, a.provider_id, c.idx, k.k,
       (ARRAY['Remote','InPerson','Remote'])[1 + (c.n + k.k) % 3] AS mode,
       date_trunc('day', now())
         - make_interval(days => CASE k.k WHEN 1 THEN 28 + c.n % 3 WHEN 2 THEN 14 + c.n % 3 ELSE 3 + c.n % 4 END)
         + make_interval(hours => 9 + c.n % 7) AS start_ts
FROM concern_idx c
CROSS JOIN (VALUES (1), (2), (3)) AS k(k)
JOIN assignments a ON a.patient_id = c.patient_id AND a.is_deleted = false;

INSERT INTO clinical_sessions (provider_id, patient_id, mode, started_at, ended_at)
SELECT sp.provider_id, sp.patient_id, sp.mode, sp.start_ts, sp.start_ts + make_interval(mins => 50)
FROM session_plan sp
WHERE NOT EXISTS (SELECT 1 FROM clinical_sessions x WHERE x.patient_id = sp.patient_id);

INSERT INTO provider_notes (provider_id, patient_id, clinical_session_id, note_type, content, date_created)
SELECT cs.provider_id, cs.patient_id, cs.id, 'SessionNote', nb.note, cs.started_at
FROM session_plan sp
JOIN clinical_sessions cs ON cs.patient_id = sp.patient_id AND cs.started_at = sp.start_ts
JOIN note_bank nb ON nb.idx = sp.idx AND nb.k = sp.k
WHERE NOT EXISTS (SELECT 1 FROM provider_notes n WHERE n.clinical_session_id = cs.id);

-- ============ TREND LOGS (provider's read on app engagement) ============
INSERT INTO provider_notes (provider_id, patient_id, note_type, content, date_created)
SELECT a.provider_id, c.patient_id, 'TrendLog',
       CASE c.n % 5
         WHEN 0 THEN 'Steady engagement, roughly every other day across XR and mobile. Mood scores trending up.'
         ELSE 'App use dropped off over the past two weeks after a stretch of near-daily sessions. Raise at next visit.' END,
       now() - make_interval(days => 2 + c.n % 4)
FROM concern_idx c
JOIN assignments a ON a.patient_id = c.patient_id AND a.is_deleted = false
WHERE c.n % 5 IN (0, 1)
  AND NOT EXISTS (SELECT 1 FROM provider_notes n WHERE n.patient_id = c.patient_id AND n.note_type = 'TrendLog');
