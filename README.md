# FreeSWITCH + NestJS (mod_xml_curl) — Multi-tenant Dynamic Dialplan/Directory + MySQL CDR

This repo contains a **FreeSWITCH** container configured to fetch **dialplan & directory** over HTTP from a **NestJS** backend, enabling **dynamic extensions** per tenant.

## Quick start

```bash
# 1) Copy env template
cp .env.example .env
# Edit .env as needed (tenant info, IPs, DB creds)
# Ensure DB_HOST points to the external MySQL service you want to reuse.

# 2) Launch stack (reusing external MySQL)
docker compose up --build

# Optional: include the bundled MySQL service
docker compose -f docker-compose.yml -f docker-compose.local-db.yml up --build
```

> On macOS Docker Desktop, you can enable **host networking** in Settings (Docker Desktop ≥ 4.34). If it is unavailable, edit `docker-compose.yml` to replace the FreeSWITCH `network_mode: host` setting with explicit port mappings.

## What’s included
- **MySQL 8** datastore managed via TypeORM (tenants, users, routing, CDR records); reuse an external instance or add the bundled container when needed.
- **FreeSWITCH** with `mod_xml_curl`, `mod_xml_cdr`, `mod_sofia`, `mod_lua`, `mod_opus`.
- **NestJS** app providing `/fs/xml` endpoint generating FreeSWITCH XML for:
  - `section=dialplan` → dynamic extensions (e.g., `9xxx` → `user/xxxx@domain`), PSTN routing
  - `section=directory` → dynamic SIP users per tenant
- **CDR ingest**: FreeSWITCH posts JSON CDRs to `/fs/cdr` (shared-secret header), stored in MySQL.
- **CDR/Recording APIs**: retrieve call records via `/cdr` and download recordings via `/recordings`.
- **Demo data seeding**: optional bootstrap (`SEED_DEMO_DATA=true`) populates sample tenants/users/routing on first run.
- **Compose setup**: FreeSWITCH runs with host networking by default; adapt the service definition if you need standard port mappings.

## Test it
1. Launch stack.
2. From within the FreeSWITCH container (or `fs_cli`):
   ```bash
   # Check status
   fs_cli -x 'status'
   # Try an in-app user call (creates dynamic extension 9xxx → user/1001)
   fs_cli -x "originate user/1001@tenant1.local 9999 XML context_tenant1"
   # Or bridge to user by number:
   fs_cli -x "originate loopback/91001/default &echo()"
   ```
3. To see XML that FreeSWITCH fetches:
   - `curl 'http://localhost:3000/fs/xml?section=dialplan&destination_number=91001&context=context_tenant1&domain=tenant1.local'`
   - `curl 'http://localhost:3000/fs/xml?section=directory&user=1001&domain=tenant1.local'`
4. Inspect stored CDRs (requires bundled MySQL override):
   ```bash
   docker exec -it fs-mysql mysql -ufsapp -pfsapp freeswitch -e "SELECT call_uuid, from_number, to_number, duration_seconds, hangup_cause, received_at FROM cdr_records ORDER BY received_at DESC LIMIT 5;"
   ```
   > Skip this step if you are pointing at an external database and use your normal MySQL client instead.
5. Query management APIs:
   ```bash
   curl http://localhost:3000/fs/status
   curl "http://localhost:3000/cdr?page=1&pageSize=10"
   curl http://localhost:3000/recordings
   ```

> The above curl calls emulate what `mod_xml_curl` would request. Adjust parameters to your test scenario.

## Project structure
```
.
├── docker-compose.yml
├── .env.example
├── docker
│   ├── app.Dockerfile
│   └── freeswitch.Dockerfile
├── freeswitch
│   └── conf
│       ├── autoload_configs
│       │   ├── event_socket.conf.xml
│       │   ├── modules.conf.xml
│       │   ├── xml_cdr.conf.xml
│       │   └── xml_curl.conf.xml
│       └── vars_local.xml
└── app
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    └── src
        ├── app.module.ts
        ├── cdr.controller.ts
        ├── cdr.service.ts
        ├── demo-seed.service.ts
        ├── entities/
        │   ├── cdr.entity.ts
        │   ├── index.ts
        │   ├── routing-config.entity.ts
        │   ├── tenant.entity.ts
        │   └── user.entity.ts
        ├── fs-xml.controller.ts
        ├── fs.service.ts
        ├── main.ts
        └── data/
            └── seed-data.ts
```

## Notes
- **External IPs**: We set `external_sip_ip` / `external_rtp_ip` via `vars_local.xml` to `auto`. For production, set explicit public IPs.
- **Gateways**: PSTN examples use gateway `pstn` (configure under `conf/sip_profiles/external/` as needed).
- **Database config**: override DB settings via `.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SYNC`, `DB_LOGGING`). Disable demo seed with `SEED_DEMO_DATA=false`.
- **Local MySQL option**: run `docker compose -f docker-compose.yml -f docker-compose.local-db.yml up` if you need a sandboxed MySQL container inside the stack.
- **CDR security**: set `CDR_HTTP_HEADERS` in `.env` if you need FreeSWITCH to send extra HTTP headers (for example `Authorization: Basic ...`) with each CDR webhook.
- **FreeSWITCH management**: set `FS_ESL_HOST`, `FS_ESL_PORT`, and `FS_ESL_PASSWORD` so the Nest app can reach the FreeSWITCH Event Socket; recordings directory is mapped via `RECORDINGS_DIR`.
- **API security**: lock down `/fs/xml` and `/fs/cdr` (network ACL, reverse proxy auth, or mTLS) before exposing publicly.
- **Mac dev**: Docker Desktop may not support host networking; adjust `docker-compose.yml` to expose the needed UDP/TCP ports if you're not on Linux.
