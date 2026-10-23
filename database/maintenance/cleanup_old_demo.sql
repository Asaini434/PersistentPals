BEGIN;

CREATE TEMP TABLE old_patients AS
SELECT id FROM patients
WHERE email IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                'sophia.patel@example.com',  'arthur.p@example.com');

DELETE FROM chat_messages           WHERE about_patient_id IN (SELECT id FROM old_patients);
DELETE FROM audit_log               WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM rtm_documentation       WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM rtm_enrollments         WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM rtm_activities          WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM response_entries        WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM sessions                WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM provider_notes          WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM clinical_sessions       WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM patient_medical_history WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM assignments             WHERE patient_id       IN (SELECT id FROM old_patients);
DELETE FROM patients                WHERE id               IN (SELECT id FROM old_patients);

COMMIT;
