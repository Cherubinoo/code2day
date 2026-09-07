"""apps/learning/views is a package mirroring the frontend's per-role
component folders (student/, staff/, hod/, ja/, admin/) plus common.py for
genuinely cross-role views. Every name from every submodule is re-exported
here so `from .views import AnyViewClass` (as urls.py already does) keeps
working completely unchanged."""
from ._shared import *  # noqa: F401,F403
from .admin import *  # noqa: F401,F403
from .hod import *  # noqa: F401,F403
from .ja import *  # noqa: F401,F403
from .staff import *  # noqa: F401,F403
from .student import *  # noqa: F401,F403
from .common import *  # noqa: F401,F403
