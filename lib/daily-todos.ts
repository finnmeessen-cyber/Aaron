export type DailyTodoItem = {
  id: string;
  time: string;
  title: string;
};

export type DailyTodoSourceInput = {
  date: string;
  dayType: "training" | "rest";
  supplementTaskCounts?: Record<string, number>;
  timezone?: string | null;
};

export type DailyTodoSource = (input: DailyTodoSourceInput) => DailyTodoItem[];

const BASE_TODO_ITEMS: Record<DailyTodoSourceInput["dayType"], DailyTodoItem[]> = {
  rest: [
    {
      id: "morning-supplements",
      time: "08:00",
      title: "Supplements morgens"
    },
    {
      id: "breakfast",
      time: "08:30",
      title: "Frühstück"
    },
    {
      id: "lunch",
      time: "12:30",
      title: "Lunch"
    },
    {
      id: "walk",
      time: "16:30",
      title: "Kurzer Spaziergang"
    },
    {
      id: "dinner",
      time: "19:00",
      title: "Dinner"
    },
    {
      id: "evening-supplements",
      time: "21:30",
      title: "Abend-Supplements"
    }
  ],
  training: [
    {
      id: "morning-supplements",
      time: "08:00",
      title: "Supplements morgens"
    },
    {
      id: "breakfast",
      time: "08:30",
      title: "Frühstück"
    },
    {
      id: "lunch",
      time: "12:30",
      title: "Lunch"
    },
    {
      id: "pre-workout-meal",
      time: "16:30",
      title: "Pre-Workout-Mahlzeit"
    },
    {
      id: "training",
      time: "18:00",
      title: "Training"
    },
    {
      id: "post-workout-dinner",
      time: "20:00",
      title: "Dinner + Protein"
    },
    {
      id: "evening-supplements",
      time: "21:30",
      title: "Abend-Supplements"
    }
  ]
};

function withSupplementLabels(
  items: DailyTodoItem[],
  supplementTaskCounts: Record<string, number>
) {
  return items
    .filter((item) => {
      if (!item.id.includes("supplements")) {
        return true;
      }

      return (supplementTaskCounts[item.id] ?? 0) > 0;
    })
    .map((item) => {
      if (!item.id.includes("supplements")) {
        return item;
      }

      const supplementCount = supplementTaskCounts[item.id] ?? 0;

      return {
        ...item,
        title: `${item.title} (${supplementCount})`
      };
    });
}

export const mockDailyTodoSource: DailyTodoSource = ({
  dayType,
  supplementTaskCounts = {}
}: DailyTodoSourceInput) => {
  return withSupplementLabels(BASE_TODO_ITEMS[dayType], supplementTaskCounts);
};

export function getDailyTodoItems(
  input: DailyTodoSourceInput,
  source: DailyTodoSource = mockDailyTodoSource
) {
  const items = source(input);

  return [...items].sort((left, right) => left.time.localeCompare(right.time));
}

export function toDailyTodoMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return Number.POSITIVE_INFINITY;
  }

  return hours * 60 + minutes;
}
