-- Work Note personal full-stack schema
-- Apply in a new Supabase project before enabling the full-stack frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_work_note_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_work_note on auth.users;
create trigger on_auth_user_created_work_note after insert or update of email on auth.users
for each row execute function public.handle_new_work_note_user();

-- Backfill a profile row if Auth users existed before this migration was applied.
insert into public.profiles(user_id, email, display_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'name', '')
from auth.users
on conflict (user_id) do update set email=excluded.email, display_name=coalesce(nullif(profiles.display_name,''),excluded.display_name), updated_at=now();

create or replace function public.is_work_note_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and is_allowed = true);
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, local_id text not null,
  data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.head_office_contacts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, kind text not null check(kind in ('equipment_sales','material_sales','output','other')),
  company_local_id text, status text not null default '', title text not null default '', is_important boolean not null default false,
  start_date date, end_date date, data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create index if not exists tasks_user_kind_status_idx on public.tasks(user_id, kind, status) where deleted_at is null;
create index if not exists tasks_user_dates_idx on public.tasks(user_id, start_date, end_date) where deleted_at is null;

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, company_local_id text, payment_type text not null default '', status text not null default '',
  is_important boolean not null default false, data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.settlement_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  settlement_id uuid not null references public.settlements(id) on delete cascade, local_id text not null,
  entry_kind text not null check(entry_kind in ('installment','deduction','tax_only')),
  due_date date, paid_date date, status text not null default '', amount numeric(18,2), is_important boolean not null default false,
  data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create index if not exists settlement_entries_dates_idx on public.settlement_entries(user_id, due_date, status) where deleted_at is null;

create table if not exists public.task_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, source_kind text not null, source_local_id text not null, source_row_local_id text,
  schedule_kind text not null, schedule_date date not null, title text not null default '', data jsonb not null default '{}'::jsonb,
  is_important boolean not null default false, data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create index if not exists task_schedules_user_date_idx on public.task_schedules(user_id, schedule_date) where deleted_at is null;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, data jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  data_version text not null default 'react-work-note-v1', migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null, owner_kind text not null, owner_local_id text not null default '', storage_path text not null default '',
  file_name text not null, mime_type text not null default 'application/octet-stream', file_size bigint not null default 0,
  sha256 text, data jsonb not null default '{}'::jsonb, migration_batch_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, local_id)
);
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(user_id, key)
);
create table if not exists public.migration_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  status text not null, source text not null default 'browser-local', counts jsonb not null default '{}'::jsonb,
  server_counts jsonb not null default '{}'::jsonb, failed_items jsonb not null default '[]'::jsonb,
  error_message text not null default '', started_at timestamptz not null default now(), completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  action text not null, entity_type text not null default 'workspace', entity_local_id text not null default '',
  summary text not null default '', data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['profiles','companies','company_contacts','head_office_contacts','tasks','settlements','settlement_entries','task_schedules','accounts','attachments','settings'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','companies','company_contacts','head_office_contacts','tasks','settlements','settlement_entries','task_schedules','accounts','attachments','settings','migration_logs','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists work_note_owner_select on public.%I', t);
    execute format('drop policy if exists work_note_owner_insert on public.%I', t);
    execute format('drop policy if exists work_note_owner_update on public.%I', t);
    execute format('drop policy if exists work_note_owner_delete on public.%I', t);
    execute format('create policy work_note_owner_select on public.%I for select using (auth.uid() = user_id and public.is_work_note_user())', t);
    execute format('create policy work_note_owner_insert on public.%I for insert with check (auth.uid() = user_id and public.is_work_note_user())', t);
    execute format('create policy work_note_owner_update on public.%I for update using (auth.uid() = user_id and public.is_work_note_user()) with check (auth.uid() = user_id and public.is_work_note_user())', t);
  end loop;
end $$;

create or replace function public.safe_work_note_date(p_value text)
returns date language plpgsql immutable as $$
declare v_value text := nullif(trim(coalesce(p_value,'')), '');
begin
  if v_value is null or v_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return v_value::date;
exception when others then return null;
end;
$$;

create or replace function public.safe_work_note_numeric(p_value text)
returns numeric language plpgsql immutable as $$
declare v_value text := nullif(regexp_replace(coalesce(p_value,''),'[^0-9.-]','','g'), '');
begin
  if v_value is null then return null; end if;
  return v_value::numeric;
exception when others then return null;
end;
$$;

create or replace function public.safe_work_note_boolean(p_value text)
returns boolean language sql immutable as $$
  select lower(trim(coalesce(p_value,''))) in ('true','t','1','yes','y','예');
$$;

-- The profile owner may read their own row before allow-list approval, but cannot mutate is_allowed.
drop policy if exists work_note_owner_select on public.profiles;
create policy work_note_owner_select on public.profiles for select using (auth.uid() = user_id);

create or replace function public.get_work_note_counts()
returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
  'companies',(select count(*) from public.companies where user_id=auth.uid() and deleted_at is null),
  'companyContacts',(select count(*) from public.company_contacts where user_id=auth.uid() and deleted_at is null),
  'internalContacts',(select count(*) from public.head_office_contacts where user_id=auth.uid() and deleted_at is null),
  'equipmentSales',(select count(*) from public.tasks where user_id=auth.uid() and kind='equipment_sales' and deleted_at is null),
  'materialSales',(select count(*) from public.tasks where user_id=auth.uid() and kind='material_sales' and deleted_at is null),
  'settlements',(select count(*) from public.settlements where user_id=auth.uid() and deleted_at is null),
  'settlementEntries',(select count(*) from public.settlement_entries where user_id=auth.uid() and deleted_at is null),
  'outputTasks',(select count(*) from public.tasks where user_id=auth.uid() and kind='output' and deleted_at is null),
  'otherTasks',(select count(*) from public.tasks where user_id=auth.uid() and kind='other' and deleted_at is null),
  'taskSchedules',(select count(*) from public.task_schedules where user_id=auth.uid() and deleted_at is null),
  'accounts',(select count(*) from public.accounts where user_id=auth.uid() and deleted_at is null),
  'attachments',(select count(*) from public.attachments where user_id=auth.uid() and deleted_at is null),
  'totalRecords',(select count(*) from public.companies where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.company_contacts where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.head_office_contacts where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.tasks where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.settlements where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.settlement_entries where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.task_schedules where user_id=auth.uid() and deleted_at is null)+(select count(*) from public.accounts where user_id=auth.uid() and deleted_at is null)
);
$$;

