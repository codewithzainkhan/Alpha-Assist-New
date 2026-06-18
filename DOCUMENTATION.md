# Alpha Assist — API Documentation

**Base URL:** `http://localhost:8000` (dev) / `https://api.yourdomain.com` (prod)  
**All endpoints are prefixed with `/api`**  
**API version:** 2.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Error Responses](#error-responses)
3. [Rate Limiting & Usage Limits](#rate-limiting--usage-limits)
4. [Chat](#chat)
5. [Tasks](#tasks)
6. [Goals](#goals)
7. [Voice Chat](#voice-chat)
8. [Image Chat](#image-chat)
9. [Voice Cloning](#voice-cloning)
10. [Tone Personalisation](#tone-personalisation)
11. [Calls & WhatsApp](#calls--whatsapp)
12. [Account](#account)
13. [Data Models](#data-models)
14. [Twilio Webhooks](#twilio-webhooks)

---

## Authentication

Every endpoint (except Twilio webhooks and `GET /`) requires a valid Supabase JWT.

**Header:**
```
Authorization: Bearer <supabase_access_token>
```

The token is obtained from Supabase Auth on the frontend after login. The backend verifies it using `SUPABASE_JWT_SECRET` (HS256, audience `authenticated`) and extracts the `user_id` from the `sub` claim.

**Failure responses:**

| Status | Detail |
|---|---|
| `401` | `"Not authenticated"` — header missing or token invalid/expired |

---

## Error Responses

All errors follow FastAPI's default shape:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request — invalid input |
| `401` | Unauthorised — missing or invalid JWT |
| `403` | Forbidden — subscription tier does not allow this action |
| `404` | Resource not found |
| `413` | Payload too large |
| `415` | Unsupported media type |
| `422` | Validation error — request body fails schema |
| `429` | Rate limit or daily usage limit exceeded |
| `500` | Internal server error |

---

## Rate Limiting & Usage Limits

### Per-request rate limit
30 requests per minute per user, enforced in Redis.  
Exceeding returns `429 "Rate limit exceeded. Try again in a minute."`.

### Daily usage limits (subscription tiers)

| Mode | Basic | Standard | Premium |
|---|---|---|---|
| Text messages | 60/day | 100/day | Unlimited |
| Voice messages | 10/day | 50/day | Unlimited |
| Image analyses | 10/day | 10/day | Unlimited |

Exceeding returns `429` with a message describing the limit and upgrade path.

### Resource limits

| Resource | Basic | Standard | Premium |
|---|---|---|---|
| Active tasks | 10 | 50 | Unlimited |
| Active goals | 5 | 20 | Unlimited |

Exceeding returns `403` with the limit message.

---

## Chat

### POST `/api/chat`

Send a text message and receive an AI response. Detects intent, retrieves RAG context, optionally performs a real-time web search, and executes task/goal actions embedded in the response.

**Request body:**
```json
{
  "message": "Create a task to call the dentist tomorrow at 3pm",
  "conversation_id": "uuid-string-optional"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | User's message |
| `conversation_id` | UUID string | No | Associates the message with an existing conversation |

**Response `200`:**
```json
{
  "response": "I've scheduled your dentist call for tomorrow at 3pm!",
  "intent": "task_create",
  "action_result": {
    "id": "task-uuid",
    "task_name": "Call dentist",
    "scheduled_date": "2026-05-18",
    "scheduled_time": "15:00",
    "status": "pending",
    "action": "create_task"
  },
  "action_taken": "create_task"
}
```

| Field | Type | Description |
|---|---|---|
| `response` | string | AI reply (clean text, action JSON stripped) |
| `intent` | string | Detected intent (see [Intents](#intents)) |
| `action_result` | object \| null | Database row returned by the executed action, if any |
| `action_taken` | string \| null | Action type string if an action was executed |

---

### POST `/api/chat/stream`

Streaming version of `/api/chat`. Returns tokens as Server-Sent Events.

**Request body:** Same as `POST /api/chat`.

**Response** — `text/event-stream`:

Each token:
```
data: {"c":"Hello"}

data: {"c":" there"}
```

Action confirmation (after streaming completes):
```
data: {"confirm":"✅ Task created!","task":{...task object...}}
```

Action failure:
```
data: {"confirm":"❌ Could not create the task. Please try again."}
```

Stream end:
```
data: [DONE]
```

LLM error:
```
data: {"error":true}
```

---

### GET `/api/chat-history`

Fetch the user's message history across all conversations.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Number of messages to return (max 200) |

**Response `200`:** Array of message objects, ordered oldest-first.
```json
[
  {
    "id": "msg-uuid",
    "role": "user",
    "content": "What are my tasks for tomorrow?",
    "message_type": "text",
    "created_at": "2026-05-17T10:00:00Z",
    "conversation_id": "conv-uuid",
    "image_url": null,
    "user_prompt": null,
    "audio_url": null
  },
  {
    "id": "msg-uuid-2",
    "role": "assistant",
    "content": "You have 2 tasks tomorrow...",
    "message_type": "text",
    "created_at": "2026-05-17T10:00:01Z",
    "conversation_id": "conv-uuid",
    "image_url": null,
    "user_prompt": null,
    "audio_url": null
  }
]
```

For `message_type: "image"` user messages, `image_url` and `user_prompt` are populated.  
For `message_type: "voice"` messages, `audio_url` is populated (signed 1-hour URL).

---

### DELETE `/api/chat-history`

Clear all messages and Redis conversation cache for the authenticated user.

**Response `200`:**
```json
{"status": "cleared"}
```

---

### POST `/api/chat/refresh-context`

Force-rebuild the system prompt cache (useful after profile updates).

**Response `200`:**
```json
{"system_prompt_length": 2847}
```

---

### GET `/api/conversations`

List all conversations for the user, newest first.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Max conversations to return |

**Response `200`:**
```json
[
  {
    "id": "conv-uuid",
    "title": "Create a task to call the dentist…",
    "created_at": "2026-05-17T10:00:00Z"
  }
]
```

The `title` is automatically set from the first message in the conversation (up to 60 characters, truncated on a word boundary).

---

### POST `/api/conversations`

Create a new conversation and return its ID.

**Response `200`:**
```json
{"id": "conv-uuid"}
```

---

### DELETE `/api/conversations/{id}`

Delete a conversation by UUID (cascades to its messages), or delete all messages for a date.

**Path parameter:** `id` — either a conversation UUID or a date string `YYYY-MM-DD`.

**Response `200`:**
```json
{"deleted": true}
```

---

### GET `/api/subscription/usage`

Get today's usage counts and limits for the authenticated user.

**Response `200`:**
```json
{
  "tier": "standard",
  "usage": {
    "text":  {"used": 12, "limit": 100},
    "voice": {"used": 3,  "limit": 50},
    "image": {"used": 1,  "limit": 10}
  }
}
```

`limit: null` means unlimited (Premium tier).

---

## Tasks

All task endpoints are prefixed with `/api/tasks`.

### POST `/api/tasks/`

Create a task directly (bypasses AI — use this from the tasks screen).

**Request body:**
```json
{
  "task_name": "Call dentist",
  "task_type": "health",
  "description": "Annual checkup",
  "scheduled_date": "2026-05-20",
  "scheduled_time": "15:00:00",
  "priority": "medium",
  "call_reminder": false,
  "message_reminder": false,
  "whatsapp_reminder": false,
  "reminder_time": null,
  "recurrence": null
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `task_name` | string | Yes | Any string |
| `task_type` | string | Yes | `personal` `work` `health` `shopping` `finance` `other` |
| `description` | string | No | — |
| `scheduled_date` | date `YYYY-MM-DD` | Yes | — |
| `scheduled_time` | time `HH:MM:SS` | Yes | — |
| `priority` | string | No | `low` `medium` `high` (default: `medium`) |
| `call_reminder` | boolean | No | Requires phone number on profile |
| `message_reminder` | boolean | No | — |
| `whatsapp_reminder` | boolean | No | — |
| `reminder_time` | time `HH:MM:SS` | No | Time to send the reminder |
| `recurrence` | string | No | `none` `daily` `weekly` `monthly` |

**Response `201`:** Full task object from database.

**Errors:**
- `403` — active task count is at tier limit

---

### GET `/api/tasks/`

List all tasks for the user.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by `pending` `in_progress` `completed` `cancelled` |
| `priority` | string | Filter by `low` `medium` `high` |

**Response `200`:** Array of task objects, ordered by `scheduled_date` then `scheduled_time`.

---

### GET `/api/tasks/{task_id}`

Get a single task.

**Response `200`:** Task object.  
**Response `404`:** Task not found.

---

### PATCH `/api/tasks/{task_id}`

Update a task. Only send fields you want to change.

**Request body** (all fields optional):
```json
{
  "task_name": "Call dentist — reschedule",
  "scheduled_date": "2026-05-25",
  "status": "completed",
  "priority": "high"
}
```

All fields from `TaskCreate` are patchable, plus:

| Field | Type | Description |
|---|---|---|
| `status` | string | `pending` `in_progress` `completed` `cancelled` |
| `progress` | integer | 0–100 completion percentage |

When `status` is set to `"completed"`, the task is automatically indexed in pgvector for RAG.

**Response `200`:** Updated task object.  
**Response `400`:** No fields provided.  
**Response `404`:** Task not found.

---

### DELETE `/api/tasks/{task_id}`

Delete a task permanently.

**Response `204`:** No content.  
**Response `404`:** Task not found.

---

### POST `/api/tasks/query`

Natural language query about tasks — same pipeline as `/api/chat`. Accepts the same body as `ChatRequest`.

---

## Goals

All goal endpoints are prefixed with `/api/goals`.

### POST `/api/goals/`

Create a goal.

**Request body:**
```json
{
  "goal_name": "Emergency fund",
  "goal_type": "finance",
  "target_amount": 5000.00,
  "current_amount": 0.0,
  "deadline": "2026-12-31",
  "description": "Save 3 months of expenses",
  "message_reminder": false,
  "reminder_frequency": null
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `goal_name` | string | Yes | — |
| `goal_type` | string | Yes | `fitness` `finance` `learning` `personal` `other` |
| `target_amount` | float ≥ 0 | Yes | — |
| `current_amount` | float ≥ 0 | No | Default `0.0` |
| `deadline` | date `YYYY-MM-DD` | Yes | — |
| `description` | string | No | — |
| `message_reminder` | boolean | No | — |
| `reminder_frequency` | string | No | `Daily` `Weekly` `Monthly` (requires `message_reminder: true`) |

**Response `201`:** Full goal object.

**Errors:**
- `403` — active goal count is at tier limit

---

### GET `/api/goals/`

List all goals for the user.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by `active` `completed` `cancelled` |

**Response `200`:** Array of goal objects, ordered by `created_at` descending.

---

### GET `/api/goals/{goal_id}`

Get a single goal.

**Response `200`:** Goal object including `savings_history` array.  
**Response `404`:** Goal not found.

---

### PATCH `/api/goals/{goal_id}`

Update a goal. Only send fields you want to change.

**Request body** (all fields optional):
```json
{
  "deadline": "2027-01-31",
  "status": "completed"
}
```

All `GoalCreate` fields are patchable, plus `status`.

When `status` is set to `"completed"`, the goal is automatically indexed in pgvector.

**Response `200`:** Updated goal object.  
**Response `404`:** Goal not found.

---

### POST `/api/goals/{goal_id}/progress`

Log a progress contribution towards a goal. Adds an entry to `savings_history` and updates `current_amount`. Automatically marks the goal `completed` if `current_amount >= target_amount`.

**Request body:**
```json
{
  "amount": 250.00,
  "note": "Monthly transfer"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | float > 0 | Yes | Amount to add |
| `note` | string | No | Optional note for this entry |

**Response `200`:** Updated goal object with the new `savings_history` entry appended.

---

### DELETE `/api/goals/{goal_id}`

Delete a goal permanently.

**Response `204`:** No content.  
**Response `404`:** Goal not found.

---

## Voice Chat

### POST `/api/voice-chat`

Upload an audio recording, transcribe it, generate an AI response, and return synthesised speech.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | audio file | The user's voice recording. Supported: `.webm` `.mp3` `.wav` `.m4a` `.ogg` |

**Response `200`:**
```json
{
  "transcript": "What tasks do I have today?",
  "response": "You have 3 tasks today: a team standup at 9am...",
  "audio_url": "https://...supabase.co/storage/v1/object/sign/chat-audio/...",
  "audio_base64": "SUQzBAAAAAAAI...",
  "audio_format": "mp3",
  "voice_cloned": false
}
```

| Field | Type | Description |
|---|---|---|
| `transcript` | string | Whisper transcription of the uploaded audio |
| `response` | string | AI text response |
| `audio_url` | string \| null | Signed URL to the synthesised audio file (1-hour expiry) |
| `audio_base64` | string \| null | Base64-encoded audio bytes (fallback for clients that can't use URLs) |
| `audio_format` | string | `"mp3"` or `"wav"` |
| `voice_cloned` | boolean | `true` if XTTS-v2 was used with the user's cloned voice |

**On TTS failure** (audio generation fails but transcription and LLM succeeded):
```json
{
  "transcript": "...",
  "response": "...",
  "audio_url": null,
  "audio_base64": null,
  "voice_cloned": false,
  "tts_error": "error description"
}
```

**Errors:**
- `422` — audio was silent or could not be transcribed
- `500` — transcription failed

---

### GET `/api/voice-history`

Fetch voice message history (both user audio and assistant replies).

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Number of voice messages to return |

**Response `200`:**
```json
[
  {
    "id": "msg-uuid",
    "role": "user",
    "content": "What tasks do I have today?",
    "created_at": "2026-05-17T10:00:00Z"
  },
  {
    "id": "msg-uuid-2",
    "role": "assistant",
    "content": "You have 3 tasks today...",
    "created_at": "2026-05-17T10:00:01Z"
  }
]
```

---

## Image Chat

### POST `/api/image-chat`

Upload an image with an optional question. The image is analysed by GPT-4o vision, then answered by the LLM (with web search if needed).

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | image file | Yes | JPEG, PNG, GIF, or WebP |
| `prompt` | string | No | Optional question about the image |

**Response `200`:**
```json
{
  "image_id": "img-uuid",
  "image_description": "A photo of a grocery receipt showing...",
  "image_url": "https://...supabase.co/storage/v1/object/sign/chat-images/...",
  "response": "Based on your receipt, you spent $47.32 on groceries..."
}
```

| Field | Type | Description |
|---|---|---|
| `image_id` | UUID | ID of the created image_message record |
| `image_description` | string | Vision model's description of the image |
| `image_url` | string \| null | Signed URL to the uploaded image (1-hour expiry) |
| `response` | string | AI response to the image + prompt |

**Errors:**
- `400` — unsupported image type (only JPEG, PNG, GIF, WebP allowed)
- `500` — image analysis failed

---

### GET `/api/image-history`

Fetch image chat history.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Number of records to return |

**Response `200`:**
```json
[
  {
    "image_id": "img-uuid",
    "description": "A photo of a grocery receipt...",
    "user_prompt": "How much did I spend?",
    "response": "You spent $47.32...",
    "image_url": "https://...signed-url...",
    "created_at": "2026-05-17T10:00:00Z"
  }
]
```

---

## Voice Cloning

Voice cloning is available on **Standard and Premium** tiers only. Attempting these endpoints on Basic returns `403`.

### POST `/api/voice-clone/upload`

Upload a voice sample. The audio is converted to mono 22,050 Hz WAV and stored in Supabase Storage. On every subsequent voice chat, the AI will speak in this cloned voice.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | audio file | WAV, MP3, WebM, OGG, or M4A. Max **10 MB**. |

**Tips for best quality:** Use a clear recording, 15–60 seconds long, with minimal background noise.

**Response `201`:**
```json
{
  "message": "Voice sample uploaded and processed successfully.",
  "user_id": "user-uuid",
  "has_voice_profile": true,
  "is_active": true,
  "original_filename": "my_voice.mp3",
  "storage_path": "user-uuid/sample.wav",
  "signed_url": "https://...supabase.co/...",
  "created_at": "2026-05-17T10:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

**Errors:**
- `400` — empty file
- `403` — Basic tier
- `413` — file exceeds 10 MB
- `415` — unsupported audio type

---

### GET `/api/voice-clone/status`

Get the current voice profile status.

**Response `200`** (profile exists):
```json
{
  "user_id": "user-uuid",
  "has_voice_profile": true,
  "is_active": true,
  "original_filename": "my_voice.mp3",
  "storage_path": "user-uuid/sample.wav",
  "signed_url": "https://...signed-url...",
  "created_at": "2026-05-17T10:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

**Response `200`** (no profile):
```json
{
  "user_id": "user-uuid",
  "has_voice_profile": false,
  "is_active": false
}
```

---

### PATCH `/api/voice-clone/toggle`

Enable or disable the cloned voice for this user (toggles `is_active`). When disabled, standard OpenAI TTS is used.

**Response `200`:**
```json
{
  "user_id": "user-uuid",
  "is_active": false,
  "message": "Voice cloning disabled."
}
```

**Errors:**
- `404` — no voice profile exists (upload first)

---

### DELETE `/api/voice-clone/`

Delete the voice profile and remove the sample from Supabase Storage.

**Response `200`:**
```json
{
  "user_id": "user-uuid",
  "message": "Voice profile deleted."
}
```

**Errors:**
- `404` — no voice profile exists

---

## Tone Personalisation

Tone personalisation is available on **Standard and Premium** tiers only. Attempting upload endpoints on Basic returns `403`.

### POST `/api/tone/upload-screenshots`

Upload a single chat screenshot. The AI analyses writing style and updates the tone profile. The profile is used to adjust the assistant's language and communication style.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | image file | JPEG, PNG, or WebP screenshot of a chat conversation |

**Response `200`:**
```json
{
  "message": "Screenshot analysed.",
  "user_id": "user-uuid",
  "tone_summary": "Casual, uses short sentences, frequent emojis...",
  "has_chat_content": true,
  "updated_at": "2026-05-17T10:00:00Z",
  "style_prompt": "Respond in a casual, friendly tone...",
  "chat_content_preview": "Hey what's up...",
  "style_prompt_preview": "Respond in a casual..."
}
```

**Errors:**
- `400` — no file or non-image file
- `403` — Basic tier

---

### POST `/api/tone/upload-screenshots-batch`

Upload up to 5 screenshots in a single request for richer tone analysis.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file1` | image | Yes | First screenshot |
| `file2`–`file5` | image | No | Additional screenshots |

**Response `200`:**
```json
{
  "message": "3 screenshot(s) analysed.",
  "screenshots_analyzed": 3,
  "user_id": "user-uuid",
  "tone_summary": "...",
  "has_chat_content": true,
  "updated_at": "...",
  "style_prompt": "...",
  "chat_content_preview": "...",
  "style_prompt_preview": "..."
}
```

---

### GET `/api/tone/profile`

Get the current tone profile.

**Response `200`** (profile exists):
```json
{
  "user_id": "user-uuid",
  "tone_summary": "Casual, friendly, uses emojis...",
  "has_chat_content": true,
  "updated_at": "2026-05-17T10:00:00Z",
  "style_prompt": "Respond in a casual, friendly tone..."
}
```

**Response `200`** (no profile):
```json
{
  "user_id": "user-uuid",
  "profile": null,
  "message": "No tone profile set yet."
}
```

---

### GET `/api/tone/chat-content`

Get the raw chat content extracted from uploaded screenshots (used for debugging).

**Response `200`:**
```json
{
  "user_id": "user-uuid",
  "chat_content": "Hey what's up\nNot much, just working...",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

---

### DELETE `/api/tone/profile`

Delete the tone profile and all associated chat content. Resets the assistant to the default communication style.

**Response `200`:**
```json
{"message": "Tone profile and chat content deleted."}
```

**Errors:**
- `404` — no tone profile exists

---

## Calls & WhatsApp

### POST `/api/calls/schedule`

Schedule an outbound Twilio reminder call for a task at a specific time.

**Request body:**
```json
{
  "task_id": "task-uuid",
  "task_name": "Call dentist",
  "to_number": "+923001234567",
  "scheduled_datetime": "2026-05-20T15:00:00+05:00"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | Yes | UUID of the task being reminded about |
| `task_name` | string | Yes | Human-readable task name (spoken in greeting) |
| `to_number` | string | Yes | E.164 phone number (e.g. `+923001234567`) |
| `scheduled_datetime` | ISO-8601 string | Yes | Must be in the future |

**Response `200`:**
```json
{
  "status": "scheduled",
  "job_id": "call_task-uuid",
  "run_at": "2026-05-20T10:00:00+00:00"
}
```

**Errors:**
- `400` — invalid datetime or datetime is in the past
- `400` — phone number not in E.164 format

---

### POST `/api/calls/cancel`

Cancel a scheduled reminder call.

**Request body:**
```json
{"task_id": "task-uuid"}
```

**Response `200`:**
```json
{"status": "cancelled"}
```

Returns `{"status": "not_found"}` (still `200`) if no job exists for that task ID.

---

### POST `/api/calls/whatsapp/schedule`

Schedule a WhatsApp reminder message.

**Request body:**
```json
{
  "task_id": "task-uuid",
  "task_name": "Call dentist",
  "to_number": "+923001234567",
  "scheduled_datetime": "2026-05-20T14:45:00+05:00"
}
```

Same fields as `/api/calls/schedule`.

**Response `200`:**
```json
{
  "status": "scheduled",
  "job_id": "wa_task-uuid"
}
```

---

### POST `/api/calls/whatsapp/cancel`

Cancel a scheduled WhatsApp reminder.

**Request body:**
```json
{"task_id": "task-uuid"}
```

**Response `200`:**
```json
{"status": "cancelled"}
```

---

### POST `/api/calls/assistant`

Initiate an on-demand AI assistant call. The user's phone will ring immediately. Once answered, they can talk to the AI about anything — tasks, goals, questions, general conversation.

**Request body:**
```json
{"phone_number": "+923001234567"}
```

**Response `200`:**
```json
{
  "call_sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "calling"
}
```

**Errors:**
- `400` — phone number not in E.164 format

---

### DELETE `/api/calls/assistant/{call_sid}`

End an active assistant call programmatically.

**Response `200`:**
```json
{"ended": true}
```

---

### GET `/api/calls/recordings/{call_sid}`

Retrieve the recording URL for a completed call. Available for up to 24 hours after the call ends.

**Response `200`:**
```json
{
  "recording_sid": "RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "recording_url": "https://api.twilio.com/2010-04-01/Accounts/.../Recordings/RE....mp3",
  "duration": 87
}
```

**Errors:**
- `404` — recording not found or has expired (> 24 hours)

---

## Account

### GET `/api/account/profile`

Get the authenticated user's full profile including subscription tier.

**Response `200`:**
```json
{
  "id": "user-uuid",
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone": "+923001234567",
  "avatar_url": "https://...supabase.co/storage/v1/object/public/avatars/...",
  "gender": null,
  "date_of_birth": null,
  "address": null,
  "city": null,
  "country": null,
  "bio": null,
  "push_token": null,
  "timezone": "Asia/Karachi",
  "subscription_tier": "standard",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

**Errors:**
- `404` — profile row does not exist (created automatically by Supabase trigger on signup)

---

### PATCH `/api/account/tier`

Update the subscription tier.

**Request body:**
```json
{"tier": "premium"}
```

`tier` must be one of: `"basic"` `"standard"` `"premium"`.

**Response `200`:**
```json
{
  "user_id": "user-uuid",
  "subscription_tier": "premium"
}
```

**Errors:**
- `400` — invalid tier value
- `404` — profile not found

---

### DELETE `/api/account`

Permanently delete the user's Supabase Auth account. All application data (conversations, tasks, goals, etc.) must be deleted by the frontend before calling this endpoint. After deletion the user cannot log back in.

**Response `200`:**
```json
{"message": "Account deleted"}
```

---

## Data Models

### Task Object

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "task_name": "Call dentist",
  "task_type": "health",
  "description": "Annual checkup",
  "scheduled_date": "2026-05-20",
  "scheduled_time": "15:00:00",
  "status": "pending",
  "priority": "medium",
  "progress": 0,
  "recurrence": null,
  "call_reminder": false,
  "message_reminder": false,
  "whatsapp_reminder": false,
  "reminder_time": null,
  "created_at": "2026-05-17T10:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

| Field | Values |
|---|---|
| `task_type` | `personal` `work` `health` `shopping` `finance` `other` |
| `status` | `pending` `in_progress` `completed` `cancelled` |
| `priority` | `low` `medium` `high` |
| `recurrence` | `none` `daily` `weekly` `monthly` or `null` |

---

### Goal Object

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "goal_name": "Emergency fund",
  "goal_type": "finance",
  "target_amount": 5000.0,
  "current_amount": 1250.0,
  "deadline": "2026-12-31",
  "status": "active",
  "description": "Save 3 months of expenses",
  "message_reminder": false,
  "reminder_frequency": null,
  "savings_history": [
    {
      "id": "hex-id",
      "amount": 1250.0,
      "date": "2026-05-17T10:00:00Z",
      "note": "Initial deposit"
    }
  ],
  "created_at": "2026-05-17T10:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

| Field | Values |
|---|---|
| `goal_type` | `fitness` `finance` `learning` `personal` `other` |
| `status` | `active` `completed` `cancelled` |
| `reminder_frequency` | `Daily` `Weekly` `Monthly` or `null` |

---

### Intents

The `intent` field returned by `/api/chat` can be one of:

| Intent | Meaning |
|---|---|
| `casual_chat` | General conversation |
| `question_answer` | Factual question |
| `task_create` | User wants to create a task |
| `task_view` | User wants to see their tasks |
| `task_update` | User wants to update a task |
| `task_delete` | User wants to delete a task |
| `goal_create` | User wants to create a goal |
| `goal_view` | User wants to see their goals |
| `goal_update` | User wants to update a goal |
| `goal_delete` | User wants to delete a goal |
| `goal_progress` | User wants to log goal progress |

---

## Twilio Webhooks

These endpoints are called by Twilio, not the frontend. They have **no JWT authentication**.

| Method | Path | Called When |
|---|---|---|
| `POST` | `/api/calls/twiml` | Twilio fetches the greeting TwiML for a reminder call |
| `POST` | `/api/calls/voice-turn` | Twilio sends speech input during a reminder call |
| `POST` | `/api/calls/voice-process` | LLM + action execution for a reminder call turn |
| `POST` | `/api/calls/assistant-twiml` | Twilio fetches the greeting TwiML for an assistant call |
| `POST` | `/api/calls/assistant-turn` | Twilio sends speech input during an assistant call |
| `POST` | `/api/calls/assistant-process` | LLM + action execution for an assistant call turn |
| `POST` | `/api/calls/status` | Twilio call status updates (initiated, answered, completed) |
| `POST` | `/api/calls/recording-status` | Twilio posts recording URL when recording is ready |

All webhook endpoints return TwiML (`text/xml`) or an empty `200` response. They should never be called directly by the frontend.

For local development, expose port 8000 with ngrok and set `BACKEND_PUBLIC_URL` to the ngrok HTTPS URL. Twilio will then be able to reach the webhooks.

---

## Health Check

### GET `/`

No authentication required. Returns server status.

**Response `200`:**
```json
{
  "status": "ok",
  "service": "alpha-assist"
}
```

Used by the Docker `HEALTHCHECK` directive.
