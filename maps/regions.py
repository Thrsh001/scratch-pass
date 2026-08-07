import re
from functools import lru_cache
from pathlib import Path

_REGION_ATTR_RE = re.compile(r'data-region="([A-Z]{2})"')
_WORLD_SVG_PATH = Path(__file__).parent / "templates" / "maps" / "partials" / "world.svg"


@lru_cache(maxsize=1)
def valid_region_ids():
    """Allowlist of region ids, sourced directly from the map SVG's
    data-region attributes so it can't drift out of sync with the map
    (SP-13 will add more entries here automatically when it adds paths)."""
    text = _WORLD_SVG_PATH.read_text()
    return frozenset(_REGION_ATTR_RE.findall(text))
