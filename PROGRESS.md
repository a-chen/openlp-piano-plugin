# OpenLP Sheet Music Plugin — Progress

## Status: Complete

| # | File | Status |
|---|------|--------|
| 1 | `PLAN.md` | ✅ Done |
| 2 | `PROGRESS.md` | ✅ Done |
| 3 | `contrib/plugins/sheetmusic/__init__.py` | ✅ Done |
| 4 | `contrib/plugins/sheetmusic/sheetmusicplugin.py` | ✅ Done |
| 5 | `contrib/plugins/sheetmusic/api/__init__.py` | ✅ Done |
| 6 | `contrib/plugins/sheetmusic/static/stage.html` | ✅ Done |
| 7 | `contrib/plugins/sheetmusic/static/stage.css` | ✅ Done |
| 8 | `contrib/plugins/sheetmusic/static/stage.js` | ✅ Done |
| 9 | `contrib/plugins/sheetmusic/static/index.json` | ✅ Done |

## Bundled Libraries (downloaded automatically)

| File | Version | Source |
|------|---------|--------|
| `static/opensheetmusicdisplay.min.js` | 1.9.7 | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/releases |
| `static/pdf.min.mjs` | 5.4.624 (legacy) | https://github.com/mozilla/pdf.js/releases |
| `static/pdf.worker.min.mjs` | 5.4.624 (legacy) | https://github.com/mozilla/pdf.js/releases |

**Note:** PDF.js v5 ships as ES modules (`.mjs`). The stage view loads as
`type="module"` to support this. OSMD remains a UMD bundle and loads via a
regular `<script>` tag.

## Sample Files

| File | Format | Song |
|------|--------|------|
| `static/amazing-grace.xml` | MusicXML (OSMD) | Amazing Grace — John Newton |
| `static/how-great-thou-art.xml` | MusicXML (OSMD) | How Great Thou Art — Stuart K. Hine |
| `static/here-i-am-to-worship.pdf` | PDF (PDF.js) | Here I Am to Worship — Tim Hughes |

## Notes

- The `index.json` shipped inside `static/` is the sample catalog used when
  the plugin is first installed. In production, place `index.json` and all
  sheet music files in `<OpenLP data>/sheetmusic/` instead — those are served
  at `/sheetmusic/files/` and are not overwritten by plugin updates.
- The sample files in `static/` are served at `/sheetmusic/static/` and are
  only for testing. They demonstrate both renderer types (OSMD and PDF.js).
