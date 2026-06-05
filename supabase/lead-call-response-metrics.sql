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
