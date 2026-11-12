# BeH Archive: deploy to the Ubuntu mini PC

Plan for moving the BeH archive (Express + React + SQLite + Neo4j) from "Neo4j on Aura,
nothing deployed" to a self-hosted Ubuntu server on Prof. Kamal's mini PC.

Put this file at `v4/docs/deploy-ubuntu-minipc.md`. It replaces `deploy-mac-mini.md`
(the macOS plan, which was never carried out).

---

## Status

Tick boxes as you go. Total time is about 3 hours, split over 2 sessions.

**Session 1 (about 1.5 h)**
- [ ] Phase 0: export the live Aura data (10 min)
- [ ] Phase 1: flash the USB and install Ubuntu Server 24.04 (45 min)
- [ ] Phase 2: BIOS settings, Ethernet, IP check (10 min)
- [ ] Phase 3: lock the box down (20 min)

**Session 2 (about 1.5 h)**
- [ ] Phase 4: install Node 22, Neo4j Community, Caddy (20 min)
- [ ] Phase 5: load the data into local Neo4j and verify (10 min)
- [ ] Phase 6: deploy the app as a systemd service (30 min)
- [ ] Phase 7: put Caddy in front of the app (10 min)
- [ ] Phase 8: nightly backups and Tailscale remote access (20 min)

**Parallel (do today, 2 min)**
- [ ] Ask Prof. Kamal: should the site be public or campus-only?
- [ ] If public: Prof. Kamal emails IIIT IT (draft at the bottom of this file)

---

## The machine

| Item | Value |
|---|---|
| Model | Skull Saints Venom mini PC |
| CPU | Intel Core i7-1370P (14 cores: 6P + 8E, 20 threads) |
| RAM | 16 GB DDR5 |
| Storage | 512 GB NVMe (single drive, so backups must leave the box) |
| Network | Dual gigabit Ethernet (rear), WiFi 6 |
| Power | 19 V × 4.74 A adapter, about 90 W max |
| Asset tag | IIIT/CDE/ASEA/CPU/2025-1 |
| Hostname / IP (current) | 3rakshak.iiit.ac.in / 10.10.16.43 (campus-private) |

Verdict: massively overkill. The archive graph is 273 nodes and 322 relationships, and SQLite
is 32 KB. Nothing to flag to Prof. Kamal about capacity.

Neo4j cost: **₹0.** Self-hosted Neo4j Community Edition is free. The paid cloud plan
(AuraDB Professional, about $65.70/month for 1 GB) would NOT fix the campus port block,
because it still uses Bolt port 7687.

---

## Key facts from the repo audit

- Frontend: CRA (react-scripts 5), React 18. `npm run build` outputs to `v4/frontend/build`.
- Backend: Express 4, entry `v4/backend/index.js`. With `SERVE_FRONTEND=true` it serves the
  site and the API on one port, **3001**.
- SQLite (`users.db`) holds accounts, submissions and the activity log. bcrypt and sqlite3 are
  native modules, so always run `npm ci` on the server and never copy `node_modules` from the Mac.
- Only the backend talks to Neo4j (`backend/archive.js:16`). The browser never does. Moving
  Neo4j to `localhost` therefore **fixes the campus port-7687 block**.
- No APOC, GDS, constraints or indexes are used. The data is tiny.
- The fallback snapshot `ARCHIVE_SNAPSHOT` defaults to a file **outside the repo**
  (`db/backups/archive_backup_2026-09-14.json`). Copy it to the server.
- There are no hardcoded hosts: CORS is `*` and the API path is relative.

---

## Phase 0: Export the live Aura data (laptop, on a phone hotspot)

Campus blocks port 7687, so do this over a mobile hotspot. This is the only step that needs Aura.

1. Open the Aura console and go to the Query tab.
2. Record the live counts and version:
   ```cypher
   CALL dbms.components() YIELD name, versions, edition;
   MATCH (n) RETURN count(n);
   MATCH ()-[r]->() RETURN count(r);
   ```
   The 14 Sep backup has **273 nodes / 322 relationships**.
3. Export everything:
   ```cypher
   CALL apoc.export.cypher.all(null, {format:'cypher-shell', stream:true})
   YIELD cypherStatements RETURN cypherStatements;
   ```
   Save the output as `all.cypher`.
