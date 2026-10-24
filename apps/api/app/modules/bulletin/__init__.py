"""Temple University's Bulletin (academic catalog) as a versioned database.

The read side (models, repository, router) is part of the API. The `ingest`
package is an offline tool that builds the database from Temple's published
pages and PDFs; the running app never imports it.
"""
