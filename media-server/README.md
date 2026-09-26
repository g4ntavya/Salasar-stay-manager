# Salasar media server

This server stores guest ID photos and keeps a readable archive of every guest. It runs on an Oracle Cloud VM behind nginx with HTTPS, in its own folder, and can share the VM with other projects without touching them.

## Where things are on the VM

```
~/salasar/
  app/                    this folder (server code)
  data/
    guests/YYYY/YYYY-MM/<date> <name> <mobile> [<id>]/
        details.txt  details.json  id-photo-1.jpg …
    guests.csv            every guest, opens in Excel
    photos/<id>/<n>.jpg   originals served to the app
  node/                   private Node.js 22 (not system-wide)
  salasar.env             settings
  service-account.json    Firebase admin key (chmod 600)
```

- **Service:** `salasar-media` (systemd). It listens only on `127.0.0.1:8080`.
- **nginx site:** its own file in `/etc/nginx/sites-available/`, proxying the subdomain to port 8080. The HTTPS certificate is issued by certbot and renews automatically.

## Viewing the archive

- **Web page:** open the server's address in a browser and sign in with an ADMIN app login. From there you can search, view guests and photos, and download a guest's folder, the CSV, or everything as a ZIP.
- **Files directly:** use SFTP (e.g. FileZilla or Cyberduck) with the VM's SSH key, then open `~/salasar/data/`.

## Updating the server

From your Mac, in this repository:

```sh
media-server/deploy/push.sh <user>@<vm-ip> <path/to/ssh-key>
```

This copies the code, installs dependencies and restarts the service. Settings come from `deploy/salasar.env`, which is git-ignored; `deploy/salasar.env.example` shows the format.

## Checking on it

```sh
ssh -i <path/to/ssh-key> <user>@<vm-ip>
sudo journalctl -u salasar-media -f      # live log (uploads, archive sync)
curl http://127.0.0.1:8080/health        # {"ok":true,"guests":N}
```

## Moving to another address

Point the new domain at the VM and add an nginx site plus a certificate for it. Change `PUBLIC_URL` in `deploy/salasar.env`, push, and then run:

```sh
npm run firebase:config -- --media-url https://new.address
```

Run that last command in `frontend/`. Phones switch over without a new app build, and old photo links keep working.

## Backups

The archive is only on this VM's disk. Copy it off now and then, for example:

```sh
rsync -az -e "ssh -i <path/to/ssh-key>" <user>@<vm-ip>:salasar/data/ ~/salasar-backup/
```