4. If APOC errors, fall back to `db/backups/archive_backup_2026-09-14.cypher`. It misses any
   change made after 14 Sep.

Write the counts here so you can compare in Phase 5: nodes `____`, relationships `____`.

---

## Phase 1: Install Ubuntu Server 24.04 LTS

You need a USB stick of 8 GB or more, a monitor (HDMI on the back), a keyboard and an Ethernet cable.

1. Download the Ubuntu Server 24.04 LTS ISO from ubuntu.com/download/server.
2. Flash it to the USB stick with balenaEtcher.
3. Boot the mini PC from the USB. Spam the boot-menu key at power-on; it is usually F7, F11,
   F12 or Esc.
4. In the installer:
   - Network: plug in Ethernet first, so it picks up an address.
   - Storage: **use the entire disk.** This wipes the drive. Prof. Kamal has approved this.
   - Profile: create user `monish` and set the hostname, for example `rakshak`.
   - **Tick "Install OpenSSH server".**
   - Skip all the optional snaps.
5. Reboot and remove the USB stick.

---

## Phase 2: BIOS settings, Ethernet, IP check

1. Enter the BIOS (usually Del or F2 at power-on).
   - Set **Restore on AC Power Loss** to **Power On**, so the box boots itself after power cuts.
   - Turn off any sleep or ErP power-saving options.
2. Log in and check the address:
   ```bash
   ip -brief addr
   ```
   - You get `10.10.16.43`: done.
   - You get a different `10.x` address: try the other rear LAN port. IIIT usually binds the
     IP to one port's hardware (MAC) address.
   - You get no address at all: ask IIIT IT for the IP, gateway and DNS, then set a static
     address with netplan (`/etc/netplan/50-cloud-init.yaml`).
3. Check that the box can reach the internet:
   ```bash
   curl -I https://api.groq.com
   ```

---

## Phase 3: Lock the box down

1. Update everything:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   ```
2. Set up SSH key login. On your laptop:
   ```bash
   ssh-copy-id monish@10.10.16.43
   ssh monish@10.10.16.43      # must log in WITHOUT a password prompt
   ```
3. Turn off password login.

   > **Warning:** keep one SSH session open while you do this, and test from a second
   > terminal. If key login is broken you will lock yourself out and need the monitor and
   > keyboard again.

   ```bash
   sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
   PasswordAuthentication no
   PermitRootLogin no
   EOF
   sudo systemctl restart ssh
   ```
4. Firewall: allow only SSH, HTTP and HTTPS. Neo4j (7474, 7687) and the app (3001) stay unreachable from the network.
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80,443/tcp
   sudo ufw enable
   ```
5. Turn on automatic security updates and brute-force protection:
   ```bash
   sudo apt install -y unattended-upgrades fail2ban
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

---

## Phase 4: Install Node 22, Neo4j Community, Caddy

### Node 22 LTS and build tools (for bcrypt and sqlite3)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 sqlite3 git
node -v   # should print v22.x
```

### Neo4j Community
```bash
sudo mkdir -p /etc/apt/keyrings
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/neotechnology.gpg
echo 'deb [signed-by=/etc/apt/keyrings/neotechnology.gpg] https://debian.neo4j.com stable latest' | sudo tee /etc/apt/sources.list.d/neo4j.list
sudo apt update
sudo apt install -y neo4j          # pulls in Java 21
```

Set the password **before the first start**. Use a strong password, not `neo4j`:
```bash
sudo neo4j-admin dbms set-initial-password '<STRONG_PASSWORD>'
```

Edit `/etc/neo4j/neo4j.conf` to keep Neo4j on localhost and give it a small memory budget:
```
server.default_listen_address=127.0.0.1
server.memory.heap.initial_size=1g
server.memory.heap.max_size=1g
server.memory.pagecache.size=512m
```

Start it:
```bash
sudo systemctl enable --now neo4j
sudo systemctl status neo4j
```

### Caddy (reverse proxy, automatic HTTPS later)
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

---

## Phase 5: Load the data into local Neo4j

1. Copy the export to the server. On your laptop:
   ```bash
   scp all.cypher monish@10.10.16.43:~/
   ```
2. Load it into the empty database:
   ```bash
   cypher-shell -u neo4j -p '<STRONG_PASSWORD>' -f ~/all.cypher
   ```