create or replace function public.sync_work_note_dataset(
  p_payload jsonb,
  p_reason text default 'Work Note save',
  p_mode text default 'sync',
  p_migration_batch_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_version text := coalesce(nullif(p_payload->>'version',''), 'react-work-note-v1');
  v_item jsonb; v_child jsonb; v_index integer; v_child_index integer;
  v_local_id text; v_parent_id uuid; v_kind text;
begin
  if v_user is null or not public.is_work_note_user() then raise exception 'Work Note access denied'; end if;
  if p_mode not in ('sync','merge','replace') then raise exception 'Unsupported sync mode'; end if;

  if p_mode in ('sync','replace') then
    update public.company_contacts set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.companies set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.head_office_contacts set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.tasks set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.settlement_entries set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.settlements set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.task_schedules set deleted_at=now() where user_id=v_user and deleted_at is null;
    update public.accounts set deleted_at=now() where user_id=v_user and deleted_at is null;
  end if;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'companies','[]'::jsonb)) loop
    v_index := v_index + 1; v_local_id := coalesce(nullif(v_item->>'id',''), 'company-'||v_index);
    insert into public.companies(user_id,local_id,data,sort_order,data_version,migration_batch_id,deleted_at)
    values(v_user,v_local_id,v_item-'contacts',v_index,v_version,p_migration_batch_id,null)
    on conflict(user_id,local_id) do update set data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,companies.migration_batch_id),deleted_at=null,updated_at=now()
    returning id into v_parent_id;
    v_child_index := 0;
    for v_child in select value from jsonb_array_elements(coalesce(v_item->'contacts','[]'::jsonb)) loop
      v_child_index := v_child_index+1; v_local_id := coalesce(nullif(v_child->>'id',''), 'company-contact-'||v_parent_id::text||'-'||v_child_index);
      insert into public.company_contacts(user_id,company_id,local_id,data,sort_order,data_version,migration_batch_id,deleted_at)
      values(v_user,v_parent_id,v_local_id,v_child,v_child_index,v_version,p_migration_batch_id,null)
      on conflict(user_id,local_id) do update set company_id=excluded.company_id,data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,company_contacts.migration_batch_id),deleted_at=null,updated_at=now();
    end loop;
  end loop;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'internalContacts','[]'::jsonb)) loop
    v_index:=v_index+1; v_local_id:=coalesce(nullif(v_item->>'id',''),'internal-contact-'||v_index);
    insert into public.head_office_contacts(user_id,local_id,data,sort_order,data_version,migration_batch_id,deleted_at)
    values(v_user,v_local_id,v_item,v_index,v_version,p_migration_batch_id,null)
    on conflict(user_id,local_id) do update set data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,head_office_contacts.migration_batch_id),deleted_at=null,updated_at=now();
  end loop;

  for v_kind in select unnest(array['equipment_sales','material_sales','output','other']) loop
    v_index:=0;
    for v_item in select value from jsonb_array_elements(case v_kind when 'equipment_sales' then coalesce(p_payload->'notes','[]'::jsonb) when 'material_sales' then coalesce(p_payload->'materialSalesNotes','[]'::jsonb) when 'output' then coalesce(p_payload->'outputTasks','[]'::jsonb) else coalesce(p_payload->'otherTasks','[]'::jsonb) end) loop
      v_index:=v_index+1; v_local_id:=coalesce(nullif(v_item->>'id',''),v_kind||'-'||v_index);
      insert into public.tasks(user_id,local_id,kind,company_local_id,status,title,is_important,start_date,end_date,data,sort_order,data_version,migration_batch_id,deleted_at)
      values(v_user,v_local_id,v_kind,nullif(v_item->>'companyId',''),coalesce(v_item->>'status',''),coalesce(v_item->>'title',v_item->>'company',v_item->>'name',''),public.safe_work_note_boolean(v_item->>'isImportant'),public.safe_work_note_date(coalesce(v_item->>'startDate',v_item->>'nextContactDate',v_item->>'inquiryDate')),public.safe_work_note_date(coalesce(v_item->>'endDate',v_item->>'meetingDate',v_item->>'deadline')),v_item,v_index,v_version,p_migration_batch_id,null)
      on conflict(user_id,local_id) do update set kind=excluded.kind,company_local_id=excluded.company_local_id,status=excluded.status,title=excluded.title,is_important=excluded.is_important,start_date=excluded.start_date,end_date=excluded.end_date,data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,tasks.migration_batch_id),deleted_at=null,updated_at=now();
    end loop;
  end loop;

  v_index:=0;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'settlementTasks','[]'::jsonb)) loop
    v_index:=v_index+1; v_local_id:=coalesce(nullif(v_item->>'id',''),'settlement-'||v_index);
    insert into public.settlements(user_id,local_id,company_local_id,payment_type,status,is_important,data,sort_order,data_version,migration_batch_id,deleted_at)
    values(v_user,v_local_id,nullif(v_item->>'companyId',''),coalesce(v_item->>'paymentType',''),coalesce(v_item->>'status',''),public.safe_work_note_boolean(v_item->>'isImportant'),v_item-'paymentSchedule',v_index,v_version,p_migration_batch_id,null)
    on conflict(user_id,local_id) do update set company_local_id=excluded.company_local_id,payment_type=excluded.payment_type,status=excluded.status,is_important=excluded.is_important,data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,settlements.migration_batch_id),deleted_at=null,updated_at=now()
    returning id into v_parent_id;
    v_child_index:=0;
    for v_child in select value from jsonb_array_elements(coalesce(v_item->'paymentSchedule','[]'::jsonb)) loop
      v_child_index:=v_child_index+1; v_local_id:=coalesce(nullif(v_child->>'id',''),'settlement-entry-'||v_parent_id::text||'-'||v_child_index);
      insert into public.settlement_entries(user_id,settlement_id,local_id,entry_kind,due_date,paid_date,status,amount,is_important,data,sort_order,data_version,migration_batch_id,deleted_at)
      values(v_user,v_parent_id,v_local_id,case when public.safe_work_note_boolean(v_child->>'isTaxInvoiceOnly') then 'tax_only' when coalesce(v_item->>'paymentType','') like '%선금%' then 'deduction' else 'installment' end,public.safe_work_note_date(v_child->>'dueDate'),public.safe_work_note_date(v_child->>'paidDate'),coalesce(v_child->>'status',''),public.safe_work_note_numeric(v_child->>'amount'),public.safe_work_note_boolean(v_child->>'isImportant'),v_child,v_child_index,v_version,p_migration_batch_id,null)
      on conflict(user_id,local_id) do update set settlement_id=excluded.settlement_id,entry_kind=excluded.entry_kind,due_date=excluded.due_date,paid_date=excluded.paid_date,status=excluded.status,amount=excluded.amount,is_important=excluded.is_important,data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,settlement_entries.migration_batch_id),deleted_at=null,updated_at=now();
    end loop;
  end loop;

  v_index:=0;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'taskSchedules','[]'::jsonb)) loop
    v_index:=v_index+1; v_local_id:=coalesce(nullif(v_item->>'id',''),'schedule-'||v_index);
    insert into public.task_schedules(user_id,local_id,source_kind,source_local_id,source_row_local_id,schedule_kind,schedule_date,title,data,is_important,data_version,migration_batch_id,deleted_at)
    values(v_user,v_local_id,coalesce(v_item->>'sourceKind','task'),coalesce(v_item->>'sourceId',''),nullif(v_item->>'sourceRowId',''),coalesce(v_item->>'scheduleKind','work'),(v_item->>'date')::date,coalesce(v_item->>'title',''),v_item,public.safe_work_note_boolean(v_item->>'isImportant'),v_version,p_migration_batch_id,null)
    on conflict(user_id,local_id) do update set source_kind=excluded.source_kind,source_local_id=excluded.source_local_id,source_row_local_id=excluded.source_row_local_id,schedule_kind=excluded.schedule_kind,schedule_date=excluded.schedule_date,title=excluded.title,data=excluded.data,is_important=excluded.is_important,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,task_schedules.migration_batch_id),deleted_at=null,updated_at=now();
  end loop;

  v_index:=0;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'accounts','[]'::jsonb)) loop
    v_index:=v_index+1; v_local_id:=coalesce(nullif(v_item->>'id',''),'account-'||v_index);
    insert into public.accounts(user_id,local_id,data,sort_order,data_version,migration_batch_id,deleted_at)
    values(v_user,v_local_id,v_item,v_index,v_version,p_migration_batch_id,null)
    on conflict(user_id,local_id) do update set data=excluded.data,sort_order=excluded.sort_order,data_version=excluded.data_version,migration_batch_id=coalesce(excluded.migration_batch_id,accounts.migration_batch_id),deleted_at=null,updated_at=now();
  end loop;

  insert into public.settings(user_id,key,data,deleted_at) values(v_user,'workspace',jsonb_build_object('version',v_version,'updatedAt',coalesce(nullif(p_payload->>'updatedAt',''),now()::text)),null)
  on conflict(user_id,key) do update set data=excluded.data,deleted_at=null,updated_at=now();
  insert into public.activity_logs(user_id,action,summary,data) values(v_user,'dataset_sync',coalesce(p_reason,'Work Note save'),jsonb_build_object('mode',p_mode,'migrationBatchId',p_migration_batch_id));
  return public.get_work_note_counts();
