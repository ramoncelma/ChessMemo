import { useCallback, useEffect, useState } from "react";
import { loadStudies, saveStudies } from "./storage";
import { isDue } from "./srs";
import type { Card, Chapter, Study } from "./types";

export function useStudies() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadStudies().then((s) => {
      setStudies(s);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: Study[]) => {
    setStudies(next);
    void saveStudies(next);
  }, []);

  const addStudy = useCallback(
    (study: Study) => persist([...studies, study]),
    [studies, persist],
  );

  const removeStudy = useCallback(
    (id: string) => persist(studies.filter((s) => s.id !== id)),
    [studies, persist],
  );

  const updateCard = useCallback(
    (studyId: string, card: Card) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? { ...s, cards: s.cards.map((c) => (c.id === card.id ? card : c)) }
            : s,
        ),
      );
    },
    [studies, persist],
  );

  const renameStudy = useCallback(
    (id: string, name: string) =>
      persist(studies.map((s) => (s.id === id ? { ...s, name } : s))),
    [studies, persist],
  );

  // Append a chapter and only the positions not already present (preserving
  // existing scheduling progress).
  const addChapter = useCallback(
    (id: string, chapter: Chapter, newCards: Card[]) => {
      persist(
        studies.map((s) => {
          if (s.id !== id) return s;
          const seen = new Set(s.cards.map((c) => `${c.fen}|${c.answerSan}`));
          const added = newCards.filter(
            (c) => !seen.has(`${c.fen}|${c.answerSan}`),
          );
          return {
            ...s,
            chapters: [...s.chapters, chapter],
            cards: [...s.cards, ...added],
          };
        }),
      );
    },
    [studies, persist],
  );

  const renameChapter = useCallback(
    (studyId: string, idx: number, name: string) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? {
                ...s,
                chapters: s.chapters.map((c, i) =>
                  i === idx ? { ...c, name } : c,
                ),
              }
            : s,
        ),
      );
    },
    [studies, persist],
  );

  return {
    studies,
    loaded,
    addStudy,
    removeStudy,
    updateCard,
    renameStudy,
    renameChapter,
    addChapter,
    persist,
  };
}

export interface DueItem {
  studyId: string;
  card: Card;
}

export function studyItems(study: Study): DueItem[] {
  return study.cards.map((card) => ({ studyId: study.id, card }));
}

export function chapterItems(study: Study, idx: number): DueItem[] {
  return study.cards
    .filter((c) => c.chapterIdx === idx)
    .map((card) => ({ studyId: study.id, card }));
}

// For "Practice position": only positions reached after at least 3 plies,
// shuffled, capped so it stays a quick recognition game.
export function positionItems(items: DueItem[], limit = 20): DueItem[] {
  const eligible = items.filter(
    (it) => it.card.line.split(/\s+/).filter(Boolean).length >= 3,
  );
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  return eligible.slice(0, limit);
}

export function dueCards(studies: Study[]): DueItem[] {
  const now = new Date();
  const items: DueItem[] = [];
  for (const s of studies) {
    for (const c of s.cards) {
      if (isDue(c.fsrs, now)) items.push({ studyId: s.id, card: c });
    }
  }
  items.sort(
    (a, b) =>
      new Date(a.card.fsrs.due).getTime() - new Date(b.card.fsrs.due).getTime(),
  );
  return items;
}
