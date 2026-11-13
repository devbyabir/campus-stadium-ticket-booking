ALTER TABLE users ADD COLUMN university_id VARCHAR(50), ADD COLUMN phone VARCHAR(30);
CREATE UNIQUE INDEX users_university_id_unique ON users (university_id) WHERE university_id IS NOT NULL;
