/**
 * OpenLP Piano Plugin — Stage View
 *
 * Connects to OpenLP's WebSocket to detect song changes, then loads the
 * matching MusicXML (rendered by OSMD) or PDF (rendered by PDF.js) from the
 * piano data directory. Falls back to the built-in /chords iframe when
 * no sheet music is available for the current song.
 *
 * PDF.js v5 ships as ES modules — this file is loaded as type="module".
 * OSMD is a UMD bundle loaded via a regular <script> tag before this module,
 * so it is available on the global window object as opensheetmusicdisplay.
 */

import * as pdfjsLib from '/piano/static/pdf.min.mjs';

// ============================================================
// PDF.js worker configuration (must be set before any PDF load)
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc = '/piano/static/pdf.worker.min.mjs';

// ============================================================
// On-screen debug log (helps diagnose without dev tools)
// ============================================================
const debugEl = document.getElementById('debug-overlay');
function dbg(msg) {
  console.log('[Piano]', msg);
  if (debugEl) {
    debugEl.textContent += msg + '\n';
    debugEl.scrollTop = debugEl.scrollHeight;
  }
}

// ============================================================
// DOM references
// ============================================================
const titleEl        = document.getElementById('song-title');
const badgeEl        = document.getElementById('view-badge');
const sheetPanel     = document.getElementById('sheet-music-view');
const pdfPanel       = document.getElementById('pdf-view');
const chordsFrame    = document.getElementById('chords-frame');
const pdfCanvas      = document.getElementById('pdf-canvas');
const pdfPrevBtn     = document.getElementById('pdf-prev');
const pdfNextBtn     = document.getElementById('pdf-next');
const pdfCurrentEl   = document.getElementById('pdf-current-page');
const pdfTotalEl     = document.getElementById('pdf-total-pages');
const versionEl      = document.getElementById('version-badge');

// ============================================================
// OSMD setup
// ============================================================
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay('osmd-container', {
  autoResize: true,
  drawTitle: false,
  drawComposer: false,
  drawCredits: false,
  drawPartNames: false,
  // 'Endless' = single scrollable column, no hard page breaks
  // This suits a tablet where the musician scrolls vertically
  pageFormat: 'Endless',
  // Use a consistent background so the panel white background shows through
  backend: 'svg',
});

// ============================================================
// State
// ============================================================
let catalog       = {};   // index.json contents: { "song title": { file: "..." }, ... }
let currentItemId = null; // UUID of the currently live service item
let currentPdf    = null; // pdfjsLib document object
let currentPage   = 1;    // active PDF page number
let renderTask    = null; // current PDF.js renderTask (cancel on page change)

// ============================================================
// Panel helpers
// ============================================================

/** Hide all content panels and clear the view badge. */
function hideAll() {
  sheetPanel.classList.add('hidden');
  pdfPanel.classList.add('hidden');
  chordsFrame.classList.add('hidden');
  badgeEl.textContent = '';
}

function showSheetMusicPanel() {
  hideAll();
  sheetPanel.classList.remove('hidden');
  badgeEl.textContent = 'Sheet Music';
}

function showPdfPanel() {
  hideAll();
  pdfPanel.classList.remove('hidden');
  badgeEl.textContent = 'PDF';
}

function showChordsPanel() {
  hideAll();
  chordsFrame.classList.remove('hidden');
  badgeEl.textContent = 'Chords';
}

// ============================================================
// MusicXML / OSMD rendering
// ============================================================

  /**
   * Load and render a MusicXML file via OSMD.
   * @param {string} filename - Filename within /piano/files/
   */
async function loadMusicXml(filename) {
  showSheetMusicPanel();
  try {
    await osmd.load(`/piano/files/${filename}`);
    osmd.render();
    // Scroll to top of the sheet music panel on every new song
    sheetPanel.scrollTop = 0;
    return true;
  } catch (err) {
    console.error('[Piano] OSMD failed to load', filename, err);
    dbg('OSMD failed: ' + err);
    return false;
  }
}

// ============================================================
// PDF / PDF.js rendering
// ============================================================

/**
 * Render a single page of the current PDF onto the canvas.
 * Cancels any in-progress render before starting a new one.
 * @param {number} pageNumber - 1-based page number
 */
