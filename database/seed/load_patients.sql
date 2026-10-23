CREATE TEMP TABLE stg_patients (
    first_name    text,
    last_name     text,
    gender        text,
    date_of_birth date,
    email         text,
    phone         text
);

\copy stg_patients FROM 'database/data/patients_clean.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO patients (email, first_name, last_name, phone, gender, date_of_birth)
SELECT email, first_name, last_name, phone, gender, date_of_birth
FROM stg_patients
ON CONFLICT (email) DO NOTHING;
