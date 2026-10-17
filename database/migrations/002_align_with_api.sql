BEGIN;

ALTER TABLE provider_patients        RENAME TO assignments;
ALTER TABLE app_sessions             RENAME TO sessions;
ALTER TABLE provider_review_sessions RENAME TO rtm_activities;
ALTER INDEX idx_app_sessions_patient     RENAME TO idx_sessions_patient;
ALTER INDEX idx_review_sessions_provider RENAME TO idx_rtm_activities_provider;

ALTER TABLE sessions ADD COLUMN event_id uuid UNIQUE;

ALTER TABLE rtm_activities
  ADD COLUMN activity_type text NOT NULL DEFAULT 'Review'
      CHECK (activity_type IN ('Review', 'Communication', 'ManagementTime')),
  ADD COLUMN direction text NOT NULL DEFAULT ''
      CHECK (direction IN ('', 'Inbound', 'Outbound')),
  ADD COLUMN channel text NOT NULL DEFAULT ''
      CHECK (channel IN ('', 'Email', 'Text', 'Phone', 'Portal', 'Other')),
  ADD COLUMN summary text NOT NULL DEFAULT '';

ALTER TABLE rtm_activities
  ADD CONSTRAINT rtm_activities_communication_check
  CHECK (activity_type <> 'Communication' OR (direction <> '' AND channel <> ''));

INSERT INTO rtm_activities
  (provider_id, patient_id, activity_type, direction, channel,
   started_at, ended_at, summary, date_created, is_deleted, date_deleted)
SELECT provider_id, patient_id, 'Communication', direction, channel,
       occurred_at, occurred_at + make_interval(mins => duration_minutes),
       summary, date_created, is_deleted, date_deleted
FROM patient_communications;

ALTER TABLE chat_messages ADD COLUMN data_used jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
