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
