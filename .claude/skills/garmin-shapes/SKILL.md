---
name: garmin-shapes
description: Compare what Garmin really sends (field names and types, never values) with what netlify/lib/mapping.ts reads, then fix the mapping and the fake Garmin to match. Use after the first real sync, when a screen is missing data that Garmin should have, or when Settings lists an endpoint under warnings.
---

# Fix the mapping against real Garmin data

`/api/status?shapes` returns each Garmin response with every value replaced by its type, so this never needs to see Alex's data. Keep it that way: work from shapes only, and don't print, save or quote values from the real store.

1. Get the shapes.
   - From the local run against the real account (`npm run dev:real` is running):
     `npx varlock run -- sh -c 'curl -s -H "x-overreach-key: ${OVERREACH_PASSPHRASE:-dev}" "http://127.0.0.1:8788/api/status?shapes"' | jq .shapes`
   - From the deployed site, with the production passphrase in `.env.local` as `OVERREACH_PASSPHRASE`. varlock passes it to curl, so it never appears in the chat:
     `npx varlock run -- sh -c 'curl -s -H "x-overreach-key: $OVERREACH_PASSPHRASE" "https://SITE.netlify.app/api/status?shapes"' | jq .shapes`
2. For each endpoint (activities, dailies, hrv, sleep, weight, zones), compare its fields with the keys each reader in `netlify/lib/mapping.ts` tries. Look for renamed fields, a list wrapped under a different key, numbers sent as strings, and times with no zone.
3. Add the real names to the readers and keep the old ones: the readers are tolerant on purpose. Then change `tests/fake-garmin.ts` to send the real shape, so the tests keep describing reality.
4. Run `npm test`, sync again, and look at the screens (the check-screens skill).
