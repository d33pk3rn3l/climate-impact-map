#!/usr/bin/env python3
"""Download CIL global impact-region data, geometries, and color palettes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin

import requests

BASE = "https://impactlab.org/wp-content/themes/climate-impact-lab/build/datasets/"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
MANIFEST_PATH = RAW_DIR / "fetch_manifest.json"

CLIMATE_METRICS = [
    "tas-JJA",
    "tas-DJF",
    "tas-annual",
    "tasmin-under-32F",
    "tasmax-over-95F",
]
DAMAGE_METRICS = ["mortality", "energy"]
SSP_SCENARIOS = ["ssp245", "ssp370", "ssp585"]
RCP_SCENARIOS = ["rcp45", "rcp85"]
PERIODS = ["1986-2005", "2020-2039", "2040-2059", "2080-2099"]
DAMAGE_PERIODS = ["2020-2039", "2040-2059", "2080-2099"]
MEASURES = ["absolute", "change-from-hist"]

UNIT_SUFFIX = {
    "tas-JJA": "degF",
    "tas-DJF": "degF",
    "tas-annual": "degF",
    "tasmin-under-32F": "days-under-32F",
    "tasmax-over-95F": "days-over-95F",
    "mortality": "percent",
    "energy": "percent",
}


def unit_for(metric: str) -> str:
    return UNIT_SUFFIX[metric]


def climate_csv_url(metric: str, scenario: str, period: str, measure: str) -> str:
    unit = unit_for(metric)
    filename = (
        f"global_hierid_{metric}_{scenario}_{period}_{measure}_{unit}_percentiles.csv"
    )
    return urljoin(BASE, f"global_data/v1.3/{filename}")


def damage_csv_url(metric: str, scenario: str, period: str) -> str:
    filename = f"global_hierid_{metric}_{scenario}_{period}_change-from-hist_percent.csv"
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
                    rel = (
                        f"csv/climate/{metric}/{scenario}/{period}/{measure}.csv"
                    )
                    urls.append(
                        (climate_csv_url(metric, scenario, period, measure), rel)
                    )
                    palette_rel = f"palettes/{metric}_{measure}.json"
                    urls.append((palette_url(metric, measure), palette_rel))

    for metric in DAMAGE_METRICS:
        for scenario in RCP_SCENARIOS:
            for period in DAMAGE_PERIODS:
                rel = f"csv/damages/{metric}/{scenario}/{period}.csv"
                urls.append((damage_csv_url(metric, scenario, period), rel))

    for metric in DAMAGE_METRICS:
        urls.append((palette_url(metric, "change-from-hist"), f"palettes/{metric}_change-from-hist.json"))

    # Deduplicate palette URLs while preserving first rel path
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


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    dest.write_bytes(response.content)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    entries = []
    for url, rel in all_urls():
        dest = RAW_DIR / rel
        print(f"Fetching {rel}")
        download(url, dest)
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
