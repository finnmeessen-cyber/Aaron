# Hevy Import Review Snapshot

This folder is a focused review package for the Hevy CSV import feature in the Next.js + Supabase app.

## Feature Summary

The feature lets an authenticated user upload a CSV exported from Hevy. The app parses the file, groups rows into workouts, saves source workout data, and marks the related training days in the tracker.

## Architecture Overview

CSV upload -> `hevy-csv-upload.tsx` -> `POST /api/hevy/import` -> CSV parsing and grouping -> database writes to `data_imports`, `source_workouts`, and `daily_entries`

Additional backend context files are included because the route depends on them:

- `import.ts`
- `database.ts`
- `hevy-types.ts`
- `supabase-server.ts`

## Table Roles

### `source_workouts`

Stores grouped Hevy workouts after CSV rows are consolidated by:

- `title`
- `start_time`
- `end_time`

Each row contains the normalized workout metadata plus the grouped raw CSV rows in `raw_payload`.

### `daily_entries`

Stores one row per user per calendar day. The import flow upserts matching dates with:

- `training_completed = true`
- `training_source = 'hevy'`

### `data_imports`

Stores one record per uploaded file, including metadata such as file hash, grouped workout count, and parsed row count.

## Included Files

- `route.ts`
- `hevy-csv-upload.tsx`
- `hevy-import-page.tsx`
- `settings-page.tsx`
- `supabase-client.ts`
- `supabase-server.ts`
- `import.ts`
- `database.ts`
- `hevy-types.ts`
- `schema.sql`
- `.env.example`

## How To Test

1. Export a workout CSV from Hevy.
2. Open the app page implemented in `hevy-import-page.tsx`.
3. Upload the CSV via `hevy-csv-upload.tsx`.
4. Verify the API response summary in the UI.
5. Check the database tables:
   - `public.data_imports`
   - `public.source_workouts`
   - `public.daily_entries`
