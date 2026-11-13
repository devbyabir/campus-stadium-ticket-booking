CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    venue VARCHAR(200) NOT NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE stadium_sections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code CHAR(1) NOT NULL UNIQUE CHECK (code IN ('A', 'B', 'C', 'D')),
    name VARCHAR(100) NOT NULL
);
INSERT INTO stadium_sections (code, name) VALUES
    ('A', 'Section A'), ('B', 'Section B'),
    ('C', 'Section C'), ('D', 'Section D');

CREATE TABLE seats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section_id BIGINT NOT NULL REFERENCES stadium_sections(id),
    row_number INTEGER NOT NULL CHECK (row_number > 0),
    seat_number INTEGER NOT NULL CHECK (seat_number > 0),
    status VARCHAR(10) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
    UNIQUE (event_id, section_id, row_number, seat_number),
    UNIQUE (id, event_id)
);
CREATE INDEX seats_event_status_idx ON seats (event_id, status);

CREATE TABLE bookings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_id BIGINT NOT NULL REFERENCES events(id),
    status VARCHAR(10) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, event_id)
);
CREATE INDEX bookings_user_idx ON bookings (user_id);

CREATE TABLE booking_seats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    seat_id BIGINT NOT NULL,
    qr_code_hash CHAR(64) NOT NULL UNIQUE CHECK (qr_code_hash ~ '^[0-9a-f]{64}$'),
    FOREIGN KEY (booking_id, event_id) REFERENCES bookings(id, event_id),
    FOREIGN KEY (seat_id, event_id) REFERENCES seats(id, event_id),
    UNIQUE (seat_id)
);
CREATE INDEX booking_seats_booking_idx ON booking_seats (booking_id);

