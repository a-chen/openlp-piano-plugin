"""
Flask Blueprint for the Piano plugin.

Registers three routes under the /piano/ prefix:

  GET /piano/              → stage.html (the tablet web page)
  GET /piano/static/<path> → JS, CSS, and bundled libraries
  GET /piano/files/<path>  → MusicXML and PDF files from the data directory
"""
import logging
from pathlib import Path

from flask import Blueprint, send_from_directory
from openlp.core.common.applocation import AppLocation
from openlp.core.common.mime import get_mime_type

log = logging.getLogger(__name__)

# The static directory sits alongside this file: api/../static/
_STATIC_DIR = Path(__file__).parent.parent / 'static'

blueprint = Blueprint('piano', __name__)


@blueprint.route('/piano', strict_slashes=False)
@blueprint.route('/piano/', strict_slashes=False)
def index():
    """
    Serve the piano stage page.

    :return: stage.html from the plugin's static directory.
    :rtype: flask.Response
    """
    return send_from_directory(str(_STATIC_DIR), 'stage.html', mimetype='text/html')


@blueprint.route('/piano/static/<path:path>')
def static_files(path):
    """
    Serve static assets for the piano stage page (JS, CSS, libraries).

    :param path: Relative path to the file within the static directory.
    :type path: str
    :return: The requested static file.
    :rtype: flask.Response
    """
    return send_from_directory(str(_STATIC_DIR), path, mimetype=get_mime_type(path))


@blueprint.route('/piano/files/<path:path>')
def data_files(path):
    """
    Serve MusicXML and PDF files from the piano data directory.

    The data directory is resolved via AppLocation.get_section_data_path(),
    which returns the platform-correct path and creates the directory if it
    does not yet exist:

      Windows : %APPDATA%\\openlp\\data\\piano\\
      macOS   : ~/Library/Application Support/openlp/Data/piano/
      Linux   : ~/.local/share/openlp/piano/

    :param path: Relative path to the file within the piano data directory.
    :type path: str
    :return: The requested MusicXML or PDF file.
    :rtype: flask.Response
    """
    data_dir = AppLocation.get_section_data_path('piano')
    return send_from_directory(str(data_dir), path, mimetype=get_mime_type(path))
