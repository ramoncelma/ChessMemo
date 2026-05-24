import { useCallback, useEffect, useState } from "react";
import { loadStudies, saveStudies } from "./storage";
import { isDue } from "./srs";
import type { Card, Study } from "./types";

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

  return { studies, loaded, addStudy, removeStudy, updateCard, persist };
}

export interface DueItem {
  studyId: string;
  card: Card;
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
