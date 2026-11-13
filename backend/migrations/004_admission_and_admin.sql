CREATE TABLE student_invites (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    university_id VARCHAR(50) NOT NULL,
    code_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX student_invites_open_email ON student_invites (lower(email)) WHERE used_at IS NULL;
CREATE UNIQUE INDEX student_invites_open_university_id ON student_invites (university_id) WHERE used_at IS NULL;

ALTER TABLE booking_seats ADD COLUMN redeemed_at TIMESTAMPTZ;
ALTER TABLE booking_seats ADD COLUMN qr_version INTEGER NOT NULL DEFAULT 1 CHECK (qr_version > 0);

ALTER TABLE events ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (category IN ('sports', 'music', 'arts', 'academic', 'other'));
UPDATE events SET category = CASE
    WHEN lower(title) ~ 'sport|football|basketball' THEN 'sports'
    WHEN lower(title) ~ 'music|concert' THEN 'music'
    WHEN lower(title) ~ 'theatre|art' THEN 'arts'
    WHEN lower(title) ~ 'convocation|graduation' THEN 'academic'
    ELSE 'other' END;
