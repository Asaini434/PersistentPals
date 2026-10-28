-- One-time: clears the generated app-usage data for the demo patients so seed_engagement.sql
-- can rebuild it with the official module list. Only touches synthetic demo data.
-- Run order:  psql -d reflect -f database/maintenance/reseed_engagement.sql
--             ./database/run_all.sh reflect
BEGIN;

DELETE FROM response_entries
WHERE patient_id IN (SELECT id FROM patients
                     WHERE email NOT IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                                         'sophia.patel@example.com',  'arthur.p@example.com'));

DELETE FROM sessions
WHERE patient_id IN (SELECT id FROM patients
                     WHERE email NOT IN ('eleanor.vance@example.com', 'marcus.brody@example.com',
                                         'sophia.patel@example.com',  'arthur.p@example.com'));

COMMIT;