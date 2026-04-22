import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  Gauge,
  Leaf,
  Pill,
  Salad,
  Settings2,
  Sparkles
} from "lucide-react";

export const APP_NAME = "Performance Tracker";

export const DAY_TYPE_OPTIONS = [
  { value: "training", label: "Trainingstag" },
  { value: "rest", label: "Restday" }
] as const;

export const SECTION_LABELS: Record<string, string> = {
  morning: "Morgen",
  meals: "Meals",
  training: "Training",
  evening: "Abend",
  sleep: "Schlaf"
};

export const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" }
] as const;

export const WEEK_DAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" }
] as const;

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

const WEEKLY_NAV_ITEM: NavItem = {
  href: "/weekly-review",
  label: "Weekly",
  icon: Sparkles
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/daily", label: "Daily", icon: CalendarCheck2 },
  { href: "/supplements", label: "Supps", icon: Pill },
  { href: "/nutrition", label: "Meals", icon: Salad },
  { href: "/phases", label: "Phasen", icon: Leaf },
  WEEKLY_NAV_ITEM,
  { href: "/settings", label: "Settings", icon: Settings2 }
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/daily", label: "Daily", icon: CalendarCheck2 },
  WEEKLY_NAV_ITEM
];

export const DEFAULT_SETUP_MESSAGE =
  "Supabase ist noch nicht verbunden. Trage zuerst URL und Anon Key in `.env.local` ein.";
