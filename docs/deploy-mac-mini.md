# Running the archive on the lab Mac mini

This is the checklist for hosting Bayaaz-e-Hayaat on a Mac that stays on in the lab. It assumes the repository is cloned at `~/bayaaz/v4` and that Node 18 or newer and the `sqlite3` command-line tool are installed.

## 1. Keep the data outside the repository

The SQLite database holds every account, contribution and activity-log entry. Keep it, the uploads and the live archive snapshot in a folder that `git pull` never touches:

```bash
mkdir -p ~/bayaaz-data/uploads ~/bayaaz-data/backups
```

In `backend/.env` (copy it from `backend/.env.example`):

```
DB_FILE=/Users/<you>/bayaaz-data/archive.db
UPLOAD_DIR=/Users/<you>/bayaaz-data/uploads
ARCHIVE_LIVE_SNAPSHOT=/Users/<you>/bayaaz-data/archive_live.json
SERVE_FRONTEND=true
SYSADMIN_EMAILS=<your email>,<teammate's email>
ADMIN_EMAILS=<Nazia's email>
```

Then build the frontend once, and again after every pull that changes it:

```bash
cd ~/bayaaz/v4/frontend && npm ci && npm run build
cd ~/bayaaz/v4/backend && npm ci && node index.js
```

## 2. Rotate the login secret on the first deploy

Tokens issued before this release never expire. Set a fresh `JWT_SECRET` in `backend/.env` when you first deploy; that signs everybody out once and every new token lasts 7 days.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 3. Roles: the one trap

- `SYSADMIN_EMAILS` is read on every request. Nobody can give or take sysadmin from inside the site. Edit `.env` and restart.
- `ADMIN_EMAILS` and `MODERATOR_EMAILS` **promote people on every restart**. They never demote.
- So to demote someone, **remove their address from the list first**, then change their role on the Admin page. If you only change it in the site, the next restart promotes them again.
- **Sign up every listed address yourselves before anyone else can reach the site.** Email addresses are not verified yet, so whoever registers a listed address first gets its role. Anyone who knows Nazia's public email could otherwise sign up as her and become admin. Once all listed accounts exist, nobody else can register those addresses.

## 4. Nightly backup

Use SQLite's own backup command. It is safe while the server is running, unlike copying the file. Save this as `~/bayaaz-data/backup.sh` and make it executable (`chmod +x`):

```bash
#!/bin/bash
set -euo pipefail
DATA="$HOME/bayaaz-data"
DEST="$DATA/backups"
sqlite3 "$DATA/archive.db" ".backup '$DEST/archive-$(date +%F).db'"
rsync -a --delete "$DATA/uploads/" "$DEST/uploads/"
find "$DEST" -name 'archive-*.db' -mtime +14 -delete
```

Run it every night at 02:30 with launchd. Save as `~/Library/LaunchAgents/edu.iiit.bayaaz.backup.plist`, then `launchctl load ~/Library/LaunchAgents/edu.iiit.bayaaz.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>edu.iiit.bayaaz.backup</string>
  <key>ProgramArguments</key>
  <array><string>/Users/YOU/bayaaz-data/backup.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
</dict>
</plist>
```

Copy `~/bayaaz-data/backups` somewhere off the machine now and then. A backup on the same disk does not survive the disk.

## 5. Campus network and Neo4j

Campus Wi-Fi blocks port 7687, which AuraDB uses. A Mac mini on the campus network therefore cannot reach Aura. The site still runs: it serves the last live snapshot and accepts notes and sources. But approvals of corrections, keywords and new works fail with "The archive database is offline — try again later." Each failed attempt waits about 30 seconds before giving up.

Pick one:

1. **Run Neo4j on the Mac mini itself** (Neo4j Desktop or Community Edition), load the archive dump, and point `ARCHIVE_NEO4J_URI` at `neo4j://localhost:7687`. No network dependency at all.
2. **Ask IT to allow outbound TCP 7687** from the Mac mini to `*.databases.neo4j.io`.
3. **Reach Aura over HTTPS (port 443)** with Neo4j's Query API. This needs code changes in `backend/archive.js`, so it is the most work of the three.

AuraDB Free also pauses after 3 days without queries. Resume it at https://console.neo4j.io.

## 6. Letting the team in

For the teammate and Nazia to use the Mac mini from their own laptops, install Tailscale on each machine and share the Mac mini to the tailnet. They then open `http://<mac-mini-name>:3001`. Nothing is exposed to the public internet.

If the site is ever put behind a tunnel or proxy (Tailscale Funnel, Cloudflare Tunnel, nginx), set `TRUST_PROXY=1`. Without it every visitor appears to come from the proxy's address, so the sign-in rate limit (10 attempts per 15 minutes) applies to everyone at once.

## 7. Moving to another host later

If the site ever moves to a host with a throwaway disk (most free platforms), the SQLite file needs a persistent volume. Otherwise every redeploy erases all accounts and contributions.
