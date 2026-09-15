-- Persist only Google Photo request metadata. Google photo bytes, photo URI,
-- photo name, or provider media content are intentionally not stored here.

alter table public.amd_google_request_logs
  add column if not exists result_code text;

create index if not exists amd_google_request_logs_photo_result_idx
  on public.amd_google_request_logs(request_type, result_code, occurred_at desc);
