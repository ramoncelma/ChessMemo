import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from "ts-fsrs";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export function newCard(): FsrsCard {
  return createEmptyCard(new Date());
}

export type Grade = "again" | "hard" | "good" | "easy";

const ratingFor: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function grade(card: FsrsCard, g: Grade): FsrsCard {
  return scheduler.next(card, new Date(), ratingFor[g]).card;
}

// Human-readable "next due in" preview for each button, e.g. "10m", "2d".
export function previewIntervals(card: FsrsCard): Record<Grade, string> {
  const now = new Date();
  const log = scheduler.repeat(card, now);
  const fmt = (due: Date) => {
    const mins = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60000));
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.round(days / 30);
    return `${months}mo`;
  };
  return {
    again: fmt(log[Rating.Again].card.due),
    hard: fmt(log[Rating.Hard].card.due),
    good: fmt(log[Rating.Good].card.due),
    easy: fmt(log[Rating.Easy].card.due),
  };
}

export function isDue(card: FsrsCard, now = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}
