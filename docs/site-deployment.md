# Product site deployment

The public Crewlight product site is a static Astro application in `apps/site`.
It is designed for Cloudflare Pages Git integration and does not require a
Cloudflare adapter, Pages Functions, Wrangler configuration, runtime secrets,
or a committed `dist` directory.

## Local verification

The site commands require Node.js 22.12 or newer. CI and Cloudflare Pages use
Node.js 22.16.0.

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm site:check
pnpm site:build
```

The production output is written to `apps/site/dist`. The repository CI runs
the two site commands in a dedicated Node 22.16 job, separately from the
cross-platform Crewlight product validation and release jobs.

## Cloudflare Pages build configuration

Connect the `QianQIUlp/Crewlight` GitHub repository and use these values:

| Setting                | Value                                     |
| ---------------------- | ----------------------------------------- |
| Production branch      | `main`                                    |
| Framework preset       | `Astro` or `None`                         |
| Root directory         | Leave blank (repository root)             |
| Build command          | `pnpm --filter @crewlight/site run build` |
| Build output directory | `apps/site/dist`                          |
| Build system version   | `3`                                       |

Set these variables for both Production and Preview deployments:

| Variable       | Value                         |
| -------------- | ----------------------------- |
| `NODE_VERSION` | `22.16.0`                     |
| `PNPM_VERSION` | `10.11.0`                     |
| `SITE_URL`     | `https://crewlight.qiu.works` |

`SITE_URL` supplies canonical, language-alternate, social-preview, sitemap, and
robots URLs at build time. Change it if the final production domain is not
`crewlight.qiu.works`. Preview deployments should continue to use the canonical
production domain.

Keeping the repository root as the build root is intentional: the shared
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json`, and package-manager
declaration live there. Do not use the root `pnpm build` command in Pages; it
builds Crewlight's TypeScript and desktop assets rather than only the static
product site.

Cloudflare documents these settings in [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[Build image](https://developers.cloudflare.com/pages/configuration/build-image/),
[Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/),
and [Astro on Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/).

## Git integration

1. Open Cloudflare Dashboard → **Workers & Pages** → **Create application** →
   **Pages**.
2. Choose **Import an existing Git repository** (some dashboard versions call
   this **Connect to Git**).
3. Authorize the Cloudflare GitHub App for `QianQIUlp/Crewlight`.
4. Apply the build settings and variables above.
5. Select **Save and Deploy**.
6. Confirm that both `/` and `/zh/` render on the generated `*.pages.dev`
   address.

Qualifying pushes to `main` update the production deployment when automatic
production deployments remain enabled under **Branch control**. Other branches
create preview deployments by default, and pull requests from the same
repository can receive preview links. See Cloudflare's [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
and [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
documentation.

The repository makes the site buildable by Pages, but the initial GitHub
authorization and Pages project creation remain Cloudflare account actions.

## Build watch paths

In **Settings → Build → Build watch paths**, use these include paths:

```text
apps/site/*
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
```

Leave excludes empty. These paths avoid rebuilding the website for unrelated
desktop-only changes while still rebuilding it when workspace installation
metadata changes.

## Custom domain

The site defaults to `crewlight.qiu.works`, following the existing
`verisilo.qiu.works` convention:

1. Open the Pages project → **Custom domains** → **Set up a domain**.
2. Enter `crewlight.qiu.works`.
3. If `qiu.works` is already managed by the same Cloudflare account, allow
   Cloudflare to create the DNS record.
4. If DNS is managed elsewhere, finish the Pages domain association first,
   then create a CNAME from `crewlight` to the generated `<project>.pages.dev`
   hostname.
5. Wait for the Pages domain status to become **Active**, then verify HTTPS.

Associate the custom domain from the Pages project before adding a manual
CNAME. See Cloudflare's [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
documentation.

## Post-deployment checks

Verify:

- `/` returns the English page.
- `/zh/` returns the Chinese page and both language links switch correctly.
- GitHub, documentation, release, and license links open the intended pages.
- `/og.png`, `/sitemap.xml`, `/robots.txt`, and `/favicon.svg` are reachable.
- Response headers include the policies defined in `apps/site/public/_headers`.
- Fingerprinted `/_astro/*` assets use immutable caching.
- An unknown path returns the custom `404.html` response with HTTP 404 rather
  than falling back to the home page.
- A pull request branch receives a preview URL without replacing production.

Cloudflare Dashboard labels change occasionally. Use the equivalent **Build
configuration**, **Variables and Secrets**, **Build watch paths**, **Branch
control**, and **Custom domains** sections if the wording differs.
