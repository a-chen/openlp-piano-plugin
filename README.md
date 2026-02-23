# OpenLP Piano Plugin

## Overview

A self-contained OpenLP community plugin that displays piano sheet music
(MusicXML or PDF) on musician tablets when a song goes live, falling back to
the built-in chord view when no sheet music is available for the current song.

---

## How It Works (User-Facing)

1. Musician opens `http://<openlp-host>:<port>/piano/` on their tablet
2. When the operator changes the live song in OpenLP, the tablet automatically
   loads the matching sheet music (MusicXML rendered by OSMD, or PDF rendered
   by PDF.js)
3. The musician scrolls through the sheet music manually at their own pace
4. If no sheet music file exists for the current song, the view falls back to
   the built-in `/chords` page (chord chart above lyrics), or plain lyrics if
   no chords exist
5. When the operator moves to the next song, the tablet auto-updates again

---

## Architecture

```
OpenLP (running)
  │
  ├── WebSocket  →  stage page detects song changes (item UUID)
  ├── REST API   →  fetches song title on change
  │                 GET /api/v2/controller/live-items → data.title (normalised)
  └── HTTP server (extended via plugin Flask blueprint)
        ├── GET /piano/           → serves stage.html
        ├── GET /piano/static/*   → serves JS/CSS/libraries
        └── GET /piano/files/*    → serves MusicXML + PDF files
                                    from <OpenLP data>/piano/
```

### Song Change Detection

The WebSocket pushes state on every change:
```json
{ "results": { "item": "<uuid>", "slide": 0, ... } }
```

- `results.item` UUID changes → new song is live
- On song change: call `GET /api/v2/controller/live-items`
  - `data.title` is the normalised (lowercase) song title — used as lookup key.
    A trailing `@` separator (added by OpenLP when an alternate title exists) is
    stripped before the catalog lookup.
- Slide changes within the same song are **ignored** (no section sync)
- The WebSocket reconnects automatically with exponential back-off (2 s → 30 s
  max) if the connection is lost

### Lookup Flow

```
data.title (e.g. "amazing grace")
  ↓
Strip trailing "@" separator if present
  ↓
Look up in index.json
  ├── Found, .mxl or .xml  →  OSMD renders sheet music
  ├── Found, .pdf          →  PDF.js renders sheet music
  └── Not found            →  show <iframe src="/chords">
```

When a catalog entry has a `files` list (priority array), files are tried in
order; the first one that loads successfully is displayed. If all files fail,
the view falls back to the chord view.

---

## File Structure

### Plugin Code

The plugin folder is named `piano`. Install it into OpenLP's community plugin
search path:

```
<DataDir>/contrib/plugins/piano/
  __init__.py                        ← empty package marker
  pianoplugin.py                     ← Plugin subclass, registers Flask blueprint
  api/
    __init__.py                      ← Flask Blueprint + route handlers
  static/
    stage.html                       ← tablet web page (served at /piano/)
    stage.css                        ← styling (dark bg, tablet-optimised)
    stage.js                         ← WebSocket logic + renderer switching (ES module)
    opensheetmusicdisplay.min.js     ← OSMD library (bundled, not fetched at runtime)
    pdf.min.mjs                      ← PDF.js v5 library (ES module)
    pdf.worker.min.mjs               ← PDF.js v5 web worker (ES module)
```

