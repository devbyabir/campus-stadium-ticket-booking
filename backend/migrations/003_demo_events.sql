-- Presentation data only. Replace these demo events with verified campus events before real ticket sales.
WITH demo_events AS (
  INSERT INTO events (title, description, starts_at, ends_at, venue)
  VALUES
    ('Campus Sports Festival · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '30 days 16 hours', date_trunc('day', now()) + interval '30 days 20 hours', 'Main Stadium'),
    ('Fall Music & Arts Fest · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '45 days 18 hours', date_trunc('day', now()) + interval '45 days 22 hours', 'Campus Arena'),
    ('Founders Day Convocation · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '60 days 10 hours', date_trunc('day', now()) + interval '60 days 13 hours', 'Main Stadium'),
    ('Winter Theatre Production · Demo', 'Demo event for the Campus Stadium Ticket Booking project.', date_trunc('day', now()) + interval '75 days 19 hours', date_trunc('day', now()) + interval '75 days 22 hours', 'Campus Arena')
  RETURNING id
)
INSERT INTO seats (event_id, section_id, row_number, seat_number)
SELECT event.id, section.id, row_numbers.value, seat_numbers.value
FROM demo_events AS event
CROSS JOIN stadium_sections AS section
CROSS JOIN generate_series(1, 4) AS row_numbers(value)
CROSS JOIN generate_series(1, 8) AS seat_numbers(value);
