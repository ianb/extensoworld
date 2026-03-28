-- Add authoring provenance columns to AI-generated content tables.
-- These track who created the content, how (explicit command vs implicit action),
-- and the original command text for explicit creates.

ALTER TABLE ai_entities ADD COLUMN created_by TEXT;
ALTER TABLE ai_entities ADD COLUMN creation_source TEXT;
ALTER TABLE ai_entities ADD COLUMN creation_command TEXT;

ALTER TABLE ai_handlers ADD COLUMN created_by TEXT;
ALTER TABLE ai_handlers ADD COLUMN creation_source TEXT;
ALTER TABLE ai_handlers ADD COLUMN creation_command TEXT;

ALTER TABLE conversation_entries ADD COLUMN created_by TEXT;
ALTER TABLE conversation_entries ADD COLUMN creation_source TEXT;
ALTER TABLE conversation_entries ADD COLUMN creation_command TEXT;
