--[[
AI Call Handler for FreeSWITCH
Connects to Deno Deploy WebSocket (sifucall.deno.dev) for AI processing
Mimics Twilio Media Stream format for compatibility
Azure STT (ms-MY) -> OpenRouter GPT-4o-mini -> ElevenLabs TTS
]]--

-- Configuration
local DENO_DEPLOY_WS_URL = "wss://sifucall.deno.dev"

-- Get session parameters from channel variables
local uuid = session:getVariable("uuid")
local campaign_id = session:getVariable("campaign_id") or ""
local user_id = session:getVariable("user_id") or ""
local prompt_id = session:getVariable("prompt_id") or ""
local phone_number = session:getVariable("destination_number") or session:getVariable("caller_id_number")
local customer_name = session:getVariable("customer_name") or ""

freeswitch.consoleLog("INFO", "🤖 AI Call Handler Starting\n")
freeswitch.consoleLog("INFO", "UUID: " .. uuid .. "\n")
freeswitch.consoleLog("INFO", "Campaign ID: " .. campaign_id .. "\n")
freeswitch.consoleLog("INFO", "User ID: " .. user_id .. "\n")
freeswitch.consoleLog("INFO", "Phone: " .. phone_number .. "\n")
freeswitch.consoleLog("INFO", "Customer: " .. customer_name .. "\n")

-- Answer the call
session:answer()
session:sleep(500)

-- Start recording
local recording_path = "/var/lib/freeswitch/recordings/" .. uuid .. ".wav"
session:execute("record_session", recording_path)

-- Build WebSocket URL with parameters (mimicking Twilio format)
local ws_params = "callSid=" .. uuid ..
                  "&streamSid=stream_" .. uuid ..
                  "&user_id=" .. user_id ..
                  "&campaign_id=" .. campaign_id ..
                  "&prompt_id=" .. prompt_id ..
                  "&phone_number=" .. phone_number ..
                  "&customer_name=" .. customer_name

local ws_url = DENO_DEPLOY_WS_URL .. "?" .. ws_params

freeswitch.consoleLog("INFO", "🔌 Connecting to: " .. ws_url .. "\n")

-- Send "start" event (Twilio format) to initialize session
local start_event = string.format([[
{
  "event": "start",
  "streamSid": "stream_%s",
  "start": {
    "streamSid": "stream_%s",
    "callSid": "%s",
    "customParameters": {
      "user_id": "%s",
      "campaign_id": "%s",
      "prompt_id": "%s",
      "phone_number": "%s",
      "customer_name": "%s"
    },
    "mediaFormat": {
      "encoding": "audio/x-mulaw",
      "sampleRate": 8000,
      "channels": 1
    }
  },
  "sequenceNumber": "1"
}
]], uuid, uuid, uuid, user_id, campaign_id, prompt_id, phone_number, customer_name)

-- Use FreeSWITCH's built-in WebSocket audio streaming
-- This will handle bidirectional audio with the Deno edge function
session:execute("socket", ws_url .. " full")

-- Cleanup
freeswitch.consoleLog("INFO", "✅ Call ended, recording saved to: " .. recording_path .. "\n")

-- The Deno function handles:
-- 1. Receiving 8kHz µ-law audio from FreeSWITCH
-- 2. Azure STT (ms-MY Malaysian Malay)
-- 3. OpenRouter GPT-4o-mini (streaming)
-- 4. ElevenLabs TTS (eleven_flash_v2_5)
-- 5. Sending µ-law audio back to FreeSWITCH
-- 6. Uploading recording to Supabase Storage
-- 7. Saving CDR to Supabase database
