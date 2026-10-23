CREATE TEMP TABLE numbered AS
SELECT id, row_number() OVER (ORDER BY email)::int AS n
FROM patients
WHERE is_deleted = false
  AND email NOT IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                    'sophia.patel@example.com',  'arthur.p@example.com');

CREATE TEMP TABLE concerns (idx int, condition text, provider_email text);
INSERT INTO concerns VALUES
  (0, 'Generalized anxiety disorder',    'sarah.jenkins@example.com'),
  (1, 'Panic disorder',                  'sarah.jenkins@example.com'),
  (2, 'Major depressive disorder',       'robert.miller@example.com'),
  (3, 'Persistent depressive disorder',  'robert.miller@example.com'),
  (4, 'Post-traumatic stress disorder',  'amanda.chen@example.com'),
  (5, 'Acute stress disorder',           'amanda.chen@example.com'),
  (6, 'Adjustment disorder',             'david.ross@example.com'),
  (7, 'Grief and loss',                  'david.ross@example.com');

INSERT INTO assignments (provider_id, patient_id)
SELECT u.id, nu.id
FROM numbered nu
JOIN concerns c ON c.idx = nu.n % 8
JOIN users u ON u.email = c.provider_email
ON CONFLICT (provider_id, patient_id) DO NOTHING;

INSERT INTO patient_medical_history (patient_id, condition, status, onset_date, notes)
SELECT nu.id, c.condition,
       CASE WHEN nu.n % 4 = 0 THEN 'Chronic' ELSE 'Active' END,
       current_date - ((nu.n * 17) % 700),
       ''
FROM numbered nu
JOIN concerns c ON c.idx = nu.n % 8
WHERE NOT EXISTS (SELECT 1 FROM patient_medical_history h WHERE h.patient_id = nu.id);
