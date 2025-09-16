# FreeSWITCH + NestJS (mod_xml_curl) — Multi-tenant Dynamic Dialplan/Directory

This repo contains a **FreeSWITCH** container configured to fetch **dialplan & directory** over HTTP from a **NestJS** backend, enabling **dynamic extensions** per tenant.

## Quick start

```bash
# 1) Copy env template
cp .env.example .env
# Edit .env as needed (tenant info, IPs)

# 2) Launch stack
docker compose up --build
```

> On macOS Docker Desktop, you can enable **host networking** in Settings (Docker Desktop ≥ 4.34). If it is unavailable, edit `docker-compose.yml` to replace the FreeSWITCH `network_mode: host` setting with explicit port mappings.

## What’s included
- **FreeSWITCH** with `mod_xml_curl`, `mod_sofia`, `mod_lua`, `mod_opus`.
- **NestJS** app providing `/fs/xml` endpoint generating FreeSWITCH XML for:
  - `section=dialplan` → dynamic extensions (e.g., `9xxx` → `user/xxxx@domain`), PSTN routing
  - `section=directory` → dynamic SIP users per tenant
- **Multi-tenant**-ready: tenants, users, and routes are stored in a simple in-memory `src/data/store.ts` to demo. Replace with DB later.
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
│       │   └── xml_curl.conf.xml
│       └── vars_local.xml
└── app
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    └── src
        ├── main.ts
        ├── app.module.ts
        ├── fs-xml.controller.ts
        ├── fs.service.ts
        └── data
            └── store.ts
```

## Notes
- **External IPs**: We set `external_sip_ip` / `external_rtp_ip` via `vars_local.xml` to `auto`. For production, set explicit public IPs.
- **Gateways**: PSTN examples use gateway `pstn` (configure under `conf/sip_profiles/external/` as needed).
- **Security**: Lock down the Nest endpoint to internal network or mTLS. The demo runs without auth.
- **Mac dev**: Docker Desktop may not support host networking; adjust `docker-compose.yml` to expose the needed UDP/TCP ports if you're not on Linux.
