create table if not exists sheet_daily_metrics (
  id bigserial primary key,
  source_key text not null,
  source_name text not null,
  metric_date date not null,
  month_name text not null,
  leads integer not null default 0,
  no_answer integer not null default 0,
  not_qualified integer not null default 0,
  qualified integer not null default 0,
  lender integer not null default 0,
  meetings_booked integer not null default 0,
  no_shows integer not null default 0,
  meetings_attended integer not null default 0,
  closed_deals integer not null default 0,
  created_at timestamptz not null default now(),
  unique (source_key, metric_date)
);

create table if not exists clients (
  id bigserial primary key,
  full_name text not null,
  normalized_name text not null,
  phone text,
  email text,
  ghl_contact_id text unique,
  latest_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointment_setters (
  id bigserial primary key,
  name text not null unique,
  ghl_user_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id bigserial primary key,
  client_id bigint references clients(id),
  source_key text,
  appointment_setter_id bigint references appointment_setters(id),
  ghl_appointment_id text unique,
  appointment_date timestamptz,
  status text,
  sheet_month text,
  sheet_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ghl_conversations (
  id text primary key,
  location_id text,
  contact_id text,
  assigned_to text,
  last_message_date timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists ghl_messages (
  id text primary key,
  conversation_id text references ghl_conversations(id) on delete cascade,
  contact_id text,
  direction text,
  message_type text,
  body text,
  call_status text,
  call_duration_seconds integer,
  date_added timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create table if not exists conversation_transcripts (
  id bigserial primary key,
  ghl_message_id text references ghl_messages(id) on delete cascade,
  contact_id text,
  conversation_id text,
  source_key text,
  source_name text,
  client_name text,
  message_type text,
  call_status text,
  call_duration_seconds integer,
  date_added timestamptz,
  transcript_text text,
  transcript_url text,
  transcript_segments jsonb,
  source text not null default 'ghl',
  synced_at timestamptz not null default now(),
  unique (ghl_message_id)
);

create table if not exists ai_conversation_reviews (
  id bigserial primary key,
  transcript_id bigint references conversation_transcripts(id) on delete cascade,
  client_id bigint references clients(id),
  appointment_setter_id bigint references appointment_setters(id),
  ai_summary text,
  main_objections text[],
  did_well text[],
  should_improve text[],
  recommended_next_action text,
  quality_score numeric(4, 2),
  model text,
  created_at timestamptz not null default now()
);

create table if not exists lead_call_response_metrics (
  id bigserial primary key,
  source_key text not null,
  source_name text,
  company_id uuid,
  meeting_id uuid,
  ghl_contact_id text not null,
  ghl_opportunity_id text,
  pending_call_at timestamptz not null,
  first_outbound_call_at timestamptz,
  first_outbound_message_id text,
  minutes_to_first_call numeric(10, 2),
  status text not null default 'waiting',
  pending_stage text,
  computed_from text not null default 'ghl_lead_snapshots',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, ghl_contact_id, pending_call_at)
);

create index if not exists lead_call_response_metrics_source_pending_idx
  on lead_call_response_metrics (source_key, pending_call_at desc);

create index if not exists lead_call_response_metrics_contact_idx
  on lead_call_response_metrics (ghl_contact_id);

create index if not exists lead_call_response_metrics_status_idx
  on lead_call_response_metrics (status);

create table if not exists sync_runs (
  id bigserial primary key,
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0,
  error_message text
);
