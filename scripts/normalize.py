#!/usr/bin/env python3
"""Normalize downloaded CIL temperature CSVs into compact per-combo binary tiles."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "public" / "data"
VALUES_DIR = OUT_DIR / "values"

CLIMATE_METRICS = ["tas-JJA", "tas-DJF", "tas-annual"]
SSP_SCENARIOS = ["ssp245", "ssp370", "ssp585"]
PERIODS = ["1986-2005", "2020-2039", "2040-2059", "2080-2099"]
MEASURES = ["absolute", "change-from-hist"]

METRIC_LABELS = {
    "tas-JJA": "Average Jun/Jul/Aug Temps",
    "tas-DJF": "Average Dec/Jan/Feb Temps",
    "tas-annual": "Average Annual Temps",
}

SCENARIO_LABELS = {
    "ssp245": "Moderate emissions (SSP2-4.5)",
    "ssp370": "Medium-High emissions (SSP3-7.0)",
    "ssp585": "High emissions (SSP5-8.5)",
}

PERIOD_LABELS = {
    "1986-2005": "Historical 1986-2005",
    "2020-2039": "Next 20 Years 2020-2039",
    "2040-2059": "Mid-Century 2040-2059",
    "2080-2099": "End of Century 2080-2099",
}

MEASURE_LABELS = {
    "absolute": "Absolute Level",
    "change-from-hist": "Change From Historical",
}


def combo_key(metric: str, scenario: str, period: str, measure: str) -> str:
    return f"{metric}|{scenario}|{period}|{measure}"


def combo_filename(metric: str, scenario: str, period: str, measure: str) -> str:
    return f"{metric}_{scenario}_{period}_{measure}.bin"


def read_climate_csv(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    frame = frame.rename(columns={"hierid": "region_id", "0.05": "q05", "0.5": "q50", "0.95": "q95"})
    return frame[["region_id", "q05", "q50", "q95"]]


def load_palettes() -> dict:
    palettes: dict[str, dict] = {}
    palette_dir = RAW_DIR / "palettes"
    for path in palette_dir.glob("*.json"):
        payload = json.loads(path.read_text())
        key = path.stem
        palettes[key] = {
            "bins": payload.get("bins", []),
            "color_palette": payload.get("color_palette", []),
        }
    return palettes


def write_combo_bin(path: Path, region_ids: list[str], frame: pd.DataFrame) -> int:
    lookup = frame.set_index("region_id")
    values: list[float] = []
    for region_id in region_ids:
        if region_id not in lookup.index:
            values.extend([float("nan"), float("nan"), float("nan")])
            continue
        row = lookup.loc[region_id]
        values.extend([float(row["q05"]), float(row["q50"]), float(row["q95"])])

    packed = struct.pack(f"<{len(values)}f", *values)
    path.write_bytes(packed)
    return len(packed)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    VALUES_DIR.mkdir(parents=True, exist_ok=True)

    region_ids: list[str] = []
    combos: dict[str, str] = {}
    total_bytes = 0

    for metric in CLIMATE_METRICS:
        for scenario in SSP_SCENARIOS:
            for period in PERIODS:
                for measure in MEASURES:
                    csv_path = RAW_DIR / "csv" / "climate" / metric / scenario / period / f"{measure}.csv"
                    if not csv_path.exists():
                        raise FileNotFoundError(csv_path)

                    frame = read_climate_csv(csv_path)
                    if not region_ids:
                        region_ids = sorted(frame["region_id"].astype(str).unique())

                    key = combo_key(metric, scenario, period, measure)
                    rel_path = f"values/{combo_filename(metric, scenario, period, measure)}"
                    out_path = OUT_DIR / rel_path
                    total_bytes += write_combo_bin(out_path, region_ids, frame)
                    combos[key] = rel_path

    (OUT_DIR / "regions.json").write_text(json.dumps(region_ids))

    manifest = {
        "version": 2,
        "format": "f32-q3",
        "region_count": len(region_ids),
        "metrics": [
            {
                "id": metric,
                "label": METRIC_LABELS[metric],
                "kind": "climate",
                "scenarios": SSP_SCENARIOS,
                "periods": PERIODS,
                "measures": MEASURES,
            }
            for metric in CLIMATE_METRICS
        ],
        "scenario_labels": SCENARIO_LABELS,
        "period_labels": PERIOD_LABELS,
        "measure_labels": MEASURE_LABELS,
        "palettes": load_palettes(),
        "combos": combos,
        "attribution": {
            "source": "Climate Impact Lab",
            "license": "CC BY 4.0",
            "url": "https://impactlab.org/map/",
        },
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))

    legacy_parquet = OUT_DIR / "values.parquet"
    if legacy_parquet.exists():
        legacy_parquet.unlink()

    print(
        f"Wrote {len(combos)} combo bins ({total_bytes / 1024 / 1024:.1f} MB total), "
        f"regions.json ({len(region_ids):,} regions), manifest.json"
    )


if __name__ == "__main__":
    main()