3. Verify. The counts must match what you wrote down in Phase 0:
   ```bash
   cypher-shell -u neo4j -p '<STRONG_PASSWORD>' "MATCH (n) RETURN count(n);"
   cypher-shell -u neo4j -p '<STRONG_PASSWORD>' "MATCH ()-[r]->() RETURN count(r);"
   ```

---

## Phase 6: Deploy the app

### Layout on the server (mirrors the Mac's `new/` folder)
```
/srv/beh/
  v4/            git repo
  db/backups/    snapshot JSON (needed by ARCHIVE_SNAPSHOT)
  backups/       nightly backup output (Phase 8)
```

```bash
sudo mkdir -p /srv/beh/db/backups /srv/beh/backups
sudo chown -R monish:monish /srv/beh
cd /srv/beh
git clone <REPO_URL> v4          # private repo: use a GitHub deploy key or token
```

If you can't clone, rsync from the Mac over the campus LAN instead:
```bash
rsync -av --exclude node_modules --exclude build v4/ monish@10.10.16.43:/srv/beh/v4/
```

Copy the files that live outside git. On your Mac:
```bash
scp db/backups/archive_backup_2026-09-14.json monish@10.10.16.43:/srv/beh/db/backups/
scp v4/backend/users.db monish@10.10.16.43:/srv/beh/v4/backend/   # keeps existing accounts
```

### Build
```bash
cd /srv/beh/v4/frontend && npm ci && npm run build     # leave REACT_APP_API_URL unset
cd /srv/beh/v4/backend  && npm ci
cp .env.example .env
```

### `.env` (in `/srv/beh/v4/backend/.env`)

> **Warning:** generate a NEW `JWT_SECRET`. The development secret is committed in
> `start.sh`, so anyone who has seen the repo could forge login tokens with it.
> Never use `start.sh` in production.

```bash
openssl rand -hex 32     # paste the output as JWT_SECRET
```

```
JWT_SECRET=<output of openssl rand -hex 32>
ARCHIVE_NEO4J_URI=neo4j://localhost:7687
ARCHIVE_NEO4J_USERNAME=neo4j
ARCHIVE_NEO4J_PASSWORD=<STRONG_PASSWORD>
SYSADMIN_EMAILS=<...>
ADMIN_EMAILS=<...>
MODERATOR_EMAILS=<...>
GROQ_API_KEY=<...>
PORT=3001
NODE_ENV=production
SERVE_FRONTEND=true
TRUST_PROXY=1
ARCHIVE_SNAPSHOT=/srv/beh/db/backups/archive_backup_2026-09-14.json
ARCHIVE_LIVE_SNAPSHOT=/srv/beh/db/backups/archive_live_snapshot.json
```

`TRUST_PROXY` is required behind Caddy. Without it, every visitor appears as 127.0.0.1 and
the login rate limit locks everyone out at once. Check `.env.example` for the exact expected
value format.

### Remove the stale Aura connection from `users.db`

> **Security:** the NeoViz tool's saved connection stores the Aura password in plain text.
> Delete it, then change or retire the Aura password.

```bash
sqlite3 /srv/beh/v4/backend/users.db "SELECT * FROM connections;"
sqlite3 /srv/beh/v4/backend/users.db "DELETE FROM connections WHERE <condition from above>;"
```

### systemd service: `/etc/systemd/system/beh.service`
```ini
[Unit]
Description=BeH archive (Express + React)
After=network.target neo4j.service
Wants=neo4j.service

[Service]
User=monish
WorkingDirectory=/srv/beh/v4/backend
# .env is loaded by the app itself (dotenv), from WorkingDirectory
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now beh
sudo systemctl status beh
curl -I http://127.0.0.1:3001      # should return 200
journalctl -u beh -f               # live logs
```

---

## Phase 7: Caddy in front of the app

### Campus-only for now (plain HTTP): `/etc/caddy/Caddyfile`
```
:80 {
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

Test from another device on campus: `http://10.10.16.43`.

### Once public access exists (domain + ports 80/443 open from the internet)
```
archive.example.org {
    reverse_proxy 127.0.0.1:3001
}
```
Caddy then fetches and renews HTTPS certificates automatically.

> **Security:** until HTTPS is on, passwords and login tokens travel in plain text. That is
> acceptable on the campus LAN for testing, never on the public internet.