end;
$$;

create or replace function public.get_work_note_dataset()
returns jsonb language sql stable security invoker set search_path=public as $$
select case when auth.uid() is null or not public.is_work_note_user() then '{}'::jsonb else jsonb_build_object(
  'version',coalesce((select data->>'version' from public.settings where user_id=auth.uid() and key='workspace' and deleted_at is null),'server-work-note-v1'),
  'updatedAt',coalesce((select data->>'updatedAt' from public.settings where user_id=auth.uid() and key='workspace' and deleted_at is null),''),
  'companies',coalesce((select jsonb_agg(c.data||jsonb_build_object('id',c.local_id,'contacts',coalesce((select jsonb_agg(cc.data||jsonb_build_object('id',cc.local_id) order by cc.sort_order) from public.company_contacts cc where cc.user_id=auth.uid() and cc.company_id=c.id and cc.deleted_at is null),'[]'::jsonb)) order by c.sort_order) from public.companies c where c.user_id=auth.uid() and c.deleted_at is null),'[]'::jsonb),
  'internalContacts',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.head_office_contacts where user_id=auth.uid() and deleted_at is null),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.tasks where user_id=auth.uid() and kind='equipment_sales' and deleted_at is null),'[]'::jsonb),
  'materialSalesNotes',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.tasks where user_id=auth.uid() and kind='material_sales' and deleted_at is null),'[]'::jsonb),
  'settlementTasks',coalesce((select jsonb_agg(s.data||jsonb_build_object('id',s.local_id,'paymentSchedule',coalesce((select jsonb_agg(se.data||jsonb_build_object('id',se.local_id) order by se.sort_order) from public.settlement_entries se where se.user_id=auth.uid() and se.settlement_id=s.id and se.deleted_at is null),'[]'::jsonb)) order by s.sort_order) from public.settlements s where s.user_id=auth.uid() and s.deleted_at is null),'[]'::jsonb),
  'outputTasks',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.tasks where user_id=auth.uid() and kind='output' and deleted_at is null),'[]'::jsonb),
  'otherTasks',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.tasks where user_id=auth.uid() and kind='other' and deleted_at is null),'[]'::jsonb),
  'accounts',coalesce((select jsonb_agg(data||jsonb_build_object('id',local_id) order by sort_order) from public.accounts where user_id=auth.uid() and deleted_at is null),'[]'::jsonb)
) end;
$$;

