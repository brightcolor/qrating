-- The evaluation, the list of callbacks and the wallboard look up the answers of given votes,
-- the questions of a form and the forms of an event. Without these indexes every lookup read
-- the whole table, for every tenant at once, and the wallboard asks every few seconds.
CREATE INDEX IF NOT EXISTS idx_feedback_answers_response ON feedback_answers(feedback_response_id);
CREATE INDEX IF NOT EXISTS idx_feedback_questions_form ON feedback_questions(feedback_form_id);
CREATE INDEX IF NOT EXISTS idx_feedback_forms_event ON feedback_forms(event_id);
