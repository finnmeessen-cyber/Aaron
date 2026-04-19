# Performance Tracker

Mobile-first Next.js PWA fuer iPhone und Mac mit Supabase als Backend fuer Lean Bulk, Supplements, Training und Cannabis-Quit-Tracking.

## Architekturueberblick

- `Next.js 14 App Router` fuer Routing, Layouts und serverseitige Datenabfragen
- `Supabase Auth + Postgres + RLS` fuer Login, Sync und saubere User-Trennung
- `Tailwind CSS` fuer ein bewusst leichtes, schnelles UI ohne Komponenten-Ballast
- `PWA-Basis` mit Manifest, Service Worker, Apple Touch Icon und Offline-Hinweisen
- `Clientseitige Formulare + serverseitige Page-Loads` fuer gute Mobile-UX und dennoch saubere Datenkonsistenz

## Projektstruktur

```text
.
├── app
│   ├── (app)
│   │   ├── dashboard
│   │   ├── daily
│   │   ├── nutrition
│   │   ├── phases
│   │   ├── settings
│   │   ├── supplements
│   │   └── weekly-review
│   ├── (auth)
│   │   └── login
│   ├── globals.css
│   ├── layout.tsx
│   ├── manifest.ts
│   └── offline
├── components
│   ├── app-shell
│   ├── auth
│   ├── charts
│   ├── daily
│   ├── navigation
│   ├── nutrition
│   ├── phases
│   ├── pwa
│   ├── providers
│   ├── settings
│   ├── supplements
│   └── ui
├── lib
│   ├── analytics.ts
│   ├── constants.ts
│   ├── data.ts
│   ├── utils.ts
│   └── supabase
├── public
│   ├── icons
│   └── sw.js
├── supabase
│   ├── schema.sql
│   └── seed.sql
└── types
    └── supabase.ts
```

## Wichtige Bereiche

- `app/(app)/layout.tsx`: geschuetztes App-Shell-Layout mit Header, Mobile-Navigation und Logout
- `lib/data.ts`: serverseitige Queries und aufbereitete Dashboard-/Review-Daten
- `components/daily/daily-tracker-form.tsx`: Kernflow fuer die taegliche Erfassung
- `components/settings/settings-form.tsx`: globale Steuerung fuer Makros, Phase, Theme und Supplements
- `supabase/schema.sql`: produktionsnahe Tabellen, Trigger und RLS Policies
- `supabase/seed.sql`: Standard-Checklisten, Stack, Phasen, Meal Templates und Tagesvorlagen

## Features

- Login und Signup mit Supabase Auth
- Daily Tracker mit Gewicht, Scores, Training, Kalorien, Notizen und Checklisten
- Dashboard mit Tagesuebersicht, Trends, Streak und Compliance
- Supplements-Seite mit aktiv/inaktiv, Dosis, Timing und Notizen
- Nutrition-Seite mit editierbaren Meal Templates
- Phase-System fuer Entzug, Stabilisierung und Performance Mode
- Weekly Review mit automatischen Vorschlaegen
- Settings fuer Makros, Trainingstage, Phase, Theme und Standardsupplements
- PWA-Installierbarkeit inkl. Offline-Hinweis

## Lokaler Start

Voraussetzungen:

- Node.js 20+
- npm 10+
- ein Supabase-Projekt

Schritte:

1. `.env.example` nach `.env.local` kopieren.
2. `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` eintragen.
3. Dependencies installieren:

```bash
npm install
```

4. Dev-Server starten:

```bash
npm run dev
```

5. App im Browser unter `http://localhost:3000` oeffnen.

## Supabase verbinden

1. Neues Projekt in Supabase anlegen.
2. Unter `Project Settings -> API` die Werte fuer URL und `anon public` Key kopieren.
3. Diese Werte in `.env.local` eintragen.
4. In `SQL Editor` zuerst `supabase/schema.sql` ausfuehren.
5. Danach `supabase/seed.sql` ausfuehren.
6. In `Authentication -> Providers` E-Mail/Passwort aktiv lassen.
7. Optional E-Mail Confirmation deaktivieren, wenn du lokal direkt nach Signup eingeloggt sein willst.

Hinweis:

- Die Seed-Dosierungen sind editierbare Template-Werte fuer deine App-Struktur, keine medizinische Empfehlung.

## Deployment

Empfohlen:

- Vercel fuer das Frontend
- Supabase fuer Auth und Datenbank

In Vercel:

1. Repository importieren.
2. `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` als Environment Variables setzen.
3. Deploy ausfuehren.

## GitHub Push

Wenn das Repo neu ist:

```bash
git init
git add .
git commit -m "feat: bootstrap performance tracker pwa"
git branch -M main
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git push -u origin main
```

Wenn du bereits ein Remote hast:

```bash
git add .
git commit -m "feat: build performance tracker pwa"
git push
```

## PWA auf dem iPhone installieren

1. Die App ueber eine HTTPS-URL in Safari oeffnen.
2. `Teilen` antippen.
3. `Zum Home-Bildschirm` waehlen.
4. Namen bestaetigen und hinzufuegen.
5. Danach startet die App im standalone-artigen PWA-Modus.

## Annahmen

- Fokus auf robuste, einfache CRUD-Flows statt komplexer Offline-Sync-Logik
- System-Templates fuer Meals, Phasen und Checklisten werden userseitig ueberschrieben statt global mutiert
- Charts bewusst leichtgewichtig ohne externe Chart-Library
- Design ist mobile-first und dark-mode-first, aber mit Theme-Schalter in Settings
