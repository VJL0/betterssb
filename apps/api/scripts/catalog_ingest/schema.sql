-- Separate from application tables; loading is explicit and transactional.
CREATE SCHEMA IF NOT EXISTS catalog_ingest;
CREATE TABLE IF NOT EXISTS catalog_ingest.documents (
    id text PRIMARY KEY CHECK (length(id) = 64),
    imported_at timestamptz NOT NULL DEFAULT now(),
    manifest jsonb NOT NULL,
    source_pdf bytea NOT NULL,
    audit_context jsonb
);
CREATE TABLE IF NOT EXISTS catalog_ingest.records (
    document_id text NOT NULL REFERENCES catalog_ingest.documents(id) ON DELETE CASCADE,
    key text NOT NULL,
    kind text NOT NULL,
    page integer CHECK (page > 0),
    text text NOT NULL,
    attributes jsonb NOT NULL,
    search tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    PRIMARY KEY (document_id, key)
);
CREATE TABLE IF NOT EXISTS catalog_ingest.edges (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id text NOT NULL REFERENCES catalog_ingest.documents(id) ON DELETE CASCADE,
    source text NOT NULL,
    target text NOT NULL,
    relation text NOT NULL,
    evidence jsonb NOT NULL,
    FOREIGN KEY (document_id, source) REFERENCES catalog_ingest.records(document_id, key)
        DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (document_id, target) REFERENCES catalog_ingest.records(document_id, key)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS catalog_records_kind_page ON catalog_ingest.records(document_id, kind, page);
CREATE INDEX IF NOT EXISTS catalog_records_search ON catalog_ingest.records USING gin(search);
CREATE INDEX IF NOT EXISTS catalog_records_attributes ON catalog_ingest.records USING gin(attributes);
CREATE INDEX IF NOT EXISTS catalog_edges_source ON catalog_ingest.edges(document_id, source, relation);
CREATE INDEX IF NOT EXISTS catalog_edges_target ON catalog_ingest.edges(document_id, target, relation);

CREATE OR REPLACE VIEW catalog_ingest.courses AS
SELECT r.document_id, r.key AS definition_key, r.attributes->>'code' AS code,
       r.attributes->>'title' AS title,
       (r.attributes->>'credit_minimum')::numeric AS credit_minimum,
       (r.attributes->>'credit_maximum')::numeric AS credit_maximum,
       r.page, r.text AS source_text, r.attributes->'pages' AS source_pages,
       r.attributes->>'credit_model' AS credit_model,
       r.attributes->'credit_options' AS credit_options
FROM catalog_ingest.records r WHERE r.kind = 'course_definition';

CREATE OR REPLACE VIEW catalog_ingest.course_rules AS
SELECT r.document_id, d.attributes->>'code' AS course_code,
       r.key AS rule_key, r.attributes->>'kind' AS rule_type,
       r.text AS source_text, r.page, false AS executable
FROM catalog_ingest.records r
JOIN catalog_ingest.edges e
  ON e.document_id = r.document_id AND e.target = r.key AND e.relation = 'has_rule'
JOIN catalog_ingest.records d
  ON d.document_id = e.document_id AND d.key = e.source
WHERE r.kind = 'course_rule';

CREATE OR REPLACE VIEW catalog_ingest.program_sections AS
SELECT document_id, key AS section_key, text AS title, page AS first_pdf_page,
       (attributes->>'end')::integer AS last_overlapping_pdf_page,
       attributes->>'range_precision' AS boundary_precision
FROM catalog_ingest.records
WHERE kind = 'section' AND attributes->>'program_candidate' = 'true';
