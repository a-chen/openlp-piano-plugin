# OpenLP Sheet Music Plugin — Plan

## Overview

A self-contained OpenLP community plugin that displays piano sheet music (MusicXML
or PDF) on musician tablets when a song goes live, falling back to the built-in
chord view when no sheet music is available for the current song.

---

## How It Works (User-Facing)

1. Musician opens `http://<openlp-host>:<port>/sheetmusic/` on their tablet
2. When the operator changes the live song in OpenLP, the tablet automatically
   loads the matching sheet music (MusicXML rendered by OSMD, or PDF rendered by
   PDF.js)
3. The musician scrolls through the sheet music manually at their own pace
4. If no sheet music file exists for the current song, the view falls back to the
   built-in `/chords` page (chord chart above lyrics), or plain lyrics if no chords
   exist
5. When the operator moves to the next song, the tablet auto-updates again

---

## Architecture

```
OpenLP (running)
  │
  ├── WebSocket  →  stage page detects song changes (item UUID)
  ├── REST API   →  fetches song title on change
  │                 GET /api/v2/controller/live-items → data.title (normalized)
  └── HTTP server (extended via plugin Flask blueprint)
        ├── GET /sheetmusic/           → serves stage.html
        ├── GET /sheetmusic/static/*   → serves JS/CSS/libraries
        └── GET /sheetmusic/files/*    → serves MusicXML + PDF files
                                          from <OpenLP data>/sheetmusic/
```

### Song Change Detection

The WebSocket pushes state on every change:
```json
{ "results": { "item": "<uuid>", "slide": 0, ... } }
```

- `results.item` UUID changes → new song is live
- On song change: call `GET /api/v2/controller/live-items`
  - `data.title` is the normalized (lowercase) song title — used as lookup key
- Slide changes within the same song are **ignored** (no section sync)

### Lookup Flow

```
data.title (e.g. "amazing grace")
  ↓
Look up in index.json
  ├── Found, .mxl or .xml  →  OSMD renders sheet music
  ├── Found, .pdf          →  PDF.js renders sheet music
  └── Not found            →  show <iframe src="/chords">
```

---

## File Structure

### Plugin Code (community plugin path)

```
<DataDir>/contrib/plugins/sheetmusic/
  __init__.py                        ← empty package marker
  sheetmusicplugin.py                ← Plugin subclass, registers Flask blueprint
  api/
    __init__.py                      ← Flask Blueprint + route handlers
  static/
    stage.html                       ← tablet web page (served at /sheetmusic/)
    stage.css                        ← styling (dark bg, tablet-optimised)
    stage.js                         ← WebSocket logic + renderer switching
    opensheetmusicdisplay.min.js     ← OSMD library (bundled, not fetched at runtime)
    pdf.min.js                       ← PDF.js library
    pdf.worker.min.js                ← PDF.js web worker (required by PDF.js)
```

