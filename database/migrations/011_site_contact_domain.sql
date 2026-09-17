-- The seeded contact address pointed at a domain outside the project.
UPDATE site_content
SET content = replace(content::text, 'kontakt@qrating.app', 'kontakt@qrating.de')::jsonb,
    updated_at = now()
WHERE content::text LIKE '%kontakt@qrating.app%';
