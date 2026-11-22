"""Offline, developer-run import of region descriptions (SP-18.1).

Maps every region id in the map SVGs to a Wikidata item by ISO code
(P297 for countries, P300 for subdivisions), follows the item's English
Wikipedia sitelink, and stores the article's REST summary extract as
committed static JSON. The app never calls Wikipedia at runtime.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from maps.regions import region_names, valid_region_ids

SPARQL_URL = "https://query.wikidata.org/sparql"
SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/"
ENWIKI_PREFIX = "https://en.wikipedia.org/wiki/"
# Wikimedia's API etiquette asks for an identifying User-Agent.
USER_AGENT = (
    "ScratchPass-description-import/1.0 "
    "(https://github.com/Thrsh001/scratch-pass) Python-urllib"
)

OVERRIDES_PATH = Path(settings.BASE_DIR) / "maps" / "data" / "description_overrides.json"
OUTPUT_DIR = Path(settings.BASE_DIR) / "static" / "data" / "descriptions"

ENTRY_FIELDS = ("name", "extract", "source_url")

# wdt: only returns best-rank statements, so deprecated codes are already
# excluded; P576 ("dissolved") drops historic entities that kept a code.
_SPARQL_TEMPLATE = """
SELECT ?code ?item ?article ?links WHERE {{
  ?item wdt:{prop} ?code .
  {code_filter}
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
  ?item wikibase:sitelinks ?links .
  FILTER NOT EXISTS {{ ?item wdt:P576 ?dissolved }}
}}
"""


def http_get_json(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def region_id_to_iso(region_id):
    """"IT" -> "IT", "FR:ARA" -> "FR-ARA" (ISO 3166-2 uses a hyphen)."""
    return region_id.replace(":", "-")


def iso_to_region_id(code):
    return code.replace("-", ":", 1)


def article_title(article_url):
    """enwiki article URL -> page title, or None if it isn't one."""
    if not article_url.startswith(ENWIKI_PREFIX):
        return None
    return urllib.parse.unquote(article_url[len(ENWIKI_PREFIX):])


def build_sparql(prop, country_prefixes=()):
    code_filter = ""
    if country_prefixes:
        quoted = ", ".join(f'"{cc}-"' for cc in sorted(country_prefixes))
        code_filter = f"FILTER(SUBSTR(?code, 1, 3) IN ({quoted}))"
    return _SPARQL_TEMPLATE.format(prop=prop, code_filter=code_filter)


def pick_matches(bindings, wanted_ids):
    """SPARQL result rows -> ({region_id: (qid, title)}, {region_id: [rejected qids]}).

    Several current items can share an ISO code (e.g. a region and its
    eponymous administrative entity); the one with the most sitelinks is
    the one readers know, so it wins and the rest are reported."""
    candidates = {}
    for row in bindings:
        region_id = iso_to_region_id(row["code"]["value"].strip().upper())
        if region_id not in wanted_ids:
            continue
        title = article_title(row["article"]["value"])
        if title is None:
            continue
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        links = int(row["links"]["value"])
        candidates.setdefault(region_id, {})[qid] = (links, title)

    matches, rejected = {}, {}
    for region_id, items in candidates.items():
        # qid as tie-break keeps the choice deterministic between runs.
        ranked = sorted(items.items(), key=lambda kv: (-kv[1][0], kv[0]))
        qid, (_, title) = ranked[0]
        matches[region_id] = (qid, title)
        if len(ranked) > 1:
            rejected[region_id] = [other for other, _ in ranked[1:]]
    return matches, rejected


def query_wikidata(region_ids, get_json=http_get_json):
    countries = {r for r in region_ids if ":" not in r}
    subdivisions = {r for r in region_ids if ":" in r}
    matches, rejected = {}, {}
    queries = []
    if countries:
        queries.append((build_sparql("P297"), countries))
    if subdivisions:
        prefixes = {r.split(":", 1)[0] for r in subdivisions}
        queries.append((build_sparql("P300", prefixes), subdivisions))
    for sparql, wanted in queries:
        url = SPARQL_URL + "?" + urllib.parse.urlencode(
            {"query": sparql, "format": "json"}
        )
        data = get_json(url)
        found, dupes = pick_matches(data["results"]["bindings"], wanted)
        matches.update(found)
        rejected.update(dupes)
    return matches, rejected


def fetch_summary(title, get_json=http_get_json):
    """Wikipedia REST summary -> (extract, canonical page URL), or None for
    disambiguation pages and empty extracts."""
    url = SUMMARY_URL + urllib.parse.quote(title.replace(" ", "_"), safe="")
    data = get_json(url)
    if data.get("type") == "disambiguation":
        return None
    extract = (data.get("extract") or "").strip()
    if not extract:
        return None
    page_url = (
        data.get("content_urls", {}).get("desktop", {}).get("page")
        or ENWIKI_PREFIX + urllib.parse.quote(title.replace(" ", "_"))
    )
    return extract, page_url


