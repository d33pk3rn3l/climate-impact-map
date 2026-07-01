#!/usr/bin/env python3
"""Download CIL global temperature data, geometries, and color palettes."""

from __future__ import annotations

import hashlib
import json
import shutil
import time
from pathlib import Path
from urllib.parse import urljoin

import requests

BASE = "https://impactlab.org/wp-content/themes/climate-impact-lab/build/datasets/"
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
VENDOR_DIR = ROOT / "data" / "vendor"
MANIFEST_PATH = RAW_DIR / "fetch_manifest.json"

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "climate-impact-map/1.0 (+https://github.com/d33pk3rn3l/climate-impact-map)",
        "Accept": "application/json, text/csv, text/plain, */*",
    }
)

CLIMATE_METRICS = ["tas-JJA", "tas-DJF", "tas-annual"]
SSP_SCENARIOS = ["ssp245", "ssp370", "ssp585"]
PERIODS = ["1986-2005", "2020-2039", "2040-2059", "2080-2099"]
MEASURES = ["absolute", "change-from-hist"]

UNIT_SUFFIX = {
    "tas-JJA": "degF",
    "tas-DJF": "degF",
    "tas-annual": "degF",
}

VENDORED_ASSETS = {
    "topo/global-regional.json": VENDOR_DIR / "global-regional.json",
}


def unit_for(metric: str) -> str:
    return UNIT_SUFFIX[metric]


def climate_csv_url(metric: str, scenario: str, period: str, measure: str) -> str:
    unit = unit_for(metric)
    filename = (
        f"global_hierid_{metric}_{scenario}_{period}_{measure}_{unit}_percentiles.csv"
    )
    return urljoin(BASE, f"global_data/v1.3/{filename}")


def palette_url(metric: str, measure: str) -> str:
    filename = f"{metric}_{measure}.json"
    return urljoin(BASE, f"global_data/v1.3/{filename}")


def static_assets() -> list[tuple[str, str]]:
    return [
        (urljoin(BASE, "topo/global-regional.json"), "topo/global-regional.json"),
    ]


def all_urls() -> list[tuple[str, str]]:
    urls: list[tuple[str, str]] = []
    urls.extend(static_assets())

    for metric in CLIMATE_METRICS:
        for scenario in SSP_SCENARIOS:
            for period in PERIODS:
                for measure in MEASURES:
                    rel = f"csv/climate/{metric}/{scenario}/{period}/{measure}.csv"
                    urls.append((climate_csv_url(metric, scenario, period, measure), rel))
                    palette_rel = f"palettes/{metric}_{measure}.json"
                    urls.append((palette_url(metric, measure), palette_rel))

    seen: set[str] = set()
    deduped: list[tuple[str, str]] = []
    for url, rel in urls:
        if url in seen:
            continue
        seen.add(url)
        deduped.append((url, rel))
    return deduped


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {"entries": []}
    return json.loads(MANIFEST_PATH.read_text())


def manifest_sha_for(url: str, rel: str, manifest: dict) -> str | None:
    for entry in manifest.get("entries", []):
        if entry.get("url") == url and entry.get("path") == rel:
            return entry.get("sha256")
    return None


def looks_valid(path: Path, rel: str) -> bool:
    if not path.exists():
        return False
    size = path.stat().st_size
    if size < 32:
        return False
    if rel.endswith(".json"):
        with path.open("rb") as handle:
            return handle.read(1) == b"{"
    if rel.endswith(".csv"):
        with path.open("rb") as handle:
            sample = handle.read(64)
        return b"," in sample or b"hierid" in sample
    return size > 0


def copy_vendored(rel: str, dest: Path) -> bool:
    source = VENDORED_ASSETS.get(rel)
    if source is None or not source.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    print(f"Using vendored fallback for {rel}")
    return True


def download(url: str, dest: Path, rel: str, expected_sha: str | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)

    if looks_valid(dest, rel):
        if expected_sha is None or sha256_file(dest) == expected_sha:
            print(f"Skipping {rel} (already present)")
            return

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = SESSION.get(url, timeout=120)
            response.raise_for_status()
            dest.write_bytes(response.content)
            if not looks_valid(dest, rel):
                raise ValueError(f"Downloaded file failed validation: {rel}")
            return
        except Exception as error:  # noqa: BLE001 - retry on all fetch failures
            last_error = error
            if attempt < 3:
                delay = 2**attempt
                print(f"Retrying {rel} in {delay}s ({error})")
                time.sleep(delay)

    if copy_vendored(rel, dest):
        return

    raise RuntimeError(f"Failed to download {rel} from {url}") from last_error


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    entries = []

    for url, rel in all_urls():
        dest = RAW_DIR / rel
        print(f"Fetching {rel}")
        expected_sha = manifest_sha_for(url, rel, manifest)
        download(url, dest, rel, expected_sha)
        entries.append(
            {
                "url": url,
                "path": rel,
                "bytes": dest.stat().st_size,
                "sha256": sha256_file(dest),
            }
        )

    MANIFEST_PATH.write_text(json.dumps({"entries": entries}, indent=2))
    print(f"Downloaded {len(entries)} files into {RAW_DIR}")


if __name__ == "__main__":
    main()
