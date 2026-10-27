# Goofyverse Cinema

A tiny private Letterboxd for two friends and one cat. Log what you watched, keep one shared watchlist, plan movie nights, and review anything else on the Jazz shelf. Monsieur Pierre, the lazy tuxedo cat from [oneko-woah](https://github.com/lolesterrr/oneko-woah), runs the place.

Live at <https://lolesterrr.github.io/goofyverse-cinema/> once you finish the setup below.

## What's in it

- **Diary**: log a film with half-star ratings, a review, the date, and whether you watched it together. Everyone's takes on the same film sit side by side.
- **Watchlist**: one shared queue, drawn as ticket stubs. Anyone can add, plan a night or remove.
- **Movie night**: pick a film, a date and a place. Both of you answer In, Maybe or Out, and there's a countdown.
- **The Jazz shelf**: anything that isn't a film. Albums, anime, games, books, snacks. Each entry has a category, a rating and a review.
- **Us**: taste match (how often you agree, and the biggest fight), a year in review for each person, and Pierre's complaint desk for anything rated two stars or less.
- **Pierre**: reacts when you rate (happy at 4.5 stars and up, sad at 1.5 and below), holds your tickets and eats popcorn on movie nights. Click him in the sign in screen if you want to pet him.

No accounts. You type one shared passphrase, then pick who you are. Profiles are a list in the worker's config, so adding a friend later is one line.

## How it works

```
your browser ──> the site (GitHub Pages, built from this repo's src/)
      │
      └────────> the worker (Cloudflare, worker/index.js)
                      ├──> KV storage: your logs, queue, nights, shelf
                      └──> TMDB: film search, posters, details (the key lives here, never in the browser)
```

GitHub Pages only serves files, so the worker is the small backend that remembers things and keeps the TMDB key and the passphrase out of the site. It is one file with no dependencies.

## Setup (about fifteen minutes)

### 1. Get a TMDB key

Film search and posters come from [TMDB](https://www.themoviedb.org/), which is free for personal projects.

1. Make a free account, then go to Settings > API and request a key (pick the personal or non-commercial option).
2. Copy the **API Read Access Token** (the long one). You'll give it to the worker in step 2.

### 2. Deploy the worker

You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account. If you already run MMA or MPA, use the same one.

**With wrangler (a few commands)**

```sh
cd worker
npx wrangler@4 login
npx wrangler@4 kv namespace create GOOFY_KV
```

The second command prints an `id`. Paste it into `worker/wrangler.toml` where it says `PASTE_YOUR_KV_NAMESPACE_ID`. Then set the three secrets (each command asks you to paste the value):

```sh
npx wrangler@4 secret put PASSPHRASE     # the word you two will type to get in. Make it long.
npx wrangler@4 secret put SIGNING_KEY    # any long random string, e.g. the output of: openssl rand -hex 32
npx wrangler@4 secret put TMDB_TOKEN     # the read access token from step 1
npx wrangler@4 deploy
```

It prints the worker's address, something like `https://goofyverse-cinema.your-name.workers.dev`.

**From the dashboard instead, no tools**

1. Workers & Pages > Create > Worker. Name it `goofyverse-cinema`, deploy the starter, then **Edit code** and replace everything with [`worker/index.js`](worker/index.js). Deploy.
2. Storage & Databases > KV > Create a namespace called `goofyverse-cinema`.
3. Back in the worker: Settings > Bindings > Add > KV namespace. Variable name must be exactly `GOOFY_KV`, pick the namespace you just made.
4. Settings > Variables and Secrets. Add these as **Secret**: `PASSPHRASE`, `SIGNING_KEY`, `TMDB_TOKEN`. Add these as **Text**: `PROFILES` = `Kensss,Goof` and `ALLOWED_ORIGINS` = `https://lolesterrr.github.io`.

### 3. Tell the site where the worker is

Put the worker's address in [`.env.production`](.env.production):

```
VITE_API_BASE=https://goofyverse-cinema.your-name.workers.dev
```

Commit and push. (Skipping this works too: the site shows a setup screen where you can paste the address, and it remembers it in that browser only.)

### 4. Turn on GitHub Pages

In this repo: **Settings > Pages > Build and deployment > Source: GitHub Actions**. The [Pages workflow](.github/workflows/pages.yml) runs the tests, builds the site and publishes it on every push to `main`.

### 5. Check it

Open <https://lolesterrr.github.io/goofyverse-cinema/>, type the passphrase, pick your name, and log something. Send your friend the link and the passphrase.

### Optional: deploy the worker from GitHub

The [Worker workflow](.github/workflows/worker.yml) redeploys the worker when `worker/` changes. It needs two repo secrets, `CLOUDFLARE_API_TOKEN` (from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Without them it does nothing. Your passphrase, signing key and TMDB token stay in Cloudflare.

## Adding a friend later

1. Add their name to `PROFILES` (in `worker/wrangler.toml`, or the variable in the Cloudflare dashboard) and deploy.
2. Give them the site link and the same passphrase. They pick their name on the sign in screen.

Each person writes only their own diary and jazz entries. The watchlist and movie nights are shared by everyone. Taste match lets you pick any two people once there are three or more.

## Run it on your computer

```sh
npm install
npm run dev        # http://localhost:5173/goofyverse-cinema/
npm test           # worker, helpers, every page, and the app running against the worker
```

To run the worker locally too, make `worker/.dev.vars` (it's git-ignored):

```
PASSPHRASE=anything
SIGNING_KEY=anything-long-and-random
TMDB_TOKEN=your-read-access-token
```

then `cd worker && npx wrangler@4 dev`, and paste `http://localhost:8787` into the site's setup screen. `http://localhost:5173` is already in the worker's allowed origins.

## Good to know

- **Privacy.** Everything is stored in your own Cloudflare KV. Nothing is sent anywhere else except film searches to TMDB (through the worker) and poster images, which your browser loads from TMDB's image server.
- **The passphrase is the only lock.** The worker allows 8 wrong guesses per 15 minutes per address, but pick something long anyway. Sessions last 30 days. Removing someone from `PROFILES` signs them out.
- **Changes show up on their own.** The site checks for the other person's changes every 45 seconds while the tab is open, and whenever you switch back to it. Cloudflare KV can take up to about a minute to spread a change between regions.
- **Two people editing the same shared thing at once.** If you both change the watchlist in the same second, one change can win. For two friends that is very unlikely.
- **Free tier.** This should sit comfortably inside Cloudflare's free plan for two or three people. Check [Cloudflare's current KV limits](https://developers.cloudflare.com/kv/platform/limits/) if you add many friends.

## Layout

| Path | What it is |
| --- | --- |
| `src/` | The React app (Vite). `pages/` are the screens, `components/` the pieces, `lib/` the plain logic (taste match, stats, dates) |
| `worker/index.js` | The whole backend: sign in, KV data, TMDB proxy |
| `worker/wrangler.toml` | Worker config: profiles, allowed sites, KV binding |
| `public/pierre/` | Pierre's sprite sheet and animation list, from the MMA site |
| `tests/` | Worker tests, logic tests, page render tests, and an end-to-end flow test |

## Credits

Monsieur Pierre is from [oneko-woah](https://github.com/lolesterrr/oneko-woah). Film data and posters from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Fonts: Limelight and DM Sans through [Fontsource](https://fontsource.org/).
