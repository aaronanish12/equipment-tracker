# Equipment Tracker — WhatsApp Bot

Tracks jackhammers, grinders, props, and any other equipment across multiple
construction sites via plain WhatsApp messages. Engineers/supervisors update
status with simple texts; anyone can check where equipment is; an evening
reminder nudges people to confirm status.

## How people use it (once live)

Plain, everyday phrasing — no special symbols to memorize:

```
JH-04 is at Site B              -> marks it busy at Site B
JH-04 busy at Site B            -> same thing, either wording works
JH-04 is free / JH-04 done      -> marks it free
JH-04 needs repair, leaking oil -> marks it under repair, with a note

where is JH-04 / where's JH-04  -> shows current status/location
what's at Site B                -> shows everything at that site
what's free / what's busy       -> shows everything free/busy across all sites
HELP                            -> shows the full list with examples
```

Admins can add new equipment, sites, or people straight from WhatsApp — just
a comma-separated sentence, not a rigid format:
```
add equipment JH-05, Jackhammer 05
add site SITE-C, Pokhara Housing Project
add engineer Ram Thapa, 9779812345678, Site C
add supervisor Sita Gurung, 9779811112222, Site C
```

Every evening at a set time, the bot messages every active engineer/supervisor
asking them to confirm their equipment's status.

---

## Part 1 — Get a WhatsApp Business number (Meta Cloud API)

This is the official, free way to run a WhatsApp bot (no third-party fees).

1. Go to https://developers.facebook.com and create a developer account / app
   (choose "Business" type app).
2. Inside the app, add the **WhatsApp** product.
3. Meta gives you a **free test number** immediately — good for building and
   testing with a handful of your own phones before going live.
4. Under **WhatsApp > API Setup** you'll find:
   - A temporary access token (valid 24h — for testing only)
   - Your **Phone Number ID**
5. To go live company-wide, you need a **permanent token** and to verify your
   business (Meta Business Manager > Business Settings). This can take a
   couple of days for Meta's review — start this early.
6. Create the evening-reminder template: go to **WhatsApp Manager > Message
   Templates > Create Template**.
   - Name: `daily_equipment_check`
   - Category: Utility
   - Body: `Hi {{1}}, please confirm the status of your site's equipment
     tonight. Reply with e.g. "JH-04 busy SITE-B" or "JH-04 free" for each
     item. Send HELP for the full command list.`
   - Submit for approval (usually approved within minutes to a few hours).

This template is required because WhatsApp only lets businesses send the
*first* message in a 24-hour window using a pre-approved template — after
that, the engineer's reply opens the window for free-form back-and-forth.

## Part 2 — Get a database

Any hosted PostgreSQL works. Easiest free/cheap options: **Railway**,
**Render**, or **Supabase**. Create a Postgres instance, copy its connection
string.

## Part 3 — Deploy this code

1. Push this folder to a GitHub repo.
2. Deploy it on **Railway** or **Render** (both auto-detect Node.js apps):
   - Start command is `npm start` by default — no change needed.
   - Add environment variables from `.env.example` (fill in your real
     `DATABASE_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and make up
     your own `WHATSAPP_VERIFY_TOKEN`).
3. That's it — tables are created automatically the first time the app
   boots (and every boot after that safely re-checks they exist), so there's
   no separate migration step to run.
4. Your app will be live at something like
   `https://your-app.up.railway.app`.

## Part 4 — Connect the webhook

1. In Meta's app dashboard: **WhatsApp > Configuration > Webhook**.
2. Callback URL: `https://your-app.up.railway.app/webhook`
3. Verify token: the same string you set as `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` field.

## Part 5 — Add your first admin, sites, and equipment

Message the bot's number from your own WhatsApp:
- You'll get "not registered" the first time — that's expected, since even
  admins must exist in the `users` table first.
- Add yourself as admin directly in the database (one-time, via the
  migration connection or a DB GUI like TablePlus/pgAdmin):
  ```sql
  INSERT INTO users (phone, name, role) VALUES ('9779812345678', 'Your Name', 'admin');
  ```
- After that, you can add everyone else (sites, users, equipment) straight
  from WhatsApp using plain sentences like `add site ...` and
  `add engineer ...`, as shown above — no more manual SQL needed.

## Notes on scale (200+ items, many sites)

- Equipment codes should follow a consistent prefix per type (`JH-`, `GR-`,
  `PR-` for jackhammer/grinder/prop, etc.) so `list` and reporting stay easy
  to scan.
- The `status_log` table keeps a full history of every status change forever
  — useful later for utilization reports (e.g. "which grinders sit idle most
  often") without any extra work now.
- If you eventually want a web dashboard on top of this (a map/table view of
  everything, not just WhatsApp replies), the same database can power it —
  that would be a separate small addition to build later.

## What I'd tighten up before company-wide rollout

- **Two-way confirmation on `busy`**: currently anyone can mark equipment
  free from anywhere; consider requiring the person marking it "free" to be
  at the same site it's currently assigned to, if mis-reporting becomes an
  issue.
- **Photo proof**: WhatsApp Cloud API can also receive images — you could
  require a photo when marking equipment "repair" for a paper trail.
- **Bulk evening reminders**: with 200+ items, the evening message currently
  just asks "confirm your site's equipment" generically. It could instead
  list each engineer's specific assigned items by name pulled from the DB —
  I can extend `scheduler.js` to do this once you tell me how equipment gets
  assigned to specific people (by site only, or by named engineer?).
