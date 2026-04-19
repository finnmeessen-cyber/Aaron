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
