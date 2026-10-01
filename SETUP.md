# Set up your private Design Vault

The ZIP contains the updated source. Your live site remains unchanged until
you apply the migration and deploy it.

## 1. Back up first

- Keep a copy of your current project.
- On each original device, open the old app online and use **Sync now**.
- Back up Supabase tables **libraries**, **idea_boxes**, **idea_options**, and
  separately back up all files in the **design-vault** Storage bucket.
  A database backup does not include image bytes.
- Keep the old browser profile and IndexedDB. Do not clear site data or uninstall
  the old PWA until you have verified the new version.
- Record these counts before the cutover:

```sql
select 'libraries' as kind, count(*) from public.libraries
union all select 'idea_boxes', count(*) from public.idea_boxes
union all select 'idea_options', count(*) from public.idea_options;
```

The migration assigns ownership in a transaction. It does not delete existing
libraries, boxes, options or image objects. The original browser database,
`design-vault-db`, is left intact.

## 2. Configure Supabase Auth and create your owner account

In your existing Supabase project:

1. Enable email/password authentication and **disable public sign-ups**.
2. Set Auth **Site URL** and an allowed redirect URL to
   `https://acmanigos.github.io/design-vault/`.
   Preserve the repository path and trailing slash.
3. For local development, also allow `http://localhost:3000/`.
4. In **Authentication → Users**, create your own account with your email and
   a strong, unique password. Copy its **User UID** and verify the email beside
   it. This identifies the existing vault's owner.