create or replace function public.soft_delete_work_note_account_data()
returns void language plpgsql security invoker set search_path=public as $$
declare v_user uuid:=auth.uid(); t text; begin
  if v_user is null or not public.is_work_note_user() then raise exception 'Work Note access denied'; end if;
  foreach t in array array['company_contacts','companies','head_office_contacts','tasks','settlement_entries','settlements','task_schedules','accounts','attachments','settings'] loop
    execute format('update public.%I set deleted_at=now(), updated_at=now() where user_id=$1 and deleted_at is null',t) using v_user;
  end loop;
  insert into public.activity_logs(user_id,action,summary) values(v_user,'account_soft_delete','계정 데이터 전체 소프트 삭제');
end;
$$;

grant execute on function public.get_work_note_dataset() to authenticated;
grant execute on function public.get_work_note_counts() to authenticated;
grant execute on function public.sync_work_note_dataset(jsonb,text,text,uuid) to authenticated;
grant execute on function public.soft_delete_work_note_account_data() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
values('work-note-attachments','work-note-attachments',false,104857600)
on conflict(id) do update set public=false;

drop policy if exists work_note_storage_select on storage.objects;
drop policy if exists work_note_storage_insert on storage.objects;
drop policy if exists work_note_storage_update on storage.objects;
create policy work_note_storage_select on storage.objects for select to authenticated
using(bucket_id='work-note-attachments' and (storage.foldername(name))[1]=auth.uid()::text and public.is_work_note_user());
create policy work_note_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='work-note-attachments' and (storage.foldername(name))[1]=auth.uid()::text and public.is_work_note_user());
create policy work_note_storage_update on storage.objects for update to authenticated
using(bucket_id='work-note-attachments' and (storage.foldername(name))[1]=auth.uid()::text and public.is_work_note_user())
with check(bucket_id='work-note-attachments' and (storage.foldername(name))[1]=auth.uid()::text and public.is_work_note_user());

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='activity_logs') then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
end $$;

-- After the personal account has signed in once, allow exactly that account:
-- update public.profiles set is_allowed=true where email='you@example.com';
