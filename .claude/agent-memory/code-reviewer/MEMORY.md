# Memory Index

- [User profile](user_profile.md) — developer building a learning-focused fragmented writing app
- [Recurring type anti-patterns](project_type_antipatterns.md) — known type issues observed in the shared package
- [Test assertion anti-pattern](feedback_test_patterns.md) — unawaited `.rejects` in Bun tests are silently hollow
- [Drizzle ORM anti-patterns](project_drizzle_patterns.md) — `&&` vs `and()`, `notInArray([])` no-op, missing transactions
- [Branded UUID casting anti-pattern](project_branded_type_casting.md) — `as never` used instead of `as BrandedType`, silences all type checking
- [Orval envelope pattern mismatch](project_orval_envelope_pattern.md) — custom mutator return shape must match generated envelope types or runtime/types diverge silently
