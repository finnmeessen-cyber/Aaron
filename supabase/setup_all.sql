create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_phase_started_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.phase_started_at = coalesce(new.phase_started_at, timezone('utc', now()));
    return new;
  end if;

  if new.current_phase_slug is distinct from old.current_phase_slug then
    new.phase_started_at = timezone('utc', now());
  elsif new.phase_started_at is null then
    new.phase_started_at = old.phase_started_at;
  end if;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_phase_slug text not null default 'stabilisierung',
  phase_started_at timestamptz not null default timezone('utc', now()),
  dark_mode_preference text not null default 'dark' check (dark_mode_preference in ('system', 'light', 'dark')),
  macro_training_calories integer not null default 3150 check (macro_training_calories > 0),
  macro_training_protein integer not null default 170 check (macro_training_protein > 0),
  macro_training_carbs integer not null default 420 check (macro_training_carbs >= 0),
  macro_training_fat integer not null default 50 check (macro_training_fat >= 0),
  macro_rest_calories integer not null default 2750 check (macro_rest_calories > 0),
  macro_rest_protein integer not null default 170 check (macro_rest_protein > 0),
  macro_rest_carbs integer not null default 320 check (macro_rest_carbs >= 0),
  macro_rest_fat integer not null default 55 check (macro_rest_fat >= 0),
  training_days integer[] not null default array[1, 3, 5],
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  body_weight numeric(5, 2),
  sleep_score integer check (sleep_score between 1 and 10),
  energy_score integer check (energy_score between 1 and 10),
  cravings_score integer check (cravings_score between 1 and 10),
  training_completed boolean not null default false,
  calories integer check (calories >= 0),
  notes text,
  day_type text not null default 'training' check (day_type in ('training', 'rest')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_entries_user_date_unique unique (user_id, entry_date)
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  section text not null check (section in ('morning', 'meals', 'training', 'evening', 'sleep')),
  is_supplement boolean not null default false,
  supplement_slugs text[] not null default array[]::text[],
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  template_key text not null references public.checklist_templates (template_key) on update cascade on delete cascade,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_checklists_user_date_template_unique unique (user_id, entry_date, template_key)
);

create table if not exists public.supplement_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  dosage text,
  timing text,
  category text not null check (category in ('Fokus', 'Performance', 'Schlaf', 'Gesundheit', 'Entzug')),
  guidance text,
  is_default_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  active boolean not null default true,
  custom_dosage text,
  custom_timing text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_supplements_user_supplement_unique unique (user_id, supplement_id)
);

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  log_date date not null default current_date,
  completed boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supplement_logs_user_supplement_date_unique unique (user_id, supplement_id, log_date)
);

create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  template_key text not null,
  meal_slot text not null,
  name text not null,
  description text,
  protein_g integer check (protein_g >= 0),
  carbs_g integer check (carbs_g >= 0),
  fat_g integer check (fat_g >= 0),
  calories integer check (calories >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meal_templates_user_template_unique unique (user_id, template_key)
);

create unique index if not exists meal_templates_system_template_unique
  on public.meal_templates (template_key)
  where user_id is null;

create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null,
  objective text not null,
  guidance text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.phase_supplements (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases (id) on delete cascade,
  supplement_id uuid not null references public.supplement_catalog (id) on delete cascade,
  dosage text,
  timing text,
  notes text,
  sort_order integer not null default 0,
  constraint phase_supplements_phase_supplement_unique unique (phase_id, supplement_id)
);

create table if not exists public.day_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  day_type text not null check (day_type in ('training', 'rest')),
  calories integer check (calories >= 0),
  notes text,
  meal_template_keys text[],
  default_checklist_keys text[],
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

drop trigger if exists user_settings_sync_phase_started_at on public.user_settings;
create trigger user_settings_sync_phase_started_at
before insert or update on public.user_settings
for each row
execute function public.sync_phase_started_at();

drop trigger if exists daily_entries_set_updated_at on public.daily_entries;
create trigger daily_entries_set_updated_at
before update on public.daily_entries
for each row
execute function public.set_updated_at();

drop trigger if exists daily_checklists_set_updated_at on public.daily_checklists;
create trigger daily_checklists_set_updated_at
before update on public.daily_checklists
for each row
execute function public.set_updated_at();

drop trigger if exists supplement_catalog_set_updated_at on public.supplement_catalog;
create trigger supplement_catalog_set_updated_at
before update on public.supplement_catalog
for each row
execute function public.set_updated_at();

drop trigger if exists user_supplements_set_updated_at on public.user_supplements;
create trigger user_supplements_set_updated_at
before update on public.user_supplements
for each row
execute function public.set_updated_at();

drop trigger if exists supplement_logs_set_updated_at on public.supplement_logs;
create trigger supplement_logs_set_updated_at
before update on public.supplement_logs
for each row
execute function public.set_updated_at();

drop trigger if exists meal_templates_set_updated_at on public.meal_templates;
create trigger meal_templates_set_updated_at
before update on public.meal_templates
for each row
execute function public.set_updated_at();

drop trigger if exists phases_set_updated_at on public.phases;
create trigger phases_set_updated_at
before update on public.phases
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.daily_entries enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.daily_checklists enable row level security;
alter table public.supplement_catalog enable row level security;
alter table public.user_supplements enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.meal_templates enable row level security;
alter table public.phases enable row level security;
alter table public.phase_supplements enable row level security;
alter table public.day_templates enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings
for select
using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_select_own" on public.daily_entries;
create policy "daily_entries_select_own"
on public.daily_entries
for select
using (auth.uid() = user_id);

drop policy if exists "daily_entries_insert_own" on public.daily_entries;
create policy "daily_entries_insert_own"
on public.daily_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_update_own" on public.daily_entries;
create policy "daily_entries_update_own"
on public.daily_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_entries_delete_own" on public.daily_entries;
create policy "daily_entries_delete_own"
on public.daily_entries
for delete
using (auth.uid() = user_id);

drop policy if exists "checklist_templates_select_authenticated" on public.checklist_templates;
create policy "checklist_templates_select_authenticated"
on public.checklist_templates
for select
using (auth.role() = 'authenticated');

drop policy if exists "daily_checklists_select_own" on public.daily_checklists;
create policy "daily_checklists_select_own"
on public.daily_checklists
for select
using (auth.uid() = user_id);

drop policy if exists "daily_checklists_insert_own" on public.daily_checklists;
create policy "daily_checklists_insert_own"
on public.daily_checklists
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_checklists_update_own" on public.daily_checklists;
create policy "daily_checklists_update_own"
on public.daily_checklists
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_checklists_delete_own" on public.daily_checklists;
create policy "daily_checklists_delete_own"
on public.daily_checklists
for delete
using (auth.uid() = user_id);

drop policy if exists "supplement_catalog_select_authenticated" on public.supplement_catalog;
create policy "supplement_catalog_select_authenticated"
on public.supplement_catalog
for select
using (auth.role() = 'authenticated');

drop policy if exists "user_supplements_select_own" on public.user_supplements;
create policy "user_supplements_select_own"
on public.user_supplements
for select
using (auth.uid() = user_id);

drop policy if exists "user_supplements_insert_own" on public.user_supplements;
create policy "user_supplements_insert_own"
on public.user_supplements
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_supplements_update_own" on public.user_supplements;
create policy "user_supplements_update_own"
on public.user_supplements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_supplements_delete_own" on public.user_supplements;
create policy "user_supplements_delete_own"
on public.user_supplements
for delete
using (auth.uid() = user_id);

drop policy if exists "supplement_logs_select_own" on public.supplement_logs;
create policy "supplement_logs_select_own"
on public.supplement_logs
for select
using (auth.uid() = user_id);

drop policy if exists "supplement_logs_insert_own" on public.supplement_logs;
create policy "supplement_logs_insert_own"
on public.supplement_logs
for insert
with check (auth.uid() = user_id);

drop policy if exists "supplement_logs_update_own" on public.supplement_logs;
create policy "supplement_logs_update_own"
on public.supplement_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "supplement_logs_delete_own" on public.supplement_logs;
create policy "supplement_logs_delete_own"
on public.supplement_logs
for delete
using (auth.uid() = user_id);

drop policy if exists "meal_templates_select_own_or_system" on public.meal_templates;
create policy "meal_templates_select_own_or_system"
on public.meal_templates
for select
using (auth.role() = 'authenticated' and (user_id is null or auth.uid() = user_id));

drop policy if exists "meal_templates_insert_own" on public.meal_templates;
create policy "meal_templates_insert_own"
on public.meal_templates
for insert
with check (auth.uid() = user_id);

drop policy if exists "meal_templates_update_own" on public.meal_templates;
create policy "meal_templates_update_own"
on public.meal_templates
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "meal_templates_delete_own" on public.meal_templates;
create policy "meal_templates_delete_own"
on public.meal_templates
for delete
using (auth.uid() = user_id);

drop policy if exists "phases_select_authenticated" on public.phases;
create policy "phases_select_authenticated"
on public.phases
for select
using (auth.role() = 'authenticated');

drop policy if exists "phase_supplements_select_authenticated" on public.phase_supplements;
create policy "phase_supplements_select_authenticated"
on public.phase_supplements
for select
using (auth.role() = 'authenticated');

drop policy if exists "day_templates_select_authenticated" on public.day_templates;
create policy "day_templates_select_authenticated"
on public.day_templates
for select
using (auth.role() = 'authenticated');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_supplements (user_id, supplement_id, active)
  select new.id, s.id, s.is_default_active
  from public.supplement_catalog s
  on conflict (user_id, supplement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
insert into public.checklist_templates (
  template_key,
  section,
  title,
  is_supplement,
  supplement_slugs,
  sort_order
)
values
  ('morning_nac', 'morning', 'NAC', true, array['nac'], 10),
  ('morning_tyrosin', 'morning', 'L-Tyrosin', true, array['l-tyrosin'], 20),
  ('morning_citicolin', 'morning', 'Citicolin', true, array['citicolin'], 30),
  ('morning_uridin', 'morning', 'Uridin Monophosphat', true, array['uridin-monophosphat'], 40),
  ('morning_d3_k2', 'morning', 'Vitamin D3 + K2', true, array['vitamin-d3', 'k2'], 50),
  ('morning_b_complex', 'morning', 'B-Komplex', true, array['b-komplex'], 60),
  ('morning_electrolytes', 'morning', 'Elektrolyte', true, array['elektrolyte'], 70),
  ('meal_1', 'meals', 'Meal 1', false, array[]::text[], 110),
  ('meal_2', 'meals', 'Meal 2', false, array[]::text[], 120),
  ('meal_3', 'meals', 'Meal 3', false, array[]::text[], 130),
  ('meal_pre_workout', 'meals', 'Pre-Workout Meal', false, array[]::text[], 140),
  ('meal_post_workout', 'meals', 'Post-Workout Meal', false, array[]::text[], 150),
  ('training_workout_done', 'training', 'Workout done', false, array[]::text[], 210),
  ('training_electrolytes', 'training', 'Elektrolyte waehrend Training', true, array['elektrolyte'], 220),
  ('evening_nac', 'evening', 'NAC', true, array['nac'], 310),
  ('evening_glycin', 'evening', 'Glycin', true, array['glycin'], 320),
  ('evening_theanin', 'evening', 'L-Theanin', true, array['l-theanin'], 330),
  ('evening_taurin', 'evening', 'Taurin', true, array['taurin'], 340),
  ('evening_ashwagandha', 'evening', 'Ashwagandha', true, array['ashwagandha-ksm-66', 'ashwagandha-shoden'], 350),
  ('evening_magnesium', 'evening', 'Magnesium', true, array['magnesium'], 360),
  ('evening_zink', 'evening', 'Zink', true, array['zink'], 370),
  ('sleep_no_screen', 'sleep', 'Kein Screen', false, array[]::text[], 410),
  ('sleep_prepared', 'sleep', 'Schlaf vorbereitet', false, array[]::text[], 420)
on conflict (template_key) do update
set
  section = excluded.section,
  title = excluded.title,
  is_supplement = excluded.is_supplement,
  supplement_slugs = excluded.supplement_slugs,
  sort_order = excluded.sort_order;

insert into public.supplement_catalog (slug, name, dosage, timing, category, guidance, is_default_active, sort_order)
values
  ('nac', 'NAC', '600 mg', 'morgens oder abends', 'Entzug', 'Template-Wert. Individuelle Vertraeglichkeit und medizinische Ruecksprache beachten.', true, 10),
  ('l-tyrosin', 'L-Tyrosin', '500-1000 mg', 'morgens vor Fokus-Blocks', 'Fokus', 'Eher nicht spaet am Tag, wenn du sensibel auf Stimulation reagierst.', true, 20),
  ('citicolin', 'Citicolin', '250 mg', 'morgens', 'Fokus', 'Kann gut mit fokussierter Computerarbeit oder Trainingsplanung kombiniert werden.', true, 30),
  ('uridin-monophosphat', 'Uridin Monophosphat', '150 mg', 'morgens', 'Fokus', 'Seed-Wert fuer dein Stack-Template.', true, 40),
  ('vitamin-d3', 'Vitamin D3', '2000 IU', 'mit fetthaltiger Mahlzeit', 'Gesundheit', 'Mit K2 und Laborwerten individuell pruefen.', true, 50),
  ('k2', 'K2', '100 mcg', 'mit D3', 'Gesundheit', 'Passt als Begleiter zu D3 im Template.', true, 60),
  ('b-komplex', 'B-Komplex', '1 Portion', 'morgens', 'Gesundheit', 'Kann morgens alltagstauglicher sein als spaet.', true, 70),
  ('elektrolyte', 'Elektrolyte', '1 Portion', 'morgens oder waehrend Training', 'Performance', 'Hilfreich rund um Schweissverlust und Training.', true, 80),
  ('glycin', 'Glycin', '3 g', 'abends', 'Schlaf', 'Template-Wert fuer Abendroutine.', true, 90),
  ('l-theanin', 'L-Theanin', '200 mg', 'abends', 'Schlaf', 'Oft angenehm fuer Entspannung, aber individuell pruefen.', true, 100),
  ('taurin', 'Taurin', '1000 mg', 'abends', 'Schlaf', 'Im Template fuer Abendruhe und Recovery vorgesehen.', true, 110),
  ('ashwagandha-ksm-66', 'Ashwagandha KSM-66', '300 mg', 'abends', 'Schlaf', 'Beispielwert. Nicht fuer jede Person passend.', false, 120),
  ('ashwagandha-shoden', 'Ashwagandha Shoden', '120 mg', 'abends', 'Schlaf', 'Alternative Variante, standardmaessig inaktiv.', false, 130),
  ('magnesium', 'Magnesium', '300-400 mg', 'abends', 'Gesundheit', 'Seed-Wert fuer Abend- und Erholungsroutine.', true, 140),
  ('zink', 'Zink', '10-15 mg', 'abends', 'Gesundheit', 'Nicht dauerhaft hoch dosieren ohne Bedarf.', true, 150),
  ('vitamin-c', 'Vitamin C', '500 mg', 'tagsueber', 'Gesundheit', 'Optionaler Template-Eintrag.', false, 160),
  ('l-glutamin', 'L-Glutamin', '5 g', 'tagsueber', 'Gesundheit', 'Optionales Ergaenzzungstemplate.', false, 170),
  ('bor', 'Bor', '3 mg', 'mit Mahlzeit', 'Gesundheit', 'Nur als editierbares Template hinterlegt.', false, 180),
  ('creatin', 'Creatin', '5 g', 'taeglich', 'Performance', 'Konstanz ist wichtiger als Timing.', true, 190),
  ('omega-3', 'Omega-3', '2 g EPA/DHA', 'mit Mahlzeit', 'Gesundheit', 'Mit fetthaltiger Mahlzeit nutzen.', true, 200)
on conflict (slug) do update
set
  name = excluded.name,
  dosage = excluded.dosage,
  timing = excluded.timing,
  category = excluded.category,
  guidance = excluded.guidance,
  is_default_active = excluded.is_default_active,
  sort_order = excluded.sort_order;

insert into public.phases (slug, name, summary, objective, guidance, sort_order)
values
  (
    'entzug',
    'Phase 1: Entzug',
    'Stabilitaet, Schlafschutz und Cravings-Management in den ersten harten Tagen.',
    'Cravings senken, Schlaf sichern, Nervensystem beruhigen und alltagsfaehig bleiben.',
    'Fokus auf Konstanz, Abendroutine, Elektrolyte, ausreichend Carbs und geringe Reibung im Alltag. Alle Dosierungen sind editierbare Template-Werte.',
    10
  ),
  (
    'stabilisierung',
    'Phase 2: Stabilisierung',
    'Mehr Struktur, gleichmaessigere Energie und saubere Trainings-Compliance.',
    'Routine festigen, Hunger und Energie stabilisieren und den Lean-Bulk planbar machen.',
    'Die App soll hier moeglichst frictionless sein: morgens checken, abends reviewen, Training sauber abhaken.',
    20
  ),
  (
    'performance-mode',
    'Phase 3: Performance Mode',
    'Klarer Fokus auf Trainingsleistung, mentale Performance und belastbare Routinen.',
    'Output steigern, Recovery absichern und Cannabis-Quit als neue Baseline stabilisieren.',
    'Performance heisst hier nicht maximale Komplexitaet, sondern wenige Bausteine konsequent durchziehen.',
    30
  )
on conflict (slug) do update
set
  name = excluded.name,
  summary = excluded.summary,
  objective = excluded.objective,
  guidance = excluded.guidance,
  sort_order = excluded.sort_order;

insert into public.phase_supplements (phase_id, supplement_id, dosage, timing, notes, sort_order)
select p.id, s.id, x.dosage, x.timing, x.notes, x.sort_order
from (
  values
    ('entzug', 'nac', '600 mg 2x taeglich', 'morgens und abends', 'Template-Wert fuer Cravings- und Routinen-Fokus.', 10),
    ('entzug', 'elektrolyte', '1-2 Portionen', 'morgens und rund ums Training', 'Hydration und Alltagstauglichkeit priorisieren.', 20),
    ('entzug', 'vitamin-c', '500 mg', 'tagsueber', 'Optionaler Baustein im Seed.', 30),
    ('entzug', 'magnesium', '300-400 mg', 'abends', 'Abendroutine priorisieren.', 40),
    ('entzug', 'glycin', '3 g', 'abends', 'Schlafqualitaet und Wind-down im Blick behalten.', 50),
    ('entzug', 'l-theanin', '200 mg', 'abends', 'Optional fuer entspannteren Downshift.', 60),
    ('entzug', 'taurin', '1000 mg', 'abends', 'Mit Schlafroutine kombinieren.', 70),
    ('stabilisierung', 'nac', '600 mg', 'morgens', 'Weiterhin als Sicherheitsnetz im Stack.', 10),
    ('stabilisierung', 'l-tyrosin', '500 mg', 'morgens', 'Fokus eher dosiert als aggressiv halten.', 20),
    ('stabilisierung', 'citicolin', '250 mg', 'morgens', 'Passt gut zu Arbeit und Struktur.', 30),
    ('stabilisierung', 'creatin', '5 g', 'taeglich', 'Konstanz fuer Performance und Lean Bulk.', 40),
    ('stabilisierung', 'omega-3', '2 g EPA/DHA', 'mit Meal 1 oder Meal 2', 'Systemischer Recovery-Baustein.', 50),
    ('stabilisierung', 'magnesium', '300 mg', 'abends', 'Abendstack nicht verlieren.', 60),
    ('performance-mode', 'l-tyrosin', '500-1000 mg', 'morgens', 'Nur so hoch wie alltagstauglich.', 10),
    ('performance-mode', 'citicolin', '250-500 mg', 'morgens', 'Fokus-Template fuer tiefe Arbeit.', 20),
    ('performance-mode', 'uridin-monophosphat', '150 mg', 'morgens', 'Optionaler Fokus-Baustein im Template.', 30),
    ('performance-mode', 'creatin', '5 g', 'taeglich', 'Bleibt die Performance-Basis.', 40),
    ('performance-mode', 'elektrolyte', '1 Portion', 'vor oder waehrend Training', 'Training und Hydration sauber halten.', 50),
    ('performance-mode', 'glycin', '3 g', 'abends', 'Performance braucht weiterhin gute Recovery.', 60),
    ('performance-mode', 'magnesium', '300 mg', 'abends', 'Abendroutine bleibt Pflicht.', 70)
) as x(phase_slug, supplement_slug, dosage, timing, notes, sort_order)
join public.phases p on p.slug = x.phase_slug
join public.supplement_catalog s on s.slug = x.supplement_slug
on conflict (phase_id, supplement_id) do update
set
  dosage = excluded.dosage,
  timing = excluded.timing,
  notes = excluded.notes,
  sort_order = excluded.sort_order;

insert into public.day_templates (
  slug,
  title,
  day_type,
  calories,
  notes,
  meal_template_keys,
  default_checklist_keys
)
values
  (
    'lean-bulk-training',
    'Lean Bulk Training Day',
    'training',
    3150,
    'Fokus auf Protein, moderate Fette, Rest Carbs. Morgenstack, Elektrolyte und Post-Workout Meal konsequent halten.',
    array['meal_1', 'meal_2', 'meal_3', 'meal_pre_workout', 'meal_post_workout'],
    array[
      'morning_nac',
      'morning_tyrosin',
      'morning_citicolin',
      'morning_uridin',
      'morning_d3_k2',
      'morning_b_complex',
      'morning_electrolytes',
      'training_workout_done',
      'training_electrolytes',
      'evening_nac',
      'evening_glycin',
      'evening_theanin',
      'evening_taurin',
      'evening_ashwagandha',
      'evening_magnesium',
      'evening_zink',
      'sleep_no_screen',
      'sleep_prepared'
    ]
  ),
  (
    'lean-bulk-rest',
    'Lean Bulk Rest Day',
    'rest',
    2750,
    'Protein gleich halten, Carbs etwas reduzieren, Abendroutine weiter priorisieren und Recovery sichern.',
    array['meal_1', 'meal_2', 'meal_3'],
    array[
      'morning_nac',
      'morning_d3_k2',
      'morning_b_complex',
      'morning_electrolytes',
      'evening_nac',
      'evening_glycin',
      'evening_theanin',
      'evening_taurin',
      'evening_magnesium',
      'evening_zink',
      'sleep_no_screen',
      'sleep_prepared'
    ]
  )
on conflict (slug) do update
set
  title = excluded.title,
  day_type = excluded.day_type,
  calories = excluded.calories,
  notes = excluded.notes,
  meal_template_keys = excluded.meal_template_keys,
  default_checklist_keys = excluded.default_checklist_keys;

insert into public.meal_templates (
  user_id,
  template_key,
  meal_slot,
  name,
  description,
  protein_g,
  carbs_g,
  fat_g,
  calories,
  notes,
  sort_order
)
select *
from (
  values
    (null::uuid, 'meal_1', 'Meal 1', 'Meal 1', 'Reismehl + Whey + TK-Beeren', 35, 75, 5, 495, 'Sehr schnelle Carb- und Protein-Basis.', 10),
    (null::uuid, 'meal_2', 'Meal 2', 'Meal 2', 'Quark + Beeren + Leinsamen', 40, 35, 12, 420, 'Sattmachend und unkompliziert.', 20),
    (null::uuid, 'meal_3', 'Meal 3', 'Meal 3', 'Haehnchen + Reis + Gemuese + Olivenoel', 45, 80, 15, 635, 'Klassische Lean-Bulk-Base-Mahlzeit.', 30),
    (null::uuid, 'meal_pre_workout', 'Pre-Workout', 'Pre-Workout Meal', 'Leicht verdauliche Carbs + leanes Protein', 30, 70, 6, 450, '60 bis 120 Minuten vor Training anpassbar.', 40),
    (null::uuid, 'meal_post_workout', 'Post-Workout', 'Post-Workout Meal', 'Reis + Whey oder mageres Protein + schnelle Carbs', 35, 90, 4, 520, 'Trainingstag-Template fuer Recovery.', 50)
) as x(user_id, template_key, meal_slot, name, description, protein_g, carbs_g, fat_g, calories, notes, sort_order)
where not exists (
  select 1
  from public.meal_templates mt
  where mt.user_id is null
    and mt.template_key = x.template_key
);

insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select u.id
from auth.users u
on conflict (user_id) do nothing;

insert into public.user_supplements (user_id, supplement_id, active)
select u.id, s.id, s.is_default_active
from auth.users u
cross join public.supplement_catalog s
on conflict (user_id, supplement_id) do nothing;
create or replace function public.sync_phase_started_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.phase_started_at = coalesce(new.phase_started_at, timezone('utc', now()));
    return new;
  end if;

  if new.current_phase_slug is distinct from old.current_phase_slug then
    new.phase_started_at = timezone('utc', now());
  elsif new.phase_started_at is null then
    new.phase_started_at = old.phase_started_at;
  end if;

  return new;
end;
$$;

alter table public.user_settings
  add column if not exists phase_started_at timestamptz;

update public.user_settings
set phase_started_at = coalesce(phase_started_at, updated_at, timezone('utc', now()))
where phase_started_at is null;

alter table public.user_settings
  alter column phase_started_at set default timezone('utc', now());

alter table public.user_settings
  alter column phase_started_at set not null;

drop trigger if exists user_settings_sync_phase_started_at on public.user_settings;
create trigger user_settings_sync_phase_started_at
before insert or update on public.user_settings
for each row
execute function public.sync_phase_started_at();

alter table public.checklist_templates
  add column if not exists is_supplement boolean not null default false;

alter table public.checklist_templates
  add column if not exists supplement_slugs text[] not null default array[]::text[];

update public.checklist_templates
set
  is_supplement = true,
  supplement_slugs = case template_key
    when 'morning_nac' then array['nac']
    when 'morning_tyrosin' then array['l-tyrosin']
    when 'morning_citicolin' then array['citicolin']
    when 'morning_uridin' then array['uridin-monophosphat']
    when 'morning_d3_k2' then array['vitamin-d3', 'k2']
    when 'morning_b_complex' then array['b-komplex']
    when 'morning_electrolytes' then array['elektrolyte']
    when 'training_electrolytes' then array['elektrolyte']
    when 'evening_nac' then array['nac']
    when 'evening_glycin' then array['glycin']
    when 'evening_theanin' then array['l-theanin']
    when 'evening_taurin' then array['taurin']
    when 'evening_ashwagandha' then array['ashwagandha-ksm-66', 'ashwagandha-shoden']
    when 'evening_magnesium' then array['magnesium']
    when 'evening_zink' then array['zink']
    else array[]::text[]
  end
where template_key in (
  'morning_nac',
  'morning_tyrosin',
  'morning_citicolin',
  'morning_uridin',
  'morning_d3_k2',
  'morning_b_complex',
  'morning_electrolytes',
  'training_electrolytes',
  'evening_nac',
  'evening_glycin',
  'evening_theanin',
  'evening_taurin',
  'evening_ashwagandha',
  'evening_magnesium',
  'evening_zink'
);

update public.checklist_templates
set
  is_supplement = false,
  supplement_slugs = array[]::text[]
where template_key not in (
  'morning_nac',
  'morning_tyrosin',
  'morning_citicolin',
  'morning_uridin',
  'morning_d3_k2',
  'morning_b_complex',
  'morning_electrolytes',
  'training_electrolytes',
  'evening_nac',
  'evening_glycin',
  'evening_theanin',
  'evening_taurin',
  'evening_ashwagandha',
  'evening_magnesium',
  'evening_zink'
);

drop table if exists public.meals cascade;
drop table if exists public.weekly_reviews cascade;
