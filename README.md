# climate-impact-map

Fast, global climate impact visualizer built for GitHub Pages.

## Features

- Global impact-region map (~24,000 regions) with instant filter updates
- Climate metrics: seasonal/annual temperatures and extreme day counts
- Damage metrics: mortality and energy costs
- Absolute and change-from-historical views
- Fahrenheit/Celsius toggle, shareable URLs, CSV export
- Compare up to 3 regions and rank locations by threshold

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

Climate and damage data are derived from the [Climate Impact Lab Impact Map](https://impactlab.org/map/) (CC BY 4.0). The build pipeline downloads public CIL datasets during CI and compacts them into `values.parquet` and `regions.pmtiles`.