async function renderPdfPage(pageNumber) {
  if (!currentPdf) return;

  // Cancel any previous in-progress render to avoid overlap
  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }

  const page = await currentPdf.getPage(pageNumber);

  // Scale the page to fit the device pixel width while respecting
  // the device pixel ratio for crisp rendering on high-DPI screens
  const devicePixelRatio = window.devicePixelRatio || 1;
  const viewportWidth    = pdfPanel.clientWidth || window.innerWidth;
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale            = (viewportWidth / unscaledViewport.width) * devicePixelRatio;
  const viewport         = page.getViewport({ scale });

  // Size the canvas to the scaled viewport
  pdfCanvas.width  = viewport.width;
  pdfCanvas.height = viewport.height;
  // Use CSS to display at logical (non-pixel) size
  pdfCanvas.style.width  = `${viewport.width / devicePixelRatio}px`;
  pdfCanvas.style.height = `${viewport.height / devicePixelRatio}px`;

  const ctx = pdfCanvas.getContext('2d');
  renderTask = page.render({ canvasContext: ctx, viewport });

  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') {
      console.error('[SheetMusic] PDF render error', err);
    }
  } finally {
    renderTask = null;
  }

  // Update page counter UI
  pdfCurrentEl.textContent = pageNumber;
  pdfPrevBtn.disabled = pageNumber <= 1;
  pdfNextBtn.disabled = pageNumber >= currentPdf.numPages;
}

  /**
   * Load a PDF file and render its first page.
   * @param {string} filename - Filename within /piano/files/
   */
async function loadPdf(filename) {
  showPdfPanel();
  currentPage = 1;

  try {
    const loadingTask = pdfjsLib.getDocument(`/piano/files/${filename}`);
    currentPdf = await loadingTask.promise;
    pdfTotalEl.textContent = currentPdf.numPages;
    await renderPdfPage(currentPage);
    // Scroll to top of PDF panel on every new song
    pdfPanel.scrollTop = 0;
    return true;
  } catch (err) {
    console.error('[Piano] PDF.js failed to load', filename, err);
    dbg('PDF.js failed: ' + err);
    return false;
  }
}

// PDF navigation buttons
pdfPrevBtn.addEventListener('click', () => {
  if (currentPdf && currentPage > 1) {
    currentPage -= 1;
    renderPdfPage(currentPage);
    pdfPanel.scrollTop = 0;
  }
});

pdfNextBtn.addEventListener('click', () => {
  if (currentPdf && currentPage < currentPdf.numPages) {
    currentPage += 1;
    renderPdfPage(currentPage);
    pdfPanel.scrollTop = 0;
  }
});

// Re-render current PDF page when orientation changes so the canvas
// is re-scaled to the new viewport width
window.addEventListener('resize', () => {
  if (!pdfPanel.classList.contains('hidden') && currentPdf) {
    renderPdfPage(currentPage);
  }
});

// ============================================================
// Song change handler
// ============================================================

/**
 * Called when a new service item (song) goes live.
 * Fetches the live item data, looks up the catalog, and loads the
 * appropriate renderer or falls back to the chord view.
 */
