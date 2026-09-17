-- Earlier releases stored the legal placeholder texts with transliterated umlauts.
-- Placeholders that nobody edited are removed, so the website shows the placeholder texts
-- shipped with the backend. Edited legal texts stay as they are.
UPDATE site_content
SET content = content - 'imprint',
    updated_at = now()
WHERE content->>'imprint' = E'Angaben gemaess Impressumspflicht\n\nqrating Betreiber\nMusterstrasse 1\n12345 Musterstadt\n\nE-Mail: kontakt@qrating.de\n\nBitte passe dieses Impressum vor dem produktiven Betrieb im Adminbereich an.';

UPDATE site_content
SET content = content - 'privacy',
    updated_at = now()
WHERE content->>'privacy' = E'Datenschutzerklaerung\n\nqrating kann anonymes Veranstaltungsfeedback erfassen. Personenbezogene Daten wie E-Mail-Adressen fuer Newsletter oder freiwillige Rueckrufnummern werden nur fuer den jeweils gewaehlten Zweck verarbeitet.\n\nBitte passe diese Datenschutzerklaerung vor dem produktiven Betrieb im Adminbereich an.';
