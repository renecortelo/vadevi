# Privacy baseline

Va de Vi is private by default. Phase 0 contains no analytics, production identifiers, personal fixtures, external AI calls, or public media routes. Local state is ignored by Git. Runtime configuration examples contain synthetic placeholders only.

Before any user data is implemented, each persistence and caching path must define its Space scope, retention, export, deletion, and logout behavior. Private media will use authenticated Worker routes; R2 object keys are never authorization credentials and never appear in normal client contracts.
