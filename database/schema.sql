CREATE TABLE users (
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