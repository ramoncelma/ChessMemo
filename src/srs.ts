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

export function isDue(card: FsrsCard, now = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

// Memorization levels derived from the FSRS schedule. Missed/hinted moves are
// graded "again" so they keep a tiny interval and stay near the bottom; clean
// moves grow their interval and climb.
export const LEVEL_NAMES = ["New", "Learning", "Familiar", "Strong", "Retained"];
export const RETAINED_LEVEL = 3;

export function cardLevel(card: FsrsCard): number {
  if (card.reps === 0) return 0;
  const days = card.scheduled_days ?? 0;
  if (days < 1) return 1;
  if (days < 7) return 2;
  if (days < 21) return 3;
  return 4;
}
