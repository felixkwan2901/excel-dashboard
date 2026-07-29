# Cassidy-Davies Electrical — Operations Dashboard

A dashboard for tracking active jobs and BPMN swimlane workflow status,
built with React + Vite. Data is read directly from
`Cassidy_Davies_Electrical_BPMN_Data.xlsx` in the repo root — no backend,
no database.

Installable as a PWA, so it can be added to a phone's home screen and used
like a native app.

## Updating the data

Replace `Cassidy_Davies_Electrical_BPMN_Data.xlsx` at the repo root with an
updated workbook (same sheet names: `Job Directory`, `Swimlane Reference`),
commit, and push. The next deploy will pick up the new data automatically.

## Development

```bash
npm install
npm run dev
```

## Deploying to GitHub Pages

```bash
npm run deploy
```

This builds the app and pushes `dist/` to the `gh-pages` branch. The live
site is served from GitHub Pages settings on that branch.
