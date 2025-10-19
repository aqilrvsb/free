# Deploying FreeSWITCH Lab to Fly.io

## Important Limitations

This project is designed for Docker Compose with host networking. Fly.io has limitations:

- **Cannot run FreeSWITCH on Fly.io** - Requires host networking for SIP/RTP
- **Cannot run security-agent on Fly.io** - Requires NET_ADMIN capability
- Only the **NestJS backend (app)** and **Portal** can be deployed to Fly.io

## Recommended Architecture

1. **Fly.io**: Deploy the NestJS API backend and NextJS portal
2. **VPS/Dedicated Server**: Run FreeSWITCH and security-agent with Docker or natively
3. **Database**: Use Fly.io Postgres, PlanetScale MySQL, or any external MySQL service

## Prerequisites

1. Install Fly.io CLI:
   ```bash
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex

   # Mac/Linux
   curl -L https://fly.io/install.sh | sh
   ```

2. Login to Fly.io:
   ```bash
   fly auth login
   ```

3. Create a Fly.io account at https://fly.io/app/sign-up

## Step 1: Set up Database

### Option A: Use Fly.io Postgres (converted to MySQL schema)
```bash
fly postgres create --name freeswitch-lab-db --region sin
```

### Option B: Use PlanetScale (MySQL)
1. Sign up at https://planetscale.com
2. Create a new database
3. Get connection string

### Option C: External MySQL
Use any MySQL 8+ service (AWS RDS, DigitalOcean, etc.)

## Step 2: Create Volume for Recordings

```bash
fly volumes create recordings --region sin --size 10
```

## Step 3: Configure Secrets

Set all sensitive environment variables as secrets:

```bash
# Database connection
fly secrets set DB_HOST=your-mysql-host.com
fly secrets set DB_PASSWORD=your-secure-password

# Portal authentication
fly secrets set PORTAL_JWT_SECRET=$(openssl rand -hex 32)
fly secrets set PORTAL_ADMIN_PASSWORD=YourSecurePassword123!

# FreeSWITCH connection (if running on external VPS)
fly secrets set FS_ESL_HOST=your-freeswitch-vps-ip
fly secrets set FS_ESL_PASSWORD=ClueCon

# Security agent (if running on external VPS)
fly secrets set SECURITY_AGENT_URL=http://your-vps-ip:9000
fly secrets set SECURITY_AGENT_TOKEN=$(openssl rand -hex 32)
```

## Step 4: Update fly.toml

Edit `fly.toml` and update:
- `app` name (must be globally unique)
- `primary_region` to your preferred region
- Any other environment variables

## Step 5: Deploy the App

```bash
# Deploy the NestJS backend
fly deploy

# Check status
fly status

# View logs
fly logs
```

## Step 6: Deploy the Portal (Optional)

Create a separate `fly.portal.toml`:

```toml
app = 'freeswitch-lab-portal'
primary_region = 'sin'

[build]
  dockerfile = "docker/portal.Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3001"
  API_BASE_URL = "http://freeswitch-lab-app.internal:3000"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

Set portal secrets:
```bash
fly secrets set NEXT_PUBLIC_API_BASE_URL=https://freeswitch-lab-app.fly.dev -c fly.portal.toml
fly secrets set NEXT_PUBLIC_WS_BASE_URL=https://freeswitch-lab-app.fly.dev -c fly.portal.toml
```

Deploy:
```bash
fly deploy -c fly.portal.toml
```

## Step 7: Set up FreeSWITCH on a VPS

Since FreeSWITCH requires host networking, deploy it on:
- DigitalOcean Droplet
- Hetzner Cloud
- AWS EC2
- Any VPS with public IP

### VPS Setup:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone your repo
git clone <your-repo-url>
cd freeswitch_lab-master

# Create .env file
cp env.example .env
# Edit .env with your Fly.io app URLs and database credentials

# Run only FreeSWITCH and security-agent
docker compose up -d freeswitch security-agent
```

Update your `.env` on the VPS:
```bash
DB_HOST=<your-mysql-host>
DB_PASSWORD=<your-db-password>
EXT_SIP_IP=<your-vps-public-ip>
EXT_RTP_IP=<your-vps-public-ip>
XML_CDR_URL=https://freeswitch-lab-app.fly.dev/fs/cdr
XML_CURL_GATEWAY_URL=https://freeswitch-lab-app.fly.dev/fs/xml
```

## Troubleshooting

### Check app health
```bash
fly status
fly logs
```

### Connect to app console
```bash
fly ssh console
```

### Database connection issues
```bash
# Test from within the app
fly ssh console
node -e "console.log(process.env.DB_HOST)"
```

### Scale the app
```bash
# Add more memory
fly scale memory 2048

# Add more VMs
fly scale count 2
```

## Cost Estimation

- **Fly.io App** (1GB RAM): ~$6-10/month
- **Fly.io Portal** (512MB RAM): ~$3-5/month
- **Fly.io Postgres**: ~$10-15/month
- **Volume (10GB)**: ~$1/month
- **VPS for FreeSWITCH**: $5-20/month (DigitalOcean/Hetzner)

**Total**: ~$25-60/month depending on usage and scaling

## Alternative: All-in-One VPS Deployment

If you want to keep everything together, skip Fly.io and deploy the entire stack on a VPS:

```bash
# On VPS
git clone <your-repo>
cd freeswitch_lab-master
cp env.example .env
# Edit .env
docker compose up -d
```

This is simpler but less scalable than the Fly.io + VPS hybrid approach.
