# Appointment Setter Intelligence Dashboard

This is a separate dashboard app for appointment setter performance and transcript intelligence. It does not modify the existing ad spend dashboard.

## Run

```bash
npm start
```

Open:

```text
http://localhost:4288
```

## Data Flow

Google Sheets stays as the historical performance source. GHL becomes the conversation and transcript source. Supabase stores the cleaned joined data so the dashboard can be fast and searchable.

```text
Google Sheets + GHL API -> Supabase -> Dashboard
```

## How Transcripts Work

The app looks for GHL call/message records, then stores any transcript returned by GHL in Supabase. When GHL has a call recording but no transcript, the next version can transcribe the recording with AI and store that result in the same table.

Transcripts are aligned to Google Sheet records by contact identity and appointment context:

- GHL contact ID, phone, or email
- client name
- appointment date
- appointment status
- appointment setter / assigned user when GHL provides it

## Setup

1. Copy `.env.example` to `.env`.
2. Add Supabase values.
3. Run `supabase/schema.sql` in Supabase SQL editor.
4. Add GHL private integration token and location ID.
5. Start the app.

The dashboard works in read-only Google Sheets mode even before Supabase and GHL credentials are connected.

## Hourly Sync

Run:

```bash
npm run hourly-sync
```

What it does:

- Reads daily metrics from Google Sheets.
- Upserts sheet metrics into Supabase.
- Pulls recent GHL call transcripts for `south-texas-builders` and `cuates`.
- Backfills missing call directions from GHL message history.
- Adds a small AI review batch for saved transcripts when `OPENAI_API_KEY` is set.

Environment variables used by the sync:

- `GOOGLE_SHEET_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GHL_API_BASE`
- `GHL_API_VERSION`
- `GHL_LOCATION_ID`
- `GHL_PRIVATE_INTEGRATION_TOKEN`
- `CUATES_GHL_LOCATION_ID`
- `CUATES_GHL_PRIVATE_INTEGRATION_TOKEN`
- `OPENAI_API_KEY`
- `HOURLY_SYNC_SOURCES`
- `HOURLY_TRANSCRIPT_LIMIT`
- `HOURLY_ANALYZE_LIMIT`
- `HOURLY_SKIP_AI`

External hosts the sync must be able to reach:

- `docs.google.com`
- `services.leadconnectorhq.com` or the host configured in `GHL_API_BASE`
- your Supabase project host from `SUPABASE_URL`
- `api.openai.com` when AI analysis is enabled

Notes:

- The script now prints a structured JSON summary for every stage, including partial failures.
- If one stage fails, later stages still attempt to run so the output is more useful for operations.
