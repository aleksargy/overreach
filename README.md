# Overreach

A personal training app for one person. It pulls runs, football, rides, swims and watch health data from Garmin, adds a match log and a strength logger, and turns it all into analysis Garmin Connect doesn't do: an aerobic engine, critical speed with race predictions, what hills, heat and last night's football cost you, match ratings and a player card. It runs on Netlify and lives on an iPhone home screen. The name is a placeholder.

## How it works

```
iPhone (PWA, IndexedDB)  ⇄  Netlify Functions (passphrase)  ⇄  Garmin Personal API
                                      │
                              Netlify Blobs: synced Garmin data, a copy of what you type
```

- The app keeps everything on the phone and works offline. Opening it asks the server to sync, and the server calls Garmin at most every 10 minutes, plus once a day at 05:00 UTC.
- The Garmin key lives only in the server functions, and every request needs your passphrase.
- What you type (matches, workouts, weigh-ins) is copied to the server, so a new phone gets it back on its first sync.
- The running analysis is worked out in the browser from small per-run summaries the server makes during sync.

`CLAUDE.md` has the details: architecture, sync, design rules and conventions. `docs/` has the decisions behind them, the Garmin API notes and the roadmap.

## Run it locally

Use Node 22 (`nvm use` reads `.nvmrc`), then `npm install`.

| Command                              | What you get                                                               |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `npm run dev`                        | the app on localhost:5173 with sample data                                 |
| `npm run dev:api` and `npm run dev`  | a fake Garmin with a year of history: Settings, passphrase `dev`, Sync now |
| `npm run dev:real` and `npm run dev` | your real Garmin account, 90 days back (set up the key first, below)       |

Both APIs listen on 127.0.0.1 only. Real data from `dev:real` stays on your Mac, in `.netlify/real-blobs` and the browser's storage for localhost.

## Checks

```sh
npm test               # sync engine, functions, running model, football, backup
npm run typecheck
npm run format:check   # npm run format fixes it
npm run check:env      # every env var the code reads is listed in .env.schema
npm run build
npm run screens        # every screen at 390 × 844 in sample and live mode, into screens/
```

CI runs the first five on every pull request. `npm run screens` needs Chromium once: `npx playwright install chromium`.

## Secrets: what goes where

| What                      | Deployed site                                      | Your Mac                                 | Never                                  |
| ------------------------- | -------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `GARMIN_PERSONAL_API_KEY` | Netlify environment variable, Production only      | `.env.local`, encrypted by varlock       | git, chats, GitHub, the browser bundle |
| `OVERREACH_PASSPHRASE`    | Netlify environment variable, Production only      | your password manager, typed in Settings | git, chats                             |
| `NETLIFY_AUTH_TOKEN`      | GitHub repository secret (for the deploy workflow) |                                          | git, chats                             |
| `NETLIFY_SITE_ID`         | GitHub repository variable (not secret)            |                                          |                                        |

`.env.schema` lists the variables and which are sensitive. It holds no values, so it's committed. Netlify keeps the deployed values encrypted, and Production-only means a preview deploy never sees them.

### Your Garmin key on this Mac

