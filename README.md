# Design Vault — private accounts and team access

**Start with [SETUP.md](SETUP.md) before running SQL or deploying.**

Based on acmanigos/design-vault commit `6e38e475f40b6a4cdabf764afe277b8c1a8692c7`.
Retains Idea Boxes, options, prompts, notes, editable palettes, favorites, folder
and bulk drop, clipboard paste, option sorting, per-option video, presets,
Plan Your Visit 9:16, local-first IndexedDB, offline PWA and GitHub Pages.

Adds invitation-based email/password accounts, persistent sessions, sign-out,
password recovery, private/shared libraries, owner/editor/viewer permissions,
authenticated RLS, private user-scoped image storage, separate offline account
caches, conflict detection, backups and explicit legacy-device import.

| Action | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| View and copy shared content | Yes | Yes | Yes |
| Create/edit/delete ideas and options; favorites | Yes | Yes | No |
| Move an idea between libraries | Must own both | No | No |
| Manage members, visibility, presets; delete library | Yes | No | No |

Every account can create private libraries. Private libraries ignore membership
until deliberately changed to Shared. Favorites retain the original shared
record behavior: editor changes are visible to teammates.

## Development

Node.js 22 or newer:

```sh
npm ci
cp .env.example .env.local
npm run dev
npm run typecheck
npm test
npm run build
```

Windows: use `Copy-Item .env.example .env.local`. Set only public Supabase
configuration. Without it the app uses a separate local-only vault.
The static output is `out/`; `next start` does not serve static exports.
The included GitHub workflow builds for `/design-vault/`.

See [VALIDATION.md](VALIDATION.md) for test evidence and hosted checks.
No live database or GitHub deployment was modified while preparing this package.
