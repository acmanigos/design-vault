# Design image first, video on click

Copy the contents of this update ZIP into the root of your existing Design Vault
repository, keeping the same folders. Replace matching files, commit/upload to
GitHub and wait for deployment. Close old tabs and reopen or refresh your PWA.

This update builds on the Google Drive video update. It needs no new SQL,
Supabase settings, API keys or data migration.

## Behavior

- Opening an Idea Box or switching options shows its design image first.
- If that option has a video, a Play video button appears at the bottom-right.
- Clicking it switches the main preview to the video player.
- Back to image returns to the design and removes the player, stopping playback.
- Switching to another option also removes the previous player and resets to
  the design image, even when both options use the same video link.
- Image-only options show no play button.
- Google Drive, YouTube and direct videos retain their existing behavior and
  access permissions. Source/option video priority stays the same.
- Both landscape and Plan Your Visit portrait images retain their sizing.

This changes presentation only. Images, video links, options and saved vault
records keep their existing format.

## Validation

TypeScript and all 19 automated tests passed. The new rendering checks verify
that Drive, YouTube and direct-video options start with an image and Play video
button, without mounting a video player. Image-only options omit the button.
The GitHub Pages static export was generated with the existing sandbox-compatible
worker adapter; the deployment workflow should run the normal build.
Live video playback and browser interactions were not exercised in this update.