[varlock](https://varlock.dev) keeps the key in `.env.local` encrypted with a key that only this Mac holds, and hands it to `npm run dev:real` when it starts.

1. Make the key in Garmin Connect: [Settings, Personal API](https://connect.garmin.com/app/settings/personalApiToken), and copy it.
2. Encrypt it straight from the clipboard, so it never touches a file or your shell history:
   ```sh
   pbpaste | npx varlock encrypt
   pbcopy < /dev/null   # clear the clipboard
   ```
3. Create `.env.local` with the line it printed, under the right name:
   ```sh
   GARMIN_PERSONAL_API_KEY=varlock("local:…")
   ```
4. Check it: `npx varlock load` shows the key masked, like `ab▒▒▒▒▒`.
5. Run `npm run dev:real` and `npm run dev`, then Settings, passphrase `dev`, Sync now. It reads 90 days, not two years, to keep Garmin calls down (`OVERREACH_HISTORY_DAYS` in `.env.local` changes that).

The npm scripts switch varlock's anonymous usage stats off. To switch them off for every project, run `npx varlock telemetry disable`.

## Deploying

GitHub Actions does the deploying, so a deploy only happens after the checks pass:

- **Pull request:** `ci.yml` checks it, then puts a preview on Netlify (sample data, no server functions, so it can't touch your real data). The link shows on the pull request.
- **Merge to main:** `deploy.yml` checks again, builds, and deploys to production. Changes that only touch docs or Claude's settings don't deploy, because each production deploy costs 15 of the free plan's 300 monthly credits. Previews are free.
- main only takes changes through pull requests, and only when `check` passes.

### First time

1. **Make the Netlify project** without connecting git builds, since GitHub Actions deploys instead. Either run `npx netlify-cli@27.14.2 login`, then `npx netlify-cli@27.14.2 sites:create --name <a-name>`, or in Netlify choose Add new project, then Deploy manually, and drop in the `dist` folder from `npm run build`. Copy the Project ID (Project configuration, General). On the same page, switch off the **Powered by Netlify badge**: free projects show it in the bottom-right corner, right over the tab bar.
2. **Add the two environment variables** in Netlify (Project configuration, Environment variables): `GARMIN_PERSONAL_API_KEY` and `OVERREACH_PASSPHRASE`. For each, pick "Different value for each deploy context", fill in Production only, and tick "Contains secret values". Let your password manager make the passphrase, or run `openssl rand -base64 24`.
3. **Give GitHub the keys to deploy.** In Netlify, make a personal access token (User settings, Applications, Personal access tokens) with an expiry date. Then:
   ```sh
   gh secret set NETLIFY_AUTH_TOKEN         # paste the token at the prompt
   gh variable set NETLIFY_SITE_ID --body "<project id>"
   ```
4. **Deploy:** merge a pull request, or Actions, Deploy, Run workflow. The run shows the site's URL when it's done.
5. **Check the server:** open the site, go to Settings, type the passphrase. It should say "Server ready".
6. **Install it on the iPhone:** open the site in Safari, Share, Add to Home Screen. Open it from there, then Settings, passphrase, Sync now. The first sync walks two years of history in steps and takes a few minutes; you can close the app and it carries on next time.
7. **The next morning,** the `scheduled-sync` function should show a run in Netlify's function logs.

## Keeping it running

- **The Garmin key expires** after 30 days to a year, and Settings says so. Make a new one, encrypt it into `.env.local` as in "Your Garmin key on this Mac", then hand it from varlock to Netlify without it touching your terminal:
  ```sh
  npx varlock run -- sh -c 'npx netlify-cli@27.14.2 env:set GARMIN_PERSONAL_API_KEY "$GARMIN_PERSONAL_API_KEY" --context production --secret --force'
  ```
  Leave out `--scope`: in this CLI version it makes `env:set` quietly do nothing. Then run the Deploy workflow, because a changed environment variable only reaches the functions on a new deploy.
- **The Netlify token expires** on the date you chose. Make a new one and run `gh secret set NETLIFY_AUTH_TOKEN` again.
- **Your data:** what you type is copied to the server a few seconds after each change. Settings, Export a backup gives you a file as well, and Restore from a backup adds one back.
- **Dependabot** opens one grouped update a month. Merge it when `check` passes.

## Working on it

Make a branch, open a pull request, let CI and the preview run, then squash or rebase it into main. If a screen changed, look at `npm run screens` before merging; the design rules are in `CLAUDE.md`.

Claude Code reads `CLAUDE.md`, and `.claude/` holds its project settings: a Prettier hook, the commands it may run without asking, what it may never read (your `.env.local`, your real data), and two skills: `check-screens` and `garmin-shapes`.
