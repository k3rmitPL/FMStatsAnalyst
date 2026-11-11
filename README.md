# FM Stats Analyst

A scouting table for Football Manager player exports. Load a CSV exported from your save, build
your own ratings from the stats that matter to you, filter players by position and compare them
side by side.

Everything runs in the browser: datasets, metrics and views are stored locally (IndexedDB) and
nothing is uploaded anywhere.

## Features

- **Load your data** - import CSV exports of Football Manager player views. Units, currencies and
  dates are converted automatically.
- **Custom metrics** - combine columns with a drag-and-drop formula editor, scale results to 0-100
  and colour cells from red to green. Metrics can be organised in groups.
- **Views** - choose, order and freeze columns, filter by positions on a pitch and by conditions,
  set a default sort and save the layout as a named view.
- **Share** - export and import metrics and views as JSON files.
- **Demo** - load sample players, metrics and a view from the home page to try it out.
- **Installable** - install it as a standalone app (Install app button in Chrome and Edge, or
  Add to Dock / Add to Home Screen in Safari). After the first visit it works offline.

## Getting your data out of Football Manager

1. Import [`Full Export View.fmf`](public/data/Full%20Export%20View.fmf) in Football Manager. It
   includes most player stats.
2. Export the players shown in that view to a CSV file with
   [FM View Exporter](https://github.com/ElectroHugin/FM-View-Exporter). Set
   `ScanColumns = true` in the plugin's config.
3. Load the CSV file on the **Analyse** page.

## Development

Requires Node.js 22.18+ (or 24.12+) and [pnpm](https://pnpm.io/).

```sh
pnpm install   # install dependencies
pnpm dev       # start the dev server with hot reload
pnpm build     # build for production into dist/
pnpm preview   # serve the production build locally
pnpm lint      # run oxlint and ESLint
pnpm format    # format the source with Prettier
```

Built with [Vue 3](https://vuejs.org/), [Vite](https://vite.dev/),
[Pinia](https://pinia.vuejs.org/) and [Papa Parse](https://www.papaparse.com/).

## Deployment

The app is a static site deployed to GitHub Pages by the workflow in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main`.
In the repository settings, set **Pages > Source** to **GitHub Actions**.

The build is served from `/<repository name>/`, set through the `BASE_PATH` environment variable
(see [`vite.config.js`](vite.config.js)). Pages use hash URLs such as `/#/analyse`, so the server
only ever serves `index.html` and reloading or sharing any page works.

Data saved in the browser belongs to the site's address: metrics and views made on `localhost`
don't appear on the deployed site. Use Export and Import to move them.

The app is a PWA built with [vite-plugin-pwa](https://vite-pwa-org.netlify.app/): the manifest
and service worker are configured in [`vite.config.js`](vite.config.js) and the icons are in
`public/`. When a new version is deployed, open copies show a prompt to reload, so an update never
interrupts work. The service worker only runs in production builds; use `pnpm build` and
`pnpm preview` to test it.
