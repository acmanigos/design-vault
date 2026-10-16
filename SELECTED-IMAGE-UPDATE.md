# Return to the selected image

When you scroll down through options and most of the main preview leaves the
screen, an orange **↑ Selected image** button appears at the bottom-right.
It shows the currently selected option's name. Click it to return to that
preview. The shortcut disappears when the preview comes back into view.

Selecting options and playing videos work as before. Using the shortcut does
not change your selection or reset an open video. It supports keyboard use
and respects your device's reduced-motion setting.

## Install

Extract this ZIP and copy its contents into your existing Design Vault repository,
keeping the same folders and replacing matching files. Commit/upload the changes,
wait for GitHub Pages deployment, then refresh or reopen the PWA.

This update builds on the image-first/video-button update. No SQL, new credentials
or database changes are needed.

## Verification

TypeScript, existing regression tests, and the GitHub Pages static export are
checked locally. The static export uses the existing sandbox-compatible build
adapter. After deployment, open an Idea Box with many options, scroll down, and
click Selected image to verify the shortcut on your device.