5. Configure custom SMTP before inviting friends. SMTP credentials belong only
   in Supabase settings. The default email service restricts recipients and is
   unsuitable for your group. Follow
   [Supabase's SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

The app follows [Supabase email/password authentication](https://supabase.com/docs/guides/auth/passwords).
Invitation and recovery links return to the Pages root; no server callback
route is required.

## 3. Prepare GitHub Pages

1. Extract the ZIP. Copy the contents of `design-vault-team` into the root of
   your existing repository, rather than nesting that folder inside it.
2. Preserve your private local environment file separately. The ZIP has no real
   credentials.
3. Set GitHub Actions secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — publishable or legacy anon key only.
4. Never use a service-role key, secret API key, database password, SMTP password
   or admin token in public variables or browser code.
5. Set Pages deployment source to **GitHub Actions**. The included workflow
   builds `out/` under `/design-vault/`.
6. If the repository name changes, update `repo` in `next.config.ts` and the
   corresponding Auth URLs and manifest paths.

Public browser configuration is expected; permissions are enforced by
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and permission-checked database functions.

## 4. Migrate, then deploy

Pause editing on the old app during this short cutover.

**Existing vault:** run only **supabase/auth-team-migration.sql**. It expects
the current repository's libraries/Idea Boxes/options schema.

**New Supabase project:** run **supabase/schema.sql** first, then the auth/team
migration. The other old migration files are retired; do not restore anonymous
policies.

1. In the auth/team migration, replace
   `REPLACE_WITH_OWNER_AUTH_USER_UUID` with your exact owner Auth UID.
2. Run the **whole file** in Supabase SQL Editor as the project administrator.
   There is no first-login claim endpoint. Invalid owner IDs abort the transaction.
3. Compare the pre-migration counts. Box and option counts should be unchanged.
   Recovered orphan library IDs can add library rows if old data was inconsistent.
4. Check ownership and bucket privacy:

```sql
select id, name, owner_id, visibility from public.libraries order by name;
select count(*) as unowned_boxes from public.idea_boxes where owner_id is null;
select id, public from storage.buckets where id = 'design-vault';
```

Legacy libraries should belong to you and be private; unowned_boxes should be
zero; the bucket's public value should be false.

5. Deploy the prepared app immediately afterward. The old anonymous app cannot
   sync after migration; this is expected during the cutover.
6. Close old tabs/PWA windows, reopen the new site and reload if necessary to
   activate the new service worker.
7. Sign in as yourself. Sync and inspect your existing libraries, images, prompts,
   videos, palettes, option order and presets before inviting others.

Running the migration again with the same owner is safe. A different owner is
rejected. New image paths are `user-uid/library-id/random-file.webp`; existing
images remain at their old paths. Read access follows their referring Idea Box.
See [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 5. Recover old device-only work

After your first successful cloud sync, on your original browser/device:

1. Choose **Import this device’s old vault** while signed in as the configured owner.
2. Reload, review the result and sync.
3. Choose **Download backup** and store the JSON privately.

Import reads the old IndexedDB without clearing, renaming or upgrading it.
It never overwrites an existing box; divergent old drafts become
“(legacy device copy)” records with fresh option IDs. Repeating import does not
keep adding the same copy. Existing library settings in the new cache take
priority; the old database remains available for recovery.

The old deletion queue is intentionally not replayed, to avoid deleting current
cloud work. Import must run on the same browser profile and origin as the old
vault. Another browser/domain cannot read that origin's IndexedDB.

## 6. Invite your approximately 15 friends

Use individual accounts; do not share your owner password.

For each friend:

1. In **Supabase → Authentication → Users → Invite user**, enter their email.
   Use the vault root URL as the redirect if asked.
2. They open the invitation and set their own password. If the link opens the
   vault immediately, they can choose **Change password**.
3. In your app, open the desired library and choose **Manage access**.
4. Set **Shared with members**, then **Sync now** and wait for that library's
   change to finish syncing.
5. Enter the invited account's exact email, select **Viewer** or **Editor**, and
   choose **Add / update member**.
6. They sign in and sync. They see this library plus their own private libraries,
   not your other private libraries.

Repeat for the group. There is no hard-coded 15-user limit; project quotas and
image usage determine capacity. They do not need Supabase organization or GitHub
repository access.

Use the same form to change a role. **Remove access** removes membership.
Changing a library to **Private** hides it from all members; their membership
records remain so you can deliberately share it again later.

## 7. Check before sharing widely

Use separate browser profiles for owner, editor and viewer accounts.

- Owner: counts, images and all existing option features are intact.
- Signed out: Sign in is shown; anonymous API and image requests are denied.
- Viewer: can view and copy; editing controls and direct API writes are blocked.
- Editor: can change ideas/options, but not members or library settings; cannot
  move a shared idea into their own library.
- Private libraries: invisible to other accounts.
- Offline: load online once, disconnect, refresh, edit an owned/editor library,
  reconnect and verify sync from another device.
- Conflict: two offline devices edit the same idea; after one syncs, the second
  draft remains pending with a conflict message.
- Account switch: the previous user's data and queue do not appear.
- Revocation: remove a member, then sync their device; shared content disappears
  and subsequent server requests are denied.
- Invitation/reset emails: return to the correct GitHub Pages path.

## Offline use, conflicts and recovery

The PWA caches its shell. Local uploads and successfully downloaded images live
in each account's IndexedDB. External YouTube/direct video links still need
their hosts; video files are not downloaded for offline playback.

Previously opened accounts can use their local cache offline even if a network
token expires. Reconnection reloads and verifies the session before cloud sync.
Local offline identity never authorizes server operations.

Revocation cannot retract already downloaded/copied material. Offline members
retain cached content until reconnecting; revoked libraries and their queued
edits are then purged. Sign-out hides the vault and preserves drafts for that
same account; it does not encrypt browser disk storage. Use separate browser
profiles on shared computers. Previously public downloads/caches cannot be recalled.

For a conflict: open **Review pending changes**, download a backup, then choose
**Reload cloud version** for that draft. Reapply desired changes in the normal
interface. Backup JSON contains vault records and cached images, not passwords
or session tokens; protect it. There is no general JSON restore UI in this release.

Each box and all its options save atomically. Failed saves can leave unreferenced
image uploads; old images are intentionally retained. Do not remove images until
you have checked their references and backups.

If SQL fails, its transaction rolls back. Fix the UID/schema issue and rerun
the whole file. If sign-in fails, check Auth URLs, public build variables,
user confirmation and SMTP. “Auth migration is not ready” means the migration
has not completed or its RPC is unavailable.

Keep secure policies in place while repairing the frontend. Do not use the old
public-access schema as a rollback. Preserve newer work before restoring backups.