**Community plugin install paths (no modification to OpenLP source needed):**

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\openlp\data\contrib\plugins\sheetmusic\` |
| macOS    | `~/Library/Application Support/openlp/Data/contrib/plugins/sheetmusic/` |
| Linux    | `~/.local/share/openlp/contrib/plugins/sheetmusic/` |

OpenLP's `PluginManager.bootstrap_initialise()` automatically scans
`<DataDir>/contrib/plugins/*/[!.]*plugin.py` and loads any plugin it finds there.
No changes to OpenLP itself are required.

### Song Data (separate from code, survives plugin updates)

```
<DataDir>/sheetmusic/
  index.json          ← song catalog: normalized title → filename
  amazing-grace.mxl
  how-great-thou-art.pdf
  ...
```

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\openlp\data\sheetmusic\` |
| macOS    | `~/Library/Application Support/openlp/Data/sheetmusic/` |
| Linux    | `~/.local/share/openlp/sheetmusic/` |

Uses `AppLocation.get_section_data_path('sheetmusic')` — the same convention used
by all built-in OpenLP plugins. The directory is created automatically on first run.

---

## Plugin Implementation

### `sheetmusicplugin.py`

Subclasses `Plugin`. Registers a Flask Blueprint in `__init__` by importing the
Flask app singleton before the HTTP server thread starts:

```python
from openlp.core.api import app as flask_app
from openlp.plugins.sheetmusic.api import blueprint

class SheetMusicPlugin(Plugin):
    def __init__(self):
        super().__init__('sheetmusic')
        self.weight = -1
        flask_app.register_blueprint(blueprint)
        State().add_service(self.name, self.weight, is_plugin=True)
        State().update_pre_conditions(self.name, self.check_pre_conditions())
```

No `media_item_class` or `settings_tab_class` for initial version — purely a
web interface with no media dock panel.

### `api/__init__.py` — Flask Blueprint & Routes

| Method | Route | Serves |
|--------|-------|--------|
| GET | `/sheetmusic/` | `static/stage.html` |
| GET | `/sheetmusic/static/<path>` | Any file from `static/` dir (JS, CSS, libs) |
| GET | `/sheetmusic/files/<path>` | Any file from `<DataDir>/sheetmusic/` |

Uses `AppLocation.get_section_data_path('sheetmusic')` for the data path and
OpenLP's `get_mime_type()` helper for consistent MIME type handling.

---

## Front-End (`static/`)

### `stage.html`

Minimal HTML shell with three mutually exclusive panels:
- `#sheet-music-view` — OSMD renders MusicXML here
- `#pdf-view` — PDF.js renders PDF pages here, with prev/next buttons
- `#chords-frame` — `<iframe src="/chords">` for the fallback

### `stage.css`

- Black background (stage-friendly, no glare)
- Full-viewport layout
- Song title overlay bar (top, semi-transparent)
- Each panel fills viewport height and is independently scrollable
- Touch-friendly (no hover states, large tap targets for PDF prev/next)

### `stage.js`

**Initialisation:**
1. `GET /api/v2/core/system` → get WebSocket port
2. `GET /sheetmusic/files/index.json` → load song catalog into memory
3. Connect to `ws://<host>:<wsPort>/`

**WebSocket message handler:**
- `results.item` unchanged → ignore (slide change within same song)
- `results.item` changed → new song:
  - `GET /api/v2/controller/live-items` → `data.title` (already lowercase)
  - Look up in catalog
  - `.mxl`/`.xml` → OSMD: `osmd.load()` + `osmd.render()` + scroll to top
  - `.pdf` → PDF.js: load document, render page 1
  - Not found → show chords iframe

---

## `index.json` Format

```json
{
  "amazing grace": { "file": "amazing-grace.mxl" },
  "how great thou art": { "file": "how-great-thou-art.pdf" },
  "here i am to worship": { "file": "here-i-am-to-worship.mxl" }
}
```

- Keys match `data.title` from `GET /api/v2/controller/live-items` exactly
  (OpenLP normalizes to lowercase)
- Values are filenames inside `<DataDir>/sheetmusic/`
- File type inferred from extension: `.mxl`/`.xml` → OSMD, `.pdf` → PDF.js
- Songs not in `index.json` silently fall back to the chord view

---

## Adding a New Song

### From MuseScore
1. Export score as MusicXML (`.mxl`) from MuseScore 4
2. Copy to `<DataDir>/sheetmusic/`
3. Add entry to `index.json` — key must be the lowercase song title as it
   appears in OpenLP (check via `GET /api/v2/controller/live-items` → `data.title`)

### From PDF
1. Copy PDF directly to `<DataDir>/sheetmusic/` — no conversion needed
2. Add entry to `index.json`

No OpenLP restart required — `index.json` is fetched fresh on each page load.

---

## Third-Party Libraries (Bundled)

Both libraries are bundled in `static/` so the plugin works offline.

| Library | Purpose | Source |
|---------|---------|--------|
| `opensheetmusicdisplay.min.js` | Renders MusicXML as SVG staff notation | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/releases |
| `pdf.min.js` + `pdf.worker.min.js` | Renders PDF pages to canvas | https://github.com/mozilla/pdf.js/releases |

PDF.js requires `workerSrc` to be set explicitly in `stage.js`:
```javascript
pdfjsLib.GlobalWorkerOptions.workerSrc = '/sheetmusic/static/pdf.worker.min.js';
```

---

## Out of Scope (Initial Version)

- Media dock panel in the OpenLP UI
- Settings tab
- Section/slide sync (sheet music scrolls independently)
- Audio playback
- Transpose controls
- MIDI sync

---

## Known Risk

The plugin registers its Flask Blueprint by importing `from openlp.core.api import app`
directly. This is an internal (not public) OpenLP API. It has been stable for years
but could break if OpenLP restructures `openlp/core/api/__init__.py`. A future
upstream PR could add an official blueprint registration hook to eliminate this risk.
