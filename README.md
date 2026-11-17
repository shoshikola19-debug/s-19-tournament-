# S_19 Tournament

Free Fire tournament app — BR, CS and Lone Wolf custom-room matches with
real Taka prizes. Standalone build for Render free tier, so it lives on its
own domain (**https://s-19-tournament.onrender.com**) and Chrome can
install it as a separate app (the Muse artifact version lives inside
muse.ai, so Chrome only ever offered to install Muse itself).

Rebuilt from the Muse artifact `es-19-tturnaamentt` (same features, same
rules). The artifact itself cannot be exported — fullstack artifacts have
no export — so this repo is a clean rebuild, and its data was seeded from
the artifact through its own published actions.

## What is in here

- `server.js` — Express API + static client. Register/login (scrypt
  password hashes), tournaments, slot booking, wallet, results,
  leaderboard, daily spin, admin panel.
- `db.js` — SQLite locally (`data/s19-tournament.db`); Postgres/Neon
  when `DATABASE_URL` is set (same dual-engine pattern as S_19 CHAT BOOK).
- `public/` — the app itself (black + red, English UI, Bengali Welcome
  Notice + LW 1v1 rules), PWA manifest + icons + service worker.
- `data/seed.json` — the exact artifact export (2026-11-17): **10
  tournaments**, owner profile, wallet history, payment info. Nothing
  invented.
- `render.yaml` — Render Blueprint (free tier, `npm install` / `npm start`).

## Rules baked in

- Slots are fixed per lobby: BR Solo 48, BR Duo / Esports PRO 50,
  CS 4v4 8, CS 1v1 2, CS Headshot Only 8, LW 1v1 2, LW 2v2 4,
  LW Lose To Win 2, LW Headshot Only 8.
- BR Solo/Duo prize split: 1st 90, 2nd 70, 3rd 40, 4th 30, 5th 20,
  Per Kill 10, Total 800 TK.
- Room ID/password reveal 5 minutes before the match.
- Deposit: player sends money to the owner's bKash, submits TrxID
  (8–12 letters/digits, duplicates rejected); nothing is credited until
  the owner approves in Admin. Wrong TrxID never confirms.
- Withdraw: only Winning Balance, minimum ৳100, 10:00 AM – 9:30 PM
  Dhaka time.
- LW 1v1 rules screen: Round 9, all guns yes, limited ammo yes, gun
  attributes no, character skill no, throwables allow, plus the 17
  Bengali rules.

## Seeded data (from the artifact, 2026-11-17)

- 10 tournaments: LW 1V1 Custom Room (18 Nov, 18:45, Prize 110 / Fee 70,
  Room S19LW1V1) + the 19 Nov lineup (BR Solo/Duo/Esports PRO, CS 4v4/1v1/
  Headshot Only, LW 2V2/Lose To Win/Headshot Only).
- Owner profile: bijoy / shoshikola19@gmail.com / +8801906502081,
  S_19 ID #100001. **No password is stored in the seed** — password
  hashes are never exported. On first run the owner registers with the
  same email and the account picks up this profile and wallet.
- Wallet: balance ৳0 (deposit 0, winning 0); the 3 stored transactions
  are the approved sandbox test rows (deposits 100 + 100, withdraw 200).
- Payment: bKash 01906502081; Nagad/Rocket not set yet.

## Deploy (Render free tier)

1. Push this repo to GitHub `shoshikola19-debug/s-19-tournament`.
2. Render Dashboard → **New +** → **Blueprint** → pick the repo.
   Render reads `render.yaml` and creates the `s-19-tournament` service.
3. Live URL: https://s-19-tournament.onrender.com
   Free tier sleeps after ~15 min idle; first load after sleep is slow.
4. **For permanent data, set `DATABASE_URL`** in the Render Dashboard
   (Environment tab) to a Neon Postgres connection string. Without it
   the app uses a local SQLite file, which Render's free tier wipes on
   redeploy — the seed file re-creates the 10 tournaments and payment
   info on a fresh boot, but bookings made after deploy would be lost.

## Local test

```bash
npm install
npm test   # boots on port 3101, checks seed, deposit→approve→book→result→prize
npm start  # http://localhost:3000
```
