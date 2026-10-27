-- Also handles environments that already applied the first preview migration.
UPDATE users SET personal_email='demo@teachersvip.net',first_name='Demo',updated_at=now()
WHERE is_demo AND personal_email='investor@teachersvip.example'
AND NOT EXISTS (SELECT 1 FROM users WHERE personal_email='demo@teachersvip.net');
