# Garmin Personal API

Researched on 24 October 2026. `netlify/lib/garmin.ts` and `netlify/lib/sync.ts` use what's below.

## The key

- Free and self-serve, and it only covers your own account. Make it at connect.garmin.com/app/settings/personalApiToken.
- It expires after 30 days to a year and has to be renewed by hand. When it does, Settings says "Garmin turned the API key down": make a new one, update `GARMIN_PERSONAL_API_KEY` in Netlify, and run the Deploy workflow (environment variables only reach the functions on a new deploy). Update `.env.local` too if you use `npm run dev:real`.
- Pull only: no webhooks, and no pushing workouts or routes (those APIs are business-only).

## Endpoints

- Host: `https://personal.connectapi.garmin.com`. Exchange the key at `POST /personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <key>`. The reply is a JWT that lasts about a day, sent as `Authorization: Bearer <jwt>`. The app caches it in Blobs (`token`) with a fingerprint of the key, never the key itself.
- Activities: `/activitylist-service/activities/search/activities` (`start`, `limit` up to 50, `startDate`, `endDate`). One activity: `/activity-service/activity/{id}`. The FIT file: `/download-service/files/activity/{id}`, a zip holding `<id>_ACTIVITY.fit`.
- Daily summaries (`/usersummary-service/v2/dailysummaries`) and HRV (`/hrv-service/hrv/daily/{start}/{end}`) allow 180 days per call. Sleep (`/sleep-service/sleep/dailySleepSummariesByDate`) and Body Battery (`/wellness-service/wellness/bodyBattery/reports/daily`) allow 28. Stress and steps (`/usersummary-service/stats/{stress|steps}/daily/{start}/{end}`) allow 7. Weight (`/weight-service/weight/range/{start}/{end}?includeAll=true`) allows 365.
- Heart-rate zones are at `/biometric-service/heartRateZones/v2`, and the profile at `/userprofile-service/userprofile/settings`.
- A range that's too long comes back as an empty 400 or 500. A path that isn't allowed gives a 404.

## Not known yet

- The real field names and types. The fake Garmin (`tests/fake-garmin.ts`) copies the shapes from Garmin's own client code (through the `garmin-personal-mcp` npm package), and `netlify/lib/mapping.ts` reads tolerantly, but neither has met Alex's account. After the first real sync, `/api/status?shapes` shows what arrived (the `garmin-shapes` skill). Look first at how football is recorded (Garmin's `soccer` type, or "other" with a name like "7-a-side", which the mapper also catches), the GMT times, weight units, and the sleep and HRV shapes.
- Whether API FIT files are complete. Runalyze reported in October 2026 that Garmin strips some proprietary fields (VO2 max, training effect, recovery time, performance condition) from them. The app doesn't depend on any of those.
- How far back the history goes, and the real rate limits. Garmin doesn't publish them. The sync stops on a 429 and carries on later.
