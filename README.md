# climate-impact-map

Fast, global temperature map for exploring where to live under future climate scenarios.

## Features

- Global impact-region map (~24,000 regions) with lazy-loaded data tiles
- Temperature metrics: summer (JJA), winter (DJF), and annual averages
- Absolute and change-from-historical views across SSP scenarios
- Fahrenheit/Celsius toggle, shareable URLs, CSV export
- Compare up to 3 regions and rank locations by temperature threshold

## Local development

```bash
npm install
pip install -r scripts/requirements.txt
pip install tippecanoe
npm run build:data
npm run dev
```

## Deployment

Pushes to `main` build data artifacts, compile the app, and deploy to GitHub Pages via GitHub Actions.

## Data

Temperature data is derived from the [Climate Impact Lab Impact Map](https://impactlab.org/map/) (CC BY 4.0). The build pipeline downloads public CIL datasets during CI and compacts them into per-filter binary tiles (~286 KB each) plus `regions.pmtiles` for geometry.
