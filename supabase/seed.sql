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