**Community plugin install paths (no modification to OpenLP source needed):**

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\openlp\data\contrib\plugins\piano\` |
| macOS    | `~/Library/Application Support/openlp/Data/contrib/plugins/piano/` |
| Linux    | `~/.local/share/openlp/contrib/plugins/piano/` |

OpenLP's `PluginManager.bootstrap_initialise()` automatically scans
`<DataDir>/contrib/plugins/*/[!.]*plugin.py` and loads any plugin it finds
there. No changes to OpenLP itself are required.

### Song Data (separate from code, survives plugin updates)

```
<DataDir>/piano/
  index.json          ← song catalog: normalised title → filename(s)
  amazing-grace.mxl
  how-great-thou-art.pdf
  ...
```

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\openlp\data\piano\` |
| macOS    | `~/Library/Application Support/openlp/Data/piano/` |
| Linux    | `~/.local/share/openlp/piano/` |

Uses `AppLocation.get_section_data_path('piano')` — the same convention used
by all built-in OpenLP plugins. The directory is created automatically on first
run.

---

## Plugin Implementation

### `pianoplugin.py`

Subclasses `Plugin`. Registers a Flask Blueprint in `__init__` by importing the
Flask app singleton before the HTTP server thread starts. Registers a default
`piano/status` setting so OpenLP's settings system does not raise a `KeyError`:

```python
from openlp.core.api import app as flask_app
from contrib.plugins.piano.api import blueprint

class PianoPlugin(Plugin):
    def __init__(self):
        super().__init__('piano')
        self.weight = -1
        Settings.extend_default_settings({'piano/status': PluginStatus.Active})
        flask_app.register_blueprint(blueprint)
        State().add_service(self.name, self.weight, is_plugin=True)
        State().update_pre_conditions(self.name, self.check_pre_conditions())
```

Blueprint registration is wrapped in a `try/except` so that a failure produces a
log error rather than preventing OpenLP from starting.

No `media_item_class` or `settings_tab_class` for initial version — purely a
web interface with no media dock panel.

### `api/__init__.py` — Flask Blueprint & Routes

| Method | Route | Serves |
|--------|-------|--------|
| GET | `/piano/` | `static/stage.html` |
| GET | `/piano/static/<path>` | Any file from `static/` dir (JS, CSS, libs) |
| GET | `/piano/files/<path>` | Any file from `<DataDir>/piano/` |

Uses `AppLocation.get_section_data_path('piano')` for the data path and
OpenLP's `get_mime_type()` helper for consistent MIME type handling.

---

## Front-End (`static/`)

### `stage.html`

Minimal HTML shell with three mutually exclusive panels:
- `#sheet-music-view` — OSMD renders MusicXML here
- `#pdf-view` — PDF.js renders PDF pages here, with prev/next page buttons
- `#chords-frame` — `<iframe src="/chords">` for the fallback

Additional UI elements:
- `#title-bar` — fixed header showing the current song title and a **view
  badge** (`Sheet Music`, `PDF`, or `Chords`) indicating which renderer is
  active
- `#debug-overlay` — on-screen log panel (visible until WebSocket connects,
  useful for diagnosing connectivity without browser dev tools)

`stage.js` is loaded as `type="module"` (required by PDF.js v5 ES modules).
OSMD is a UMD bundle and is loaded via a regular `<script>` tag before the
module, making it available as `window.opensheetmusicdisplay`.

### `stage.css`

- Black background (stage-friendly, no glare)
- Full-viewport layout; individual panels scroll, not the outer page
- Fixed title bar (48 px) with backdrop blur, song title, and view badge
- Each panel fills the viewport height below the title bar and is
  independently scrollable
- Touch-friendly (large 52 px tap targets for PDF prev/next buttons, iOS
  momentum scrolling)
- `.status-message` utility class for error/waiting states

### `stage.js`

**Initialisation order:**
1. `GET /piano/files/index.json` → load song catalog into memory
2. `GET /api/v2/core/system` → get WebSocket port
3. Connect to `ws://<host>:<wsPort>/`
4. On connect: immediately call `onSongChanged()` to load whatever is
   currently live, without waiting for the first WS message

**WebSocket message handler:**
- `results.item` unchanged → ignore (slide change within the same song)
- `results.item` changed → new song:
  - `GET /api/v2/controller/live-items` → `liveItem.data.title` (lowercased
    by OpenLP; trailing `@` stripped before lookup)
  - Look up in catalog
  - `.mxl`/`.xml` → OSMD: `osmd.load()` + `osmd.render()` + scroll to top
  - `.pdf` → PDF.js: load document, render page 1
  - Not found (or all files fail) → show chords iframe

**PDF rendering details:**
- Pages are scaled to fit the device viewport width at the device's native
  pixel ratio (sharp on Retina/HiDPI screens)
- On orientation/window resize the current page is re-rendered at the new size
- Prev/Next buttons scroll panel back to top on each page turn

---

## `index.json` Format

Each entry supports either a single file (`file`) or an ordered priority list
(`files`). Files are tried in order; the first that loads successfully wins.

```json
{
  "amazing grace": { "file": "amazing-grace.mxl" },
  "how great thou art": { "file": "how-great-thou-art.pdf" },
  "here i am to worship": {
    "files": ["here-i-am-to-worship.mxl", "here-i-am-to-worship.pdf"]
  }
}
```

- Keys match `data.title` from `GET /api/v2/controller/live-items` (OpenLP
  normalises to lowercase; any trailing `@` is stripped by the front-end)
- Values are filenames inside `<DataDir>/piano/`
- File type inferred from extension: `.mxl`/`.xml` → OSMD, `.pdf` → PDF.js
- Songs not in `index.json` silently fall back to the chord view

---

## Adding a New Song

### From MuseScore
1. Export score as MusicXML (`.mxl`) from MuseScore 4
2. Copy to `<DataDir>/piano/`
3. Add entry to `index.json` — key must be the lowercase song title as it
   appears in OpenLP (check via `GET /api/v2/controller/live-items` →
   `data.title`, with any trailing `@` removed)

### From PDF
1. Copy PDF directly to `<DataDir>/piano/` — no conversion needed
2. Add entry to `index.json`

No OpenLP restart required — `index.json` is fetched fresh on each page load.

---

## Third-Party Libraries (Bundled)

Both libraries are bundled in `static/` so the plugin works offline.

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `opensheetmusicdisplay.min.js` | 1.9.7 | Renders MusicXML as SVG staff notation (UMD) | https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/releases |
| `pdf.min.mjs` + `pdf.worker.min.mjs` | 5.4.624 | Renders PDF pages to canvas (ES modules) | https://github.com/mozilla/pdf.js/releases |

PDF.js v5 ships as ES modules (`.mjs`). `stage.js` is therefore loaded as
`type="module"`. The worker source is configured in `stage.js`:
```javascript
pdfjsLib.GlobalWorkerOptions.workerSrc = '/piano/static/pdf.worker.min.mjs';
```

OSMD remains a UMD bundle and is loaded via a regular `<script>` tag before
the module, making it available as `window.opensheetmusicdisplay`.

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
directly. This is an internal (not public) OpenLP API. It has been stable for
years but could break if OpenLP restructures `openlp/core/api/__init__.py`. A
future upstream PR could add an official blueprint registration hook to
eliminate this risk.
