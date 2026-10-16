# Google Drive video update

## Install this update

The small update ZIP contains only changed/new files. Extract it and copy its
contents into your existing Design Vault repository, keeping the same folders.
Commit/upload the files, wait for GitHub Pages deployment, then close old app
tabs and reopen or refresh the vault.

No new SQL, Supabase migration, environment values or Google API keys are needed.
Your existing Auth/team setup stays in use.

## Use it

- Paste a Google Drive **video file** share link into an Idea Box's **Source**
  field. Save the Idea Box to show its embedded preview.
- You can also paste Drive links into an option's **Video URL** field in a
  video-enabled library.
- The selected option's Video URL takes priority, followed by the older
  box-level Video URL, then a recognized Drive link in Source.
- Drive links in Source work in either library preset. Plan Your Visit retains
  its 9:16 player.
- Source stays a normal citation field for text and other URLs.
- Gallery cards display a Video badge for a Drive video in Source.
- Use **Open in Google Drive** if the embedded player cannot play the file.

Use a link to the actual video file, not its containing folder. The app recognizes
file/d/ID/view, file/d/ID/preview, open?id=ID and uc?id=ID links, including
resource keys used by some shared files.

Google Drive permissions still apply. Give your friend Viewer access to the
Drive file, or deliberately choose Anyone with the link → Viewer if appropriate.
Sharing a library does not automatically grant access to its linked Drive files.
The update does not change Drive sharing settings or download the videos.
Drive previews require internet access and can be affected by processing,
browser cookies or organization restrictions. The app cannot verify that a
Drive file is a video without opening it.

References: [Drive video playback](https://support.google.com/drive/answer/2423694?hl=en)
and [Drive resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).

## Verification

Tests cover supported links, preserved resource keys, source/option priority,
invalid links, existing YouTube/direct playback and iframe rendering.
All 17 automated checks and TypeScript passed. The normal production build
compiled but hit this environment's child-process restriction; the static
export is checked with the same sandbox-compatible worker adapter used for
the Auth/team update. GitHub Actions should perform the normal deployment build.
No private Drive file or real Google account was accessed during testing;
playback of your actual video depends on its Drive permissions.
