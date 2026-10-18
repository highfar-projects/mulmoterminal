# A folder as a gallery in the Files pane (#3079)

## Problem

A folder of pictures or videos could only be looked at one file at a time.

## Decided (with the user)

- Opened from a folder's right-click menu ("Open as gallery").
- That folder's own files only, not subfolders: pictures (SVG too), videos, sounds and PDFs (as an
  icon).
- Videos and sounds play inside their tile with the browser's controls; one at a time.
- Clicking a tile shows it large inside the gallery: ← / → through the folder (round the ends),
  Esc back to the grid, Esc again closes.

## Shape

- `src/components/filesGallery.ts` (pure):
  - `galleryKind`: `fileMediaKind`, plus SVG as a picture;
  - `galleryItems`: the folder's own files, in natural name order;
  - `steppedIndex`;
  - `GALLERY_PAGE_SIZE`.
- `src/composables/useFilesGallery.ts`: the open folder and its listing, through the tree's own
  `fetchListing`, with a generation guard so a slow listing cannot land over a newer folder or a
  closed gallery.
- `src/components/FilesGallery.vue`:
  - drawn over the pane's file area (absolute, above the editor), so nothing under it is unmounted
    and closing it shows the open file as it was;
  - tiles come from the raw route (Range for video), shown a page at a time with "Show more";
  - the large view reuses `FilesMediaView`.
- `filesRowActions.ts`: `open-gallery` on folder rows.
- `FilesPane.vue`:
  - the action opens the gallery;
  - opening any file, or a re-root, closes it.
  - The conflict banner moved out to `FilesConflictBanner.vue` (a verbatim template move) to stay
    within the file's line cap.
- Strings in the five `filesTree` locale files.

## Out of scope

- Subfolders.
- PDF first-page thumbnails.
- A gallery in the full-screen `/files` view's own toolbar; it gets the same row menu, since it
  mounts the same pane.
