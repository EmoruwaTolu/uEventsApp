# uEvents → TestFlight runbook

Run from `uEvents/` on your Mac (needs your Apple Developer login). Config is already
build-ready (bundle id `com.cssa.uevents`, icons, permissions, export compliance,
EAS projectId, autoIncrement build numbers).

## 0. One-time setup
```bash
npm i -g eas-cli          # if not already installed
eas login                 # your Expo account
eas whoami                # confirm you're on the account that owns the project
```

## 1. (Recommended) deploy the backend first
So the app works against the latest API (top-comment likes, /legal pages, recap rules):
```bash
# from backend/ — push to the branch Render deploys, or click "Manual Deploy" in Render
git add -A && git commit -m "Deploy: legal pages, comment upvotes, recap rules" && git push
```
Migrations are already applied. Optionally load data: `cd backend && npm run db:seed-live`.

## 2. Build the iOS app
```bash
eas build --platform ios --profile production
```
- When prompted, let **EAS manage credentials** (Distribution cert + provisioning profile
  + push key). You'll sign in with your Apple Developer account.
- If it asks to register the bundle id `com.cssa.uevents`, say yes.
- Wait for the build (~10–20 min). It appears in the EAS dashboard.

## 3. Submit to App Store Connect / TestFlight
```bash
eas submit --platform ios --profile production
```
- Choose the build you just made (or it picks the latest).
- Sign in with Apple / provide an App Store Connect API key if asked.
- This uploads the build and creates the App Store Connect app record if it doesn't exist.

## 4. Turn on TestFlight testing
In **App Store Connect → your app → TestFlight**:
1. Wait for the build to finish **processing** (a few minutes to ~1 hour).
2. Answer the **Export Compliance** prompt (already "no encryption" — should auto-clear).
3. **Internal testing (fastest — no review):**
   - Add your team under **Internal Testing** (up to 100 App Store Connect users).
   - They install **TestFlight** from the App Store and accept the invite. Live almost immediately.
4. **External testing (friends/clubs — needs a quick Beta App Review):**
   - Create an external group, add the build, fill **Test Information** + "What to Test"
     (copy from `APP_STORE_LISTING.md`), submit for Beta App Review (usually fast).

## Notes / gotchas
- **First launch may take 30–60s** if the Render backend was idle (free-tier cold start).
  The app's request timeout is raised to tolerate it, but warn testers.
- **Push notifications** only work in this real build (not Expo Go) — verify end-to-end.
- Internal testing needs **none** of the App Store listing/screenshots. Save those for the
  eventual public submission + external testers (draft is in `APP_STORE_LISTING.md`).
- If `eas build` complains about the Xcode version locally — ignore it; EAS builds in the
  cloud with the correct toolchain. That warning only affects local `expo run:ios`.

## Quick reference
| Item | Value |
|---|---|
| Bundle id | `com.cssa.uevents` |
| EAS project | `5c09391b-15e2-46b6-b6f6-b883d62135c6` |
| API base | `https://ueventsapp.onrender.com` |
| Build | `eas build --platform ios --profile production` |
| Submit | `eas submit --platform ios --profile production` |
