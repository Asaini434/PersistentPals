-- Safe to rerun. Existing databases: run migrations/002_align_with_api.sql FIRST.

CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    display_name  text NOT NULL DEFAULT '',
    title         text NOT NULL DEFAULT '',
    specialty     text NOT NULL DEFAULT '',
    role          text NOT NULL CHECK (role IN ('Admin', 'Provider')),
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz
);

CREATE TABLE IF NOT EXISTS user_credentials (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL UNIQUE REFERENCES users(id),
    username       text NOT NULL UNIQUE CHECK (username <> ''),
    password_hash  text NOT NULL,
    last_login_at  timestamptz,
    date_created   timestamptz NOT NULL DEFAULT now(),
    is_deleted     boolean NOT NULL DEFAULT false,
    date_deleted   timestamptz
);

CREATE TABLE IF NOT EXISTS patients (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    first_name    text NOT NULL DEFAULT '',
    last_name     text NOT NULL DEFAULT '',
    phone         text NOT NULL DEFAULT '',
    gender        text NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    date_of_birth date NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz
);

-- RENAMED from provider_patients (POST /admin/assignments)
CREATE TABLE IF NOT EXISTS assignments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   uuid NOT NULL,
    patient_id    uuid NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    FOREIGN KEY (provider_id) REFERENCES users(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    UNIQUE (provider_id, patient_id)
);

CREATE TABLE IF NOT EXISTS patient_medical_history (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    condition     text NOT NULL,
    status        text NOT NULL CHECK (status IN ('Active', 'Chronic', 'Resolved')),
    onset_date    date,
    notes         text NOT NULL DEFAULT '',
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz
);

CREATE TABLE IF NOT EXISTS clinical_sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   uuid NOT NULL REFERENCES users(id),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    mode          text NOT NULL CHECK (mode IN ('Remote', 'InPerson')),
    started_at    timestamptz NOT NULL,
    ended_at      timestamptz NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    CHECK (ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS modules (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    platform      text NOT NULL CHECK (platform IN ('XR', 'Mobile')),
    description   text NOT NULL DEFAULT '',
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    UNIQUE (name, platform)
);

-- RENAMED from app_sessions; event_id makes POST /ingest/events idempotent
CREATE TABLE IF NOT EXISTS sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    module_id     uuid NOT NULL REFERENCES modules(id),
    started_at    timestamptz NOT NULL,
    ended_at      timestamptz NOT NULL,
    event_id      uuid UNIQUE,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    CHECK (ended_at >= started_at)
);

-- NEW: therapeutic-response entries (mood), 1 = low, 5 = high
CREATE TABLE IF NOT EXISTS response_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    session_id    uuid REFERENCES sessions(id),
    mood_score    smallint NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
    note          text NOT NULL DEFAULT '',
    recorded_at   timestamptz NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz
);

-- RENAMED from provider_review_sessions; now also holds communications and management time
CREATE TABLE IF NOT EXISTS rtm_activities (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id    uuid NOT NULL REFERENCES users(id),
    patient_id     uuid NOT NULL REFERENCES patients(id),
    activity_type  text NOT NULL DEFAULT 'Review'
                   CHECK (activity_type IN ('Review', 'Communication', 'ManagementTime')),
    direction      text NOT NULL DEFAULT '' CHECK (direction IN ('', 'Inbound', 'Outbound')),
    channel        text NOT NULL DEFAULT ''
                   CHECK (channel IN ('', 'Email', 'Text', 'Phone', 'Portal', 'Other')),
    started_at     timestamptz NOT NULL,
    ended_at       timestamptz NOT NULL,
    summary        text NOT NULL DEFAULT '',
    date_created   timestamptz NOT NULL DEFAULT now(),
    is_deleted     boolean NOT NULL DEFAULT false,
    date_deleted   timestamptz,
    CHECK (ended_at >= started_at),
    CONSTRAINT rtm_activities_communication_check
        CHECK (activity_type <> 'Communication' OR (direction <> '' AND channel <> ''))
);

