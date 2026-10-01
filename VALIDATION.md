# Validation

Prepared from GitHub commit 6e38e475f40b6a4cdabf764afe277b8c1a8692c7.
No live database, bucket, invitations, repository or deployment was modified.

- TypeScript passed.
- 11 automated tests passed: actual SQL migration/RLS/functions in a local
  PostgreSQL engine (PGlite), plus IndexedDB tests with fake-indexeddb.
- Tested owner assignment, data preservation, repeat migration, anonymous denial,
  roles, private isolation, forbidden role escalation/moves, image access,
  revocation, conflicts, cross-box option protection, stale resurrection denial,
  account/queue separation, option details and Plan Your Visit defaults.
- GitHub Pages static export generated under /design-vault/ with a sandbox-only
  in-process Next worker adapter. The normal build was blocked by the sandbox's
  child-process restriction; a standard GitHub Actions build remains to be run.
- Browser inspection verified local library creation, the automatic Plan Your
  Visit 9:16 preset, and its video/prompt/notes/palette form.
- A configured build displayed the email/password invitation-only sign-in screen
  without browser console errors. Placeholder public values were used; no real
  login or live account was accessed.

The local PostgreSQL fixture mocks Supabase auth/storage schemas. It does not
replace testing your hosted Auth emails, Storage HTTP endpoints, actual policies,
real sessions, offline browser lifecycle or final deployment.
Run the acceptance steps in SETUP.md before inviting the full group.