### Before the site is reachable by anyone else
- [ ] Register the sysadmin and admin email accounts yourself. There is no email
      verification, so whoever signs up first with one of those emails gets that role.

---

## Phase 8: Backups and remote access

### Off-machine backups (Google Drive via rclone)
Run `rclone config` as root, because cron runs the backup as root. The machine has no
browser, so when asked to authorize, run `rclone authorize "drive"` on your laptop and paste
the token back. Name the remote `gdrive`.
```bash
sudo apt install -y rclone
sudo rclone config
```

`/usr/local/bin/beh-backup.sh`:
```bash
#!/bin/bash
set -euo pipefail
STAMP=$(date +%F)
DEST=/srv/beh/backups/$STAMP
mkdir -p "$DEST"

# SQLite: safe copy while the app is running
sqlite3 /srv/beh/v4/backend/users.db ".backup '$DEST/users.db'"

# Uploads
tar -czf "$DEST/uploads.tgz" -C /srv/beh/v4/backend uploads

# Neo4j Community can only dump while stopped (about 1 min; the site falls back to the snapshot)
install -d -o neo4j -g neo4j "$DEST/neo4j"
systemctl stop neo4j
sudo -u neo4j neo4j-admin database dump neo4j --to-path="$DEST/neo4j"
systemctl start neo4j

# Ship off the machine, then keep 14 days locally
rclone copy "$DEST" "gdrive:beh-backups/$STAMP"
find /srv/beh/backups -mindepth 1 -maxdepth 1 -mtime +14 -exec rm -rf {} +
```

```bash
sudo chmod +x /usr/local/bin/beh-backup.sh
sudo /usr/local/bin/beh-backup.sh          # test once by hand
sudo crontab -e
# add:
30 3 * * * /usr/local/bin/beh-backup.sh >> /var/log/beh-backup.log 2>&1
```

Test a restore at least once. A backup you have never restored is not a backup.

### Remote access from off campus (for example, winter break)
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Install Tailscale on your laptop too. You can then `ssh monish@rakshak` from anywhere.

---

## Making the site public: options in order of preference

1. **IIIT IT exposes it (best).** Public DNS for the hostname, plus ports 80/443 opened through
   their firewall or reverse proxy. This is the official route and the right one for an
   institute archive. IT can take weeks, so start now.
2. **Cloudflare Tunnel (stopgap).** The box opens an outbound connection to Cloudflare, so no
   inbound ports are needed. It needs your own domain (about ₹800/year). Get Prof. Kamal's OK
   first: it goes around the campus firewall and may break IIIT IT policy.
3. **Cheap cloud server (fallback if IT says no).** About $5/month. Keep the mini PC as staging
   and backup.

### Draft email for Prof. Kamal to send to IIIT IT
> Subject: Public access for research archive server (3rakshak.iiit.ac.in)
>
> Hello,
>
> My lab's machine 3rakshak.iiit.ac.in (10.10.16.43, asset IIIT/CDE/ASEA/CPU/2025-1) will host
> the BeH literary archive website. Could you please make it reachable from outside campus:
> a public DNS record for the hostname, and inbound TCP ports 80 and 443 allowed to this
> machine (via NAT, firewall rule or your reverse proxy)? HTTPS certificates will be handled
> on the server. My student Monishram S. is handling the setup and can share any details you need.
>
> Thanks,
> Prof. Kamal

---

## Final checklist

- [ ] Local counts match Aura (Phase 0 vs Phase 5)
- [ ] Site loads at `http://10.10.16.43` from another campus device
- [ ] Login works; admin and sysadmin accounts registered by us
- [ ] A correction submitted through the site shows up in local Neo4j
- [ ] Reboot test: `sudo reboot`, and the site comes back on its own
- [ ] Power-cut test: pull the plug, plug it back in, and the box boots by itself
- [ ] Backup ran, files are in Google Drive, and one restore has been tested
- [ ] `ssh monish@rakshak` works over Tailscale from a hotspot
- [ ] Aura password changed or retired, and the old saved connection deleted

## Open decisions

| Question | Owner |
|---|---|
| Public or campus-only? | Prof. Kamal |
| Who in IIIT IT handles DNS, firewall and TLS? | Prof. Kamal / IT |
| Keep the NeoViz tool (and Groq) in production? Default: keep it, sysadmin-only | Monish |
