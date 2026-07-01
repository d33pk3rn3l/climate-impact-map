#!/usr/bin/env python3
"""Normalize downloaded CIL CSVs into compact runtime artifacts."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "public" / "data"
EXCEL_PATH = ROOT / "data" / "source" / "ClimateImpactLab_GlobalData_20March2023.xlsx"

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

METRIC_LABELS = {
    "tas-JJA": "Average Jun/Jul/Aug Temps",
    "tas-DJF": "Average Dec/Jan/Feb Temps",
    "tas-annual": "Average Annual Temps",
    "tasmin-under-32F": "Days < 32°F / 0°C",
    "tasmax-over-95F": "Days > 95°F / 35°C",
    "mortality": "Mortality costs",
    "energy": "Energy costs",
}

SCENARIO_LABELS = {
    "ssp245": "Moderate emissions (SSP2-4.5)",
    "ssp370": "Medium-High emissions (SSP3-7.0)",
    "ssp585": "High emissions (SSP5-8.5)",
    "rcp45": "Moderate emissions (RCP 4.5)",
    "rcp85": "High emissions (RCP 8.5)",
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

TEMP_METRICS = {"tas-JJA", "tas-DJF", "tas-annual"}


def f_to_c(value: float) -> float:
    return (value - 32.0) * 5.0 / 9.0


def read_climate_csv(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    frame = frame.rename(columns={"hierid": "region_id", "0.05": "q05", "0.5": "q50", "0.95": "q95"})
    return frame[["region_id", "q05", "q50", "q95"]]


def read_damage_csv(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    frame = frame.rename(columns={"hierid": "region_id", "0.5": "q50"})
    frame["q05"] = frame["q50"]
    frame["q95"] = frame["q50"]
    return frame[["region_id", "q05", "q50", "q95"]]


def add_celsius_columns(frame: pd.DataFrame, metric: str) -> pd.DataFrame:
    if metric not in TEMP_METRICS:
        return frame
    for col in ("q05", "q50", "q95"):
        frame[f"{col}_c"] = frame[col].map(f_to_c)
    return frame


def load_region_names(topo_path: Path) -> dict[str, dict[str, str]]:
    topo = json.loads(topo_path.read_text())
    geometries = topo["objects"]["new_shapefile"]["geometries"]
    mapping: dict[str, dict[str, str]] = {}
    for geometry in geometries:
        props = geometry.get("properties", {})
        hierid = props.get("hierid")
        if not hierid:
            continue
        mapping[hierid] = {
            "iso": props.get("ISO", ""),
            "name": hierid,
        }
    return mapping


def validate_excel_sample() -> dict:
    if not EXCEL_PATH.exists():
        return {"validated": False, "reason": "excel_missing"}
    sample = pd.read_excel(EXCEL_PATH, sheet_name="tas_JJA_ssp2-45", skiprows=2, nrows=5)
    return {
        "validated": True,
        "sample_rows": len(sample),
        "columns": list(sample.columns)[:6],
    }


def build_values_table() -> pd.DataFrame:
    rows: list[dict] = []

    for metric in CLIMATE_METRICS:
        for scenario in SSP_SCENARIOS:
            for period in PERIODS:
                for measure in MEASURES:
                    path = RAW_DIR / "csv" / "climate" / metric / scenario / period / f"{measure}.csv"
                    if not path.exists():
                        raise FileNotFoundError(path)
                    frame = read_climate_csv(path)
                    frame = add_celsius_columns(frame, metric)
                    for record in frame.to_dict("records"):
                        row = {
                            "region_id": record["region_id"],
                            "metric": metric,
                            "scenario": scenario,
                            "period": period,
                            "measure": measure,
                            "q05": record["q05"],
                            "q50": record["q50"],
                            "q95": record["q95"],
                        }
                        if metric in TEMP_METRICS:
                            row["q05_c"] = record["q05_c"]
                            row["q50_c"] = record["q50_c"]
                            row["q95_c"] = record["q95_c"]
                        rows.append(row)

    for metric in DAMAGE_METRICS:
        for scenario in RCP_SCENARIOS:
            for period in DAMAGE_PERIODS:
                path = RAW_DIR / "csv" / "damages" / metric / scenario / period / ".csv"
                path = RAW_DIR / "csv" / "damages" / metric / scenario / f"{period}.csv"
                if not path.exists():
                    raise FileNotFoundError(path)
                frame = read_damage_csv(path)
                for record in frame.to_dict("records"):
                    rows.append(
                        {
                            "region_id": record["region_id"],
                            "metric": metric,
                            "scenario": scenario,
                            "period": period,
                            "measure": "change-from-hist",
                            "q05": record["q05"],
                            "q50": record["q50"],
                            "q95": record["q95"],
                        }
                    )

    return pd.DataFrame(rows)



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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    values = build_values_table()
    for column in ("region_id", "metric", "scenario", "period", "measure"):
        values[column] = values[column].astype("category")
    table = pa.Table.from_pandas(values, preserve_index=False)
    pq.write_table(
        table,
        OUT_DIR / "values.parquet",
        compression="zstd",
        compression_level=15,
        use_dictionary=True,
    )

    region_ids = sorted(values["region_id"].unique())
    (OUT_DIR / "regions.json").write_text(json.dumps(region_ids))

    region_meta = load_region_names(RAW_DIR / "topo" / "global-regional.json")
    manifest = {
        "version": 1,
        "metrics": [
            {
                "id": metric,
                "label": METRIC_LABELS[metric],
                "kind": "damage" if metric in DAMAGE_METRICS else "climate",
                "scenarios": RCP_SCENARIOS if metric in DAMAGE_METRICS else SSP_SCENARIOS,
                "periods": DAMAGE_PERIODS if metric in DAMAGE_METRICS else PERIODS,
                "measures": ["change-from-hist"] if metric in DAMAGE_METRICS else MEASURES,
            }
            for metric in CLIMATE_METRICS + DAMAGE_METRICS
        ],
        "scenario_labels": SCENARIO_LABELS,
        "period_labels": PERIOD_LABELS,
        "measure_labels": MEASURE_LABELS,
        "palettes": load_palettes(),
        "region_count": len(region_ids),
        "region_meta": region_meta,
        "excel_validation": validate_excel_sample(),
        "attribution": {
            "source": "Climate Impact Lab",
            "license": "CC BY 4.0",
            "url": "https://impactlab.org/map/",
        },
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote values.parquet ({len(values):,} rows), regions.json, manifest.json")


if __name__ == "__main__":
    main()
