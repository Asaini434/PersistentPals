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
    user_id        NOT NULL UNIQUE REFERENCES users(id),
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

CREATE TABLE IF NOT EXISTS provider_patients (
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

-- Medical history: many entries per patient
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

-- Therapy visits between a provider and a patient
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

-- Catalog of Reflect XR and Reflect Mobile experiences
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

-- Patient app usage
CREATE TABLE IF NOT EXISTS app_sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    module_id     uuid NOT NULL REFERENCES modules(id),
    started_at    timestamptz NOT NULL,
    ended_at      timestamptz NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    CHECK (ended_at >= started_at)
);

-- Time a provider spends reviewing a patient (reimbursement, admin calendar)
CREATE TABLE IF NOT EXISTS provider_review_sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   uuid NOT NULL REFERENCES users(id),
    patient_id    uuid NOT NULL REFERENCES patients(id),
    started_at    timestamptz NOT NULL,
    ended_at      timestamptz NOT NULL,
    date_created  timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false,
    date_deleted  timestamptz,
    CHECK (ended_at >= started_at)
);

-- Provider notes: session notes and trend/activity logs
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

-- Log of async provider/patient communication that happened elsewhere
CREATE TABLE IF NOT EXISTS patient_communications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id       uuid NOT NULL REFERENCES users(id),
    patient_id        uuid NOT NULL REFERENCES patients(id),
    direction         text NOT NULL CHECK (direction IN ('Inbound', 'Outbound')),
    channel           text NOT NULL CHECK (channel IN ('Email', 'Text', 'Phone', 'Portal', 'Other')),
    occurred_at       timestamptz NOT NULL,
    duration_minutes  integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
    summary           text NOT NULL DEFAULT '',
    date_created      timestamptz NOT NULL DEFAULT now(),
    is_deleted        boolean NOT NULL DEFAULT false,
    date_deleted      timestamptz
);

-- AI chat history: about one patient (provider chat) or one provider (admin chat)
CREATE TABLE IF NOT EXISTS chat_messages (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES users(id),
    about_patient_id     uuid REFERENCES patients(id),
    about_provider_id    uuid REFERENCES users(id),
    sender               text NOT NULL CHECK (sender IN ('User', 'Assistant')),
    content              text NOT NULL DEFAULT '',
    date_created         timestamptz NOT NULL DEFAULT now(),
    is_deleted           boolean NOT NULL DEFAULT false,
    date_deleted         timestamptz,
    CHECK ((about_patient_id IS NOT NULL)::int + (about_provider_id IS NOT NULL)::int = 1)
);

-- Indexes for the queries the dashboard will run most
CREATE INDEX IF NOT EXISTS idx_app_sessions_patient ON app_sessions (patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_review_sessions_provider ON provider_review_sessions (provider_id, started_at);
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_patient ON clinical_sessions (patient_id, started_at);
CREATE INDEX IF NOT EXISTS idx_notes_patient ON provider_notes (patient_id, date_created);           