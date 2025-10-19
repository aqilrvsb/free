# AI Call Pro + FreeSWITCH Integration Guide

This guide explains how to integrate the AI Call Pro frontend with FreeSWITCH backend using AlienVoIP SIP trunk and Deno Deploy edge functions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│            AI Call Pro Frontend (React + Vite)                  │
│                    https://aicallqapro.com                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP POST /ai-calls/initiate
                         │
┌────────────────────────▼────────────────────────────────────────┐
│               NestJS Backend API (Fly.io)                       │
│         https://free-a--lma-silent-pine-5957.fly.dev            │
│                                                                 │
│  POST /ai-calls/initiate - Initiate AI call                    │
│  POST /ai-calls/batch - Batch AI calls                         │
│  GET  /ai-calls/status - Get call status                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ FreeSWITCH ESL Command
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  FreeSWITCH Server (VPS)                        │
│                                                                 │
│  ┌──────────────┐       ┌──────────────┐                       │
│  │ AlienVoIP    │       │ Lua Script   │                       │
│  │ SIP Gateway  │──────►│ ai_call_     │                       │
│  │              │       │ handler.lua  │                       │
│  └──────────────┘       └──────┬───────┘                       │
│         │                      │                               │
│         │ Outbound Call        │ WebSocket                     │
│         │                      │                               │
└─────────┼──────────────────────┼───────────────────────────────┘
          │                      │
          │                      │
    ┌─────▼──────┐      ┌────────▼──────────────────────┐
    │  Phone     │      │  Deno Deploy Edge Function    │
    │  Network   │      │  (ai-call-handler-freeswitch) │
    └────────────┘      │                                │
                        │  - Azure STT (Malay)           │
                        │  - OpenRouter GPT-4o-mini      │
                        │  - ElevenLabs TTS              │
                        └────────┬───────────────────────┘
                                 │
                        ┌────────▼───────────┐
                        │  Supabase          │
                        │  - Database (CDRs) │
                        │  - Storage (Audio) │
                        └────────────────────┘
```

## Components

### 1. AlienVoIP SIP Gateway (FreeSWITCH)

**File**: `freeswitch/conf/sip_profiles/external/alienvoip.xml`

Configuration for AlienVoIP SIP trunk:
- **Primary SIP Proxy**: sip1.alienvoip.com
- **Secondary SIP Proxy**: sip3.alienvoip.com
- **Username**: 646006395
- **Password**: Xh7Yk5Ydcg
- **Supported Codecs**: G729, G723, GSM, ULAW

### 2. Lua Call Handler (FreeSWITCH)

**File**: `freeswitch/conf/scripts/ai_call_handler.lua`

Handles call flow:
1. Answers the call
2. Starts recording
3. Connects to Deno Deploy WebSocket
4. Streams audio bidirectionally
5. Saves recording on call end

### 3. NestJS API (Backend)

**Files**:
- `app/src/ai-calls/ai-calls.controller.ts` - REST API endpoints
- `app/src/ai-calls/ai-calls.service.ts` - FreeSWITCH ESL integration

**Endpoints**:
```typescript
POST /ai-calls/initiate
Body: {
  campaignId: string;
  userId: string;
  promptId: string;
  phoneNumber: string;
  callerId?: string;
}

POST /ai-calls/batch
Body: {
  campaignId: string;
  userId: string;
  promptId: string;
  phoneNumbers: string[];
  callerId?: string;
  concurrent?: number;
}

GET /ai-calls/status?uuid={call-uuid}
```

### 4. Deno Deploy Edge Function

**Location**: `supabase/functions/ai-call-handler-freeswitch/`

Handles real-time AI processing:
- Receives audio from FreeSWITCH via WebSocket
- Converts speech to text (Azure STT - Malay language)
- Gets AI response (OpenRouter GPT-4o-mini)
- Converts text to speech (ElevenLabs)
- Sends audio back to FreeSWITCH
- Uploads recording to Supabase Storage

## Setup Instructions

### Step 1: Deploy NestJS Backend to Fly.io

```bash
cd freeswitch_lab-master
flyctl deploy -a free-a--lma-silent-pine-5957

# Set environment variables
flyctl secrets set DENO_DEPLOY_WS_URL=wss://your-project.deno.dev/ai-call-handler-freeswitch -a free-a--lma-silent-pine-5957
flyctl secrets set SUPABASE_URL=https://your-project.supabase.co -a free-a--lma-silent-pine-5957
flyctl secrets set SUPABASE_ANON_KEY=your-anon-key -a free-a--lma-silent-pine-5957
```

### Step 2: Deploy FreeSWITCH to VPS

```bash
# On your VPS
cd freeswitch_lab-master

# Update .env with AlienVoIP credentials
cat >> .env << EOF
# Deno Deploy WebSocket
DENO_DEPLOY_WS_URL=wss://your-project.deno.dev/ai-call-handler-freeswitch

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
EOF