async function onSongChanged() {
  let liveItem;
  try {
    const res = await fetch('/api/v2/controller/live-items');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    liveItem = await res.json();
  } catch (err) {
    console.error('[Piano] Failed to fetch live-items', err);
    return;
  }

  // Update title bar
  const displayTitle = liveItem.title || 'Unknown Song';
  titleEl.textContent = displayTitle;

  // data.title is OpenLP's search_title, which may have a trailing '@' separator
  // (appended when an alternate title is present). Strip it before catalog lookup.
  const rawTitle = (liveItem.data && liveItem.data.title) || displayTitle.toLowerCase();
  const normalizedTitle = rawTitle.replace(/@+$/, '').trimEnd();
  dbg('Song: "' + normalizedTitle + '" — catalog match: ' + (catalog[normalizedTitle] ? catalog[normalizedTitle].file : 'none'));
  const entry = catalog[normalizedTitle];

  if (!entry) {
    // No sheet music for this song — show the chord view
    dbg('No catalog entry — showing chords');
    showChordsPanel();
    return;
  }

  // Support both { file: "..." } (single) and { files: [...] } (priority list).
  // Files are tried in order; the first one that loads successfully wins.
  const fileList = entry.files || (entry.file ? [entry.file] : []);

  if (fileList.length === 0) {
    dbg('Catalog entry has no files — showing chords');
    showChordsPanel();
    return;
  }

  for (const filename of fileList) {
    const ext = filename.split('.').pop().toLowerCase();
    dbg('Trying file: ' + filename);
    if (ext === 'mxl' || ext === 'xml') {
      const ok = await loadMusicXml(filename);
      if (ok) return;
    } else if (ext === 'pdf') {
      const ok = await loadPdf(filename);
      if (ok) return;
    } else {
      console.warn('[Piano] Unsupported file extension:', ext, '— skipping');
    }
  }

  // All files failed — fall back to chords
  dbg('All files failed — showing chords');
  showChordsPanel();
}

// ============================================================
// WebSocket connection
// ============================================================

let ws            = null;
let wsReconnectMs = 2000; // start at 2 s, doubles on each failure up to 30 s
const WS_MAX_RECONNECT_MS = 30_000;

/**
 * Connect to OpenLP's WebSocket state endpoint.
 * Automatically reconnects with exponential back-off on close/error.
 * @param {number} wsPort - WebSocket port from /api/v2/core/system
 */
function connectWebSocket(wsPort) {
  const url = `ws://${location.hostname}:${wsPort}/`;
  console.info('[Piano] Connecting to WebSocket:', url);

  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    dbg('WS connected to ' + url);
    wsReconnectMs = 2000; // reset back-off on successful connection
    // Immediately load whatever is currently live — the server's initial push
    // may arrive before the 'message' listener is attached on fast local networks.
    onSongChanged();
  });

  ws.addEventListener('message', (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return; // ignore non-JSON messages
    }

    const results = data.results;
    if (!results) return;

    // Only act on song (service item) changes; ignore slide advances
    dbg('WS msg: item=' + results.item + (results.item === currentItemId ? ' (same, skipping)' : ' (new)'));
    if (results.item === currentItemId) return;
    currentItemId = results.item;

    onSongChanged();
  });

  ws.addEventListener('close', () => {
    dbg('WS closed — reconnecting in ' + wsReconnectMs + 'ms');
    setTimeout(() => connectWebSocket(wsPort), wsReconnectMs);
    wsReconnectMs = Math.min(wsReconnectMs * 2, WS_MAX_RECONNECT_MS);
  });

  ws.addEventListener('error', (err) => {
    dbg('WS error: ' + err);
    // 'close' event fires after 'error', so reconnect is handled there
  });
}

// ============================================================
// Initialisation
// ============================================================

async function init() {
  dbg('init() start — hostname: ' + location.hostname);

  // 0. Display plugin version
  try {
    const res = await fetch('/piano/static/version.json');
    if (res.ok) {
      const { version } = await res.json();
      if (versionEl) versionEl.textContent = 'v' + version;
    }
  } catch {
    // Non-critical — badge stays blank
  }

  // 1. Load the song catalog
  try {
    const res = await fetch('/piano/files/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    catalog = await res.json();
    dbg('Catalog loaded: ' + Object.keys(catalog).join(', '));
  } catch (err) {
    dbg('Could not load index.json: ' + err);
    catalog = {};
  }

  // 2. Get the WebSocket port from OpenLP
  let wsPort;
  try {
    const res = await fetch('/api/v2/core/system');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const system = await res.json();
    wsPort = system.websocketPort || system.websocket_port;
    if (!wsPort) throw new Error('websocketPort not found in system response');
    dbg('WS port: ' + wsPort);
  } catch (err) {
    dbg('Failed to get WS port: ' + err);
    titleEl.textContent = 'Cannot connect to OpenLP';
    badgeEl.textContent = 'Error';
    return;
  }

  // 3. Connect — the WebSocket server sends the current state immediately on
  //    connect, so onSongChanged() will fire right away if a song is already live
  connectWebSocket(wsPort);
}

init();
