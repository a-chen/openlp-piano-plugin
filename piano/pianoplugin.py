"""
The :mod:`~contrib.plugins.piano.pianoplugin` module contains the
Plugin class for the Piano plugin.
"""
import logging

from openlp.core.state import State
from openlp.core.common.enum import PluginStatus
from openlp.core.common.i18n import translate
from openlp.core.common.settings import Settings
from openlp.core.lib.plugin import Plugin, StringContent

log = logging.getLogger(__name__)


class PianoPlugin(Plugin):
    """
    This plugin serves a web-based sheet music viewer at /piano/ via the
    OpenLP remote interface. When a song goes live, the viewer automatically
    loads the matching MusicXML or PDF file from the piano data directory.
    Falls back to the built-in /chords view when no sheet music is available.

    Note: the class is named PianoPlugin so that OpenLP's de_hump() registry
    key is 'piano_plugin', matching the plugin name 'piano' used in
    State().add_service().
    """
    log.info('PianoPlugin loaded')

    def __init__(self):
        super().__init__('piano')
        self.weight = -1

        # Register the default setting for this plugin's status so that
        # Settings.value('piano/status') does not raise a KeyError.
        Settings.extend_default_settings({'piano/status': PluginStatus.Active})

        # Register the Flask blueprint before the HTTP server thread starts.
        # Plugin.__init__ runs during PluginManager.bootstrap_initialise(),
        # which is before HttpServer.bootstrap_post_set_up() launches Waitress.
        # Flask allows blueprint registration at any point before the first
        # request, so this is safe.
        #
        # Note: this imports from openlp.core.api directly, which is an
        # internal (not public) API. If OpenLP restructures its API module
        # this import path may need updating.
        try:
            from openlp.core.api import app as flask_app
            from contrib.plugins.piano.api import blueprint
            flask_app.register_blueprint(blueprint)
            log.info('Piano blueprint registered at /piano/')
        except Exception:
            log.exception('Failed to register Piano blueprint — the /piano/ '
                          'endpoint will not be available')

        State().add_service(self.name, self.weight, is_plugin=True)
        State().update_pre_conditions(self.name, self.check_pre_conditions())

    @staticmethod
    def about():
        return translate(
            'PianoPlugin',
            '<strong>Piano Plugin</strong><br />'
            'Displays piano sheet music (MusicXML or PDF) on musician tablets '
            'via the OpenLP remote interface. When a song goes live the matching '
            'sheet music is automatically loaded. Falls back to the chord view '
            'when no sheet music is available for the current song.'
        )

    def check_pre_conditions(self):
        return True

    def set_plugin_text_strings(self):
        self.text_strings[StringContent.Name] = {
            'singular': translate('PianoPlugin', 'Piano', 'name singular'),
            'plural': translate('PianoPlugin', 'Piano', 'name plural'),
        }
        self.text_strings[StringContent.VisibleName] = {
            'title': translate('PianoPlugin', 'Piano', 'container title'),
        }
