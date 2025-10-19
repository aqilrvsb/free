--[[
AI Call Handler for FreeSWITCH
Connects to Deno Deploy WebSocket for AI processing
Sends audio to Azure STT -> OpenRouter -> ElevenLabs -> Back to caller
]]--

-- Configuration
local DENO_DEPLOY_WS_URL = os.getenv("DENO_DEPLOY_WS_URL") or "wss://your-project.deno.dev/ai-call-handler-freeswitch"
local SUPABASE_URL = os.getenv("SUPABASE_URL")
local SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

-- Get session parameters
local session = session or event:getHeader("FreeSWITCH-Call-UUID")
local campaign_id = session:getVariable("campaign_id") or ""
local user_id = session:getVariable("user_id") or ""
local prompt_id = session:getVariable("prompt_id") or ""
local destination_number = session:getVariable("destination_number") or ""
local caller_id_number = session:getVariable("caller_id_number") or ""

freeswitch.consoleLog("INFO", "🤖 AI Call Handler Starting\n")
freeswitch.consoleLog("INFO", "Campaign ID: " .. campaign_id .. "\n")
freeswitch.consoleLog("INFO", "Destination: " .. destination_number .. "\n")

-- Answer the call
session:answer()
session:sleep(500)

-- Start recording
local uuid = session:getVariable("uuid")
local recording_path = "/var/lib/freeswitch/recordings/" .. uuid .. ".wav"
session:execute("record_session", recording_path)

-- Create WebSocket connection to Deno Deploy
local ws_url = DENO_DEPLOY_WS_URL .. "?uuid=" .. uuid .. "&campaign_id=" .. campaign_id ..
               "&user_id=" .. user_id .. "&prompt_id=" .. prompt_id

freeswitch.consoleLog("INFO", "Connecting to WebSocket: " .. ws_url .. "\n")

-- Use mod_audio_stream to connect to WebSocket
session:execute("audio_stream", ws_url)

-- Cleanup
freeswitch.consoleLog("INFO", "Call ended, recording saved to: " .. recording_path .. "\n")

-- The Deno function will handle:
-- 1. Receiving audio from FreeSWITCH
-- 2. Sending to Azure STT
-- 3. Getting AI response
-- 4. Converting to speech
-- 5. Sending back to FreeSWITCH
-- 6. Uploading recording to Supabase on call end