# Start FreeSWITCH
docker compose up -d freeswitch
```

### Step 3: Deploy Deno Edge Function

```bash
cd welcome-starter-html-main

# Deploy to Deno Deploy
supabase functions deploy ai-call-handler-freeswitch

# Or deploy to Deno Deploy (if using Deno Deploy directly)
deployctl deploy --project=your-project
```

### Step 4: Configure AI Call Pro Frontend

Update your frontend to call the NestJS API:

```typescript
// src/services/aiCallService.ts
const API_BASE_URL = 'https://free-a--lma-silent-pine-5957.fly.dev';

export async function initiateAICall(params: {
  campaignId: string;
  promptId: string;
  phoneNumber: string;
}) {
  const response = await fetch(`${API_BASE_URL}/ai-calls/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourAuthToken}`,
    },
    body: JSON.stringify({
      ...params,
      userId: 'your-user-id',
    }),
  });

  return response.json();
}
```

## Environment Variables

### FreeSWITCH (.env)
```env
FS_ESL_HOST=127.0.0.1
FS_ESL_PORT=8021
FS_ESL_PASSWORD=ClueCon
DENO_DEPLOY_WS_URL=wss://your-project.deno.dev/ai-call-handler-freeswitch
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Deno Deploy (Supabase Secrets)
```env
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=southeastasia
OPENROUTER_API_KEY=your-openrouter-key
ELEVENLABS_API_KEY=your-elevenlabs-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Testing

### 1. Test AlienVoIP Gateway Registration

```bash
# From FreeSWITCH CLI
fs_cli
> sofia status gateway alienvoip

# Should show: State: REGED
```

### 2. Test Single AI Call

```bash
curl -X POST https://free-a--lma-silent-pine-5957.fly.dev/ai-calls/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "campaignId": "test-campaign",
    "userId": "user-123",
    "promptId": "prompt-456",
    "phoneNumber": "60123456789",
    "callerId": "60199999999"
  }'
```

### 3. Test Batch Calls

```bash
curl -X POST https://free-a--lma-silent-pine-5957.fly.dev/ai-calls/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "campaignId": "batch-campaign",
    "userId": "user-123",
    "promptId": "prompt-456",
    "phoneNumbers": ["60123456789", "60198765432"],
    "concurrent": 2
  }'
```

## Call Flow

1. **Frontend** sends POST to `/ai-calls/initiate`
2. **NestJS Backend** sends ESL command to FreeSWITCH
3. **FreeSWITCH** originates call via AlienVoIP gateway
4. **AlienVoIP** connects call to destination number
5. **Lua Script** starts recording and connects to Deno WebSocket
6. **Deno Function** handles AI conversation:
   - Receives audio from FreeSWITCH
   - Converts to text (Azure STT)
   - Gets AI response (OpenRouter)
   - Converts to speech (ElevenLabs)
   - Sends audio back to FreeSWITCH
7. **On hangup**: Recording uploaded to Supabase
8. **CDR** saved to Supabase database

## Monitoring

### Check FreeSWITCH Logs
```bash
docker logs -f fs-core --tail=100
```

### Check NestJS Logs
```bash
flyctl logs -a free-a--lma-silent-pine-5957
```

### Check Deno Function Logs
```bash
supabase functions logs ai-call-handler-freeswitch
```

### Query CDRs in Supabase
```sql
SELECT * FROM call_logs
WHERE campaign_id = 'your-campaign'
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

### Gateway Not Registering
```bash
# Check FreeSWITCH logs
fs_cli -x "sofia status"
fs_cli -x "sofia loglevel all 9"

# Verify credentials in alienvoip.xml
# Check firewall allows UDP 5060
```

### No Audio / WebSocket Issues
```bash
# Verify Deno Deploy URL is accessible
curl -I https://your-project.deno.dev/ai-call-handler-freeswitch

# Check Lua script permissions
ls -la /etc/freeswitch/scripts/ai_call_handler.lua

# Verify mod_audio_stream is loaded
fs_cli -x "module_exists mod_audio_stream"
```

### Calls Not Initiating
```bash
# Check ESL connection from NestJS
# Verify FS_ESL_* environment variables
# Test ESL manually:
fs_cli
> originate sofia/gateway/alienvoip/60123456789 &echo()
```

## Cost Optimization

- **Azure STT**: ~$1 per hour of audio
- **OpenRouter GPT-4o-mini**: ~$0.00015 per 1K tokens
- **ElevenLabs**: ~$0.30 per 1K characters
- **AlienVoIP**: Check your plan rates

**Estimated cost per minute**: $0.05 - $0.10 per call minute

## Next Steps

1. ✅ AlienVoIP gateway configured
2. ✅ Lua call handler created
3. ✅ NestJS API endpoints added
4. 🔲 Deploy to production
5. 🔲 Test end-to-end flow
6. 🔲 Monitor and optimize

---

**Support**: For issues, check the logs in each component and verify all environment variables are set correctly.

**Repository**: https://github.com/aqilrvsb/free
