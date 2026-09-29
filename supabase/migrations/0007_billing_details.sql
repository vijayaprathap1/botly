-- Billing details for GST invoices (B2B customers) and trial lifecycle emails.
alter table public.organizations
  add column if not exists billing_name text,
  add column if not exists gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  -- Which trial emails were sent: {"welcome": "...", "replies80": "...", "ending": "...", "ended": "..."}
  add column if not exists trial_emails jsonb not null default '{}'::jsonb;
