import re
from functools import lru_cache
from pathlib import Path

_REGION_ATTR_RE = re.compile(r'data-region="([A-Z]{2}(?::[A-Z0-9]{1,3})?)"')
_PARTIALS_DIR = Path(__file__).parent / "templates" / "maps" / "partials"
_WORLD_SVG_PATH = _PARTIALS_DIR / "world.svg"
_SUBDIVISIONS_DIR = _PARTIALS_DIR / "subdivisions"


@lru_cache(maxsize=1)
def valid_region_ids():
    """Allowlist of region ids, sourced directly from the map SVGs'
    data-region attributes so it can't drift out of sync with the map —
    world.svg for top-level countries, plus every *.svg under
    partials/subdivisions/ for COUNTRY:SUBREGION ids (SP-13.2)."""
    texts = [_WORLD_SVG_PATH.read_text()]
    if _SUBDIVISIONS_DIR.is_dir():
        texts += [p.read_text() for p in _SUBDIVISIONS_DIR.glob("*.svg")]
    ids = set()
    for text in texts:
        ids.update(_REGION_ATTR_RE.findall(text))
    return frozenset(ids)


def has_subdivisions(code):
    """True if `code` is a country with its own drill-down regions (e.g.
    "IT"). Such a country's visited state is derived client-side from its
    regions rather than stored directly, so it should never be toggled on
    its own — used to reject that at the API boundary too."""
    prefix = f"{code}:"
    return any(region_id.startswith(prefix) for region_id in valid_region_ids())


@lru_cache(maxsize=1)
def _subdivision_svg_paths():
    """Country code -> subdivision SVG file path, built once from the same
    directory valid_region_ids() globs. The view that serves this content
    (SP-13.3) only ever looks up an exact key here — never concatenates
    request input into a filesystem path."""
    if not _SUBDIVISIONS_DIR.is_dir():
        return {}
    return {p.stem.upper(): p for p in _SUBDIVISIONS_DIR.glob("*.svg")}


def subdivision_svg_path(code):
    return _subdivision_svg_paths().get(code)