def load_overrides(path=OVERRIDES_PATH):
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def build_entries(region_ids, names, overrides, get_json=None, delay=0.0, log=print):
    """Returns ({region_id: entry}, report) where report lists what couldn't
    be matched or fetched, plus ISO codes shared by several items."""
    get_json = get_json or http_get_json
    report = {"unmatched": [], "fetch_failed": [], "ambiguous": {}}
    # An extract-only override still looks the id up, for its source URL.
    needs_lookup = [r for r in region_ids if "wikipedia_title" not in overrides.get(r, {})]
    matches, ambiguous = query_wikidata(needs_lookup, get_json) if needs_lookup else ({}, {})
    report["ambiguous"] = ambiguous

    entries = {}
    for region_id in sorted(region_ids):
        override = overrides.get(region_id, {})
        entry = {"name": names.get(region_id, region_id)}
        title = override.get("wikipedia_title") or (
            matches[region_id][1] if region_id in matches else None
        )
        if "extract" not in override:
            if title is None:
                report["unmatched"].append(region_id)
                continue
            try:
                summary = fetch_summary(title, get_json)
            except (urllib.error.URLError, OSError, ValueError) as exc:
                log(f"  {region_id}: fetching {title!r} failed: {exc}")
                summary = None
            if delay:
                time.sleep(delay)
            if summary is None:
                report["fetch_failed"].append(region_id)
                continue
            entry["extract"], entry["source_url"] = summary
        elif title:
            entry["source_url"] = ENWIKI_PREFIX + urllib.parse.quote(title.replace(" ", "_"))
        entry.update({k: v for k, v in override.items() if k in ENTRY_FIELDS})
        if "extract" not in entry or "source_url" not in entry:
            report["unmatched"].append(region_id)
            continue
        entries[region_id] = {k: entry[k] for k in ENTRY_FIELDS}
    return entries, report


def group_by_country(entries):
    grouped = {}
    for region_id, entry in entries.items():
        grouped.setdefault(region_id.split(":", 1)[0], {})[region_id] = entry
    return grouped


def write_country_files(entries, out_dir=None):
    out_dir = out_dir or OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for country, country_entries in sorted(group_by_country(entries).items()):
        path = out_dir / f"{country}.json"
        path.write_text(
            json.dumps(country_entries, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        written.append(path)
    return written


class Command(BaseCommand):
    help = (
        "Fetch short English Wikipedia descriptions for every map region "
        "(via Wikidata ISO codes) into static/data/descriptions/<CC>.json."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--only", nargs="+", metavar="CC",
            help="Limit to these country codes (each with its subdivisions).",
        )
        parser.add_argument(
            "--delay", type=float, default=0.1,
            help="Seconds to wait between Wikipedia requests (default 0.1).",
        )

    def handle(self, *args, only=None, delay=0.1, **options):
        region_ids = set(valid_region_ids())
        if only:
            countries = {cc.upper() for cc in only}
            unknown = countries - region_ids
            if unknown:
                raise CommandError(f"Unknown country code(s): {', '.join(sorted(unknown))}")
            region_ids = {r for r in region_ids if r.split(":", 1)[0] in countries}

        overrides = load_overrides()
        stale = sorted(set(overrides) - set(valid_region_ids()))
        if stale:
            self.stderr.write(f"Overrides for ids not on the map (ignored): {', '.join(stale)}")

        self.stdout.write(f"Fetching descriptions for {len(region_ids)} regions...")
        entries, report = build_entries(
            region_ids, region_names(), overrides,
            delay=delay, log=self.stderr.write,
        )
        written = write_country_files(entries)

        countries_total = sum(1 for r in region_ids if ":" not in r)
        countries_done = sum(1 for r in entries if ":" not in r)
        subs_total = len(region_ids) - countries_total
        subs_done = len(entries) - countries_done
        self.stdout.write(self.style.SUCCESS(
            f"Wrote {len(written)} files: countries {countries_done}/{countries_total}, "
            f"subdivisions {subs_done}/{subs_total}."
        ))
        for region_id, qids in sorted(report["ambiguous"].items()):
            self.stdout.write(f"  {region_id}: other current items with this code ignored: {', '.join(qids)}")
        if report["unmatched"]:
            self.stdout.write(self.style.WARNING(
                "No Wikidata match (add to description_overrides.json): "
                + ", ".join(report["unmatched"])
            ))
        if report["fetch_failed"]:
            self.stdout.write(self.style.WARNING(
                "Summary missing or failed (re-run, or override): "
                + ", ".join(report["fetch_failed"])
            ))
