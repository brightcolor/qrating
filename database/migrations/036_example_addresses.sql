-- Earlier releases filled a new organization with example addresses, and the guest page led to
-- them: a manual event offered tickets at the example shop. Only the untouched example values go;
-- an address an organization entered itself stays.
UPDATE organizations SET ticketshop_url = NULL, updated_at = now() WHERE ticketshop_url = 'https://tickets.example.com';
UPDATE organizations SET website_url = NULL, updated_at = now() WHERE website_url = 'https://example.com';
UPDATE organizations SET instagram_url = NULL, updated_at = now() WHERE instagram_url = 'https://instagram.com/example';
