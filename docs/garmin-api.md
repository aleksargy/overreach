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

## What a real account sends

Checked against Alex's account on 25 October 2026 with `/api/status?shapes` (field types only, never values). `tests/fake-garmin.ts` sends these shapes.

- **Daily summaries** (`v2/dailysummaries`) answer `{ data: [...] }`, with each reading nested: `heartRate.restingValue`, `movement.steps.value`, `stress.avgLevel`, `bodyBattery.minValue` and `maxValue`. There's no sleep in them, so sleep comes only from the sleep endpoint (120 days). The first mapping read flat names and missed all of this; `HEALTH_MAPPING` in `sync.ts` makes a store read with an older mapping walk its health history again.
- **Sleep** is a bare list of flat objects (no `dailySleepDTO` wrapper): `sleepTimeSeconds`, `deepSleepSeconds`, `lightSleepSeconds`, `remSleepSeconds`, `awakeSleepSeconds`, `sleepScores.overall.value`.
- **HRV** is `{ hrvSummaries: [{ calendarDate, lastNightAvg, weeklyAvg, baseline, status }] }`.
- **Weight** is `{ dailyWeightSummaries: [{ allWeightMetrics: [{ weight, timestampGMT, samplePk, bodyFat }] }] }`, body fat empty.
- **Heart-rate zones** are a list of `{ sport, maxHeartRateUsed, restingHeartRateUsed, zone1Floor … zone5Floor, trainingMethod }`. The app works zones out as shares of max HR; Garmin's own floors are there if that ever changes.
- **Activities** carry every field the mapper reads (`activityType.typeKey`, `startTimeGMT`, `duration`, `distance`, `averageHR`, `hrTimeInZone_1…5`, `eventType`, `trainingEffectLabel` and the rest). Only the first activity's shape is kept, so the swim fields haven't been seen yet.

## Not known yet

- How Alex's football is recorded: Garmin's `soccer` type, or "other" with a name like "7-a-side", which the mapper also catches. Check that games land on the Football tab.
- Whether API FIT files are complete. Runalyze reported in October 2026 that Garmin strips some proprietary fields (VO2 max, training effect, recovery time, performance condition) from them. The app doesn't depend on any of those.
- How far back the history goes, and the real rate limits. Garmin doesn't publish them. The sync stops on a 429 and carries on later.