-- NEW: enrollment and consent record (GET/PUT /rtm/enrollment)
CREATE TABLE IF NOT EXISTS rtm_enrollments (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id     uuid NOT NULL UNIQUE REFERENCES patients(id),
    provider_id    uuid NOT NULL REFERENCES users(id),
    status         text NOT NULL DEFAULT 'NotEnrolled'
                   CHECK (status IN ('NotEnrolled', 'Enrolled', 'Withdrawn')),
    consent_given  boolean NOT NULL DEFAULT false,
    consent_date   date,
    enrolled_on    date,
    notes          text NOT NULL DEFAULT '',
    date_updated   timestamptz NOT NULL DEFAULT now(),
    date_created   timestamptz NOT NULL DEFAULT now(),
    is_deleted     boolean NOT NULL DEFAULT false,
    date_deleted   timestamptz,
    CHECK (status <> 'Enrolled' OR consent_given)
);

-- NEW: documentation status per 30-day period (PATCH /rtm/documentation)
CREATE TABLE IF NOT EXISTS rtm_documentation (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    period_start  date NOT NULL,
    period_end    date NOT NULL,
    status        text NOT NULL DEFAULT 'NotStarted'
                  CHECK (status IN ('NotStarted', 'InProgress', 'Complete')),
    updated_by    uuid NOT NULL REFERENCES users(id),
    date_updated  timestamptz NOT NULL DEFAULT now(),
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    UNIQUE (patient_id, period_start),
    CHECK (period_end = period_start + 29)
);

CREATE TABLE IF NOT EXISTS provider_notes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id          uuid NOT NULL REFERENCES users(id),
    patient_id           uuid NOT NULL REFERENCES patients(id),
    clinical_session_id  uuid REFERENCES clinical_sessions(id),
    note_type            text NOT NULL CHECK (note_type IN ('SessionNote', 'TrendLog')),
    content              text NOT NULL DEFAULT '',
    date_created         timestamptz NOT NULL DEFAULT now(),
    is_deleted           boolean NOT NULL DEFAULT false,
    date_deleted         timestamptz,
    CHECK (note_type <> 'SessionNote' OR clinical_session_id IS NOT NULL)
);

-- data_used holds what the chat answer was based on (POST /chat)
CREATE TABLE IF NOT EXISTS chat_messages (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES users(id),
    about_patient_id     uuid REFERENCES patients(id),
    about_provider_id    uuid REFERENCES users(id),
    sender               text NOT NULL CHECK (sender IN ('User', 'Assistant')),
    content              text NOT NULL DEFAULT '',
    data_used            jsonb NOT NULL DEFAULT '{}'::jsonb,
    date_created         timestamptz NOT NULL DEFAULT now(),
    is_deleted           boolean NOT NULL DEFAULT false,
    date_deleted         timestamptz,
    CHECK ((about_patient_id IS NOT NULL)::int + (about_provider_id IS NOT NULL)::int = 1)
);

-- NEW: append-only audit trail (GET /audit). No soft delete: rows are never removed.
CREATE TABLE IF NOT EXISTS audit_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id),
    action       text NOT NULL,
    entity_type  text NOT NULL DEFAULT '',
    patient_id   uuid REFERENCES patients(id),
    detail       text NOT NULL DEFAULT '',
    occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions (patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_rtm_activities_provider ON rtm_activities (provider_id, started_at);
CREATE INDEX IF NOT EXISTS idx_rtm_activities_patient ON rtm_activities (patient_id, activity_type, started_at);
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_patient ON clinical_sessions (patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_notes_patient ON provider_notes (patient_id, date_created);
CREATE INDEX IF NOT EXISTS idx_response_entries_patient ON response_entries (patient_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log (occurred_at);
-- ===== Mental-health additions (safe to rerun) =====
ALTER TABLE patient_medical_history
    ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT ''
        CHECK (severity IN ('', 'Mild', 'Moderate', 'Severe')),
    ADD COLUMN IF NOT EXISTS treatment_start_date date;

CREATE TABLE IF NOT EXISTS patient_medications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    name          text NOT NULL,
    dosage        text NOT NULL DEFAULT '',
    frequency     text NOT NULL DEFAULT '',
    started_on    date,
    status        text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Stopped')),
    notes         text NOT NULL DEFAULT '',
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_medications_patient ON patient_medications (patient_id);

-- ===== Official module catalog (PTI product catalog, effective 2026-09-09) =====
-- program = the group a module belongs to (e.g. Creative Calm, Learn); uses_ai = marked (AI) in the catalog
ALTER TABLE modules
    ADD COLUMN IF NOT EXISTS program text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS uses_ai boolean NOT NULL DEFAULT false;