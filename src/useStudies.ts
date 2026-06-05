import { useCallback, useEffect, useState } from "react";
import { loadStudies, saveStudies } from "./storage";
import { buildLines } from "./pgn";
import { mergeTrees, parsePgn, treeToPgn } from "./pgnTree";
import { isDue } from "./srs";
import { nowSrs } from "./clock";
import { scheduleWeightCompute } from "./weightsScheduler";
import type { Chapter, Line, Orientation, Study } from "./types";
import type { Speed } from "./settings";

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

  const updateLine = useCallback(
    (studyId: string, line: Line) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? { ...s, lines: s.lines.map((l) => (l.id === line.id ? line : l)) }
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

  // Append a chapter and only the lines not already present (by move sequence).
  const addChapter = useCallback(
    (id: string, chapter: Chapter, newLines: Line[]) => {
      persist(
        studies.map((s) => {
          if (s.id !== id) return s;
          const sig = (l: Line) => l.moves.map((m) => m.san).join(" ");
          const seen = new Set(s.lines.map(sig));
          const added = newLines.filter((l) => !seen.has(sig(l)));
          return {
            ...s,
            chapters: [...s.chapters, chapter],
            lines: [...s.lines, ...added],
          };
        }),
      );
    },
    [studies, persist],
  );

  const setCategories = useCallback(
    (id: string, categories: Speed[]) =>
      persist(studies.map((s) => (s.id === id ? { ...s, categories } : s))),
    [studies, persist],
  );

  // Overlay a new PGN onto an existing chapter. Overlapping lines keep their
   // schedule and stats; new lines start fresh; the chapter PGN is replaced
  // with the merged tree so Read shows everything.
  const addToChapter = useCallback(
    (studyId: string, chapterIdx: number, additionalPgn: string) => {
      persist(
        studies.map((s) => {
          if (s.id !== studyId) return s;
          const chapter = s.chapters[chapterIdx];
          if (!chapter) return s;
          try {
            const aTree = parsePgn(chapter.pgn);
            const bTree = parsePgn(additionalPgn);
            const merged = mergeTrees(aTree, bTree);
            const newPgn = treeToPgn(merged, chapter.name);
            const rebuilt = buildLines(newPgn, s.orientation, chapterIdx);
            const existingBySig = new Map(
              s.lines
                .filter((l) => l.chapterIdx === chapterIdx)
                .map((l) => [l.moves.map((m) => m.san).join(" "), l]),
            );
            const reconciled = rebuilt.map((nl) => {
              const sig = nl.moves.map((m) => m.san).join(" ");
              const ex = existingBySig.get(sig);
              if (!ex) return nl;
              return {
                ...nl,
                id: ex.id,
                sched: ex.sched,
                attempts: ex.attempts,
                misses: ex.misses,
                lineTimes: ex.lineTimes,
                moveTimes: ex.moveTimes,
                paused: ex.paused,
                weight: ex.weight,
              };
            });
            const otherLines = s.lines.filter(
              (l) => l.chapterIdx !== chapterIdx,
            );
            const chapters = s.chapters.map((c, i) =>
              i === chapterIdx ? { ...c, pgn: newPgn } : c,
            );
            return { ...s, chapters, lines: [...otherLines, ...reconciled] };
          } catch {
            return s;
          }
        }),
      );
    },
    [studies, persist],
  );

  const setPaused = useCallback(
    (studyId: string, lineId: string, paused: boolean) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? {
                ...s,
                lines: s.lines.map((l) =>
                  l.id === lineId ? { ...l, paused } : l,
                ),
              }
            : s,
        ),
      );
    },
    [studies, persist],
  );

  // Stable, stale-safe writer. Used both by the user-triggered API and by the
  // background weights scheduler (which fires after async fetches).
  const setLineWeights = useCallback(
    (studyId: string, weights: Map<string, number>) => {
      setStudies((prev) => {
        const next = prev.map((s) =>
          s.id === studyId
            ? {
                ...s,
                lines: s.lines.map((l) =>
                  weights.has(l.id) ? { ...l, weight: weights.get(l.id) } : l,
                ),
              }
            : s,
        );
        void saveStudies(next);
        return next;
      });
    },
    [],
  );

  // Auto-trigger background weight computation when a study has lines that
  // don't have a computed weight yet. Once every line has a defined `weight`
  // (the result of one full compute), this stops firing — so reloads, PWA
  // auto-updates, and cloud-sync-pulls don't restart the compute from zero.
  useEffect(() => {
    if (!loaded) return;
    for (const study of studies) {
      if (study.lines.length === 0) continue;
      const needs = study.lines.some((l) => l.weight === undefined);
      if (needs) scheduleWeightCompute(study, setLineWeights);
    }
  }, [studies, loaded, setLineWeights]);

  const pauseLowWeight = useCallback(
    (studyId: string, chapterIdx: number, thresholdPct: number) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? {
                ...s,
                lines: s.lines.map((l) =>
                  // Only pause lines whose weight has been computed AND is
                  // below the threshold. Lines without a computed weight are
                  // left alone so the action doesn't nuke a chapter while
                  // the background scheduler is still working.
                  l.chapterIdx === chapterIdx &&
                  l.weight !== undefined &&
                  l.weight < thresholdPct
                    ? { ...l, paused: true }
                    : l,
                ),
              }
            : s,
        ),
      );
    },
    [studies, persist],
  );

  const resumeAllInChapter = useCallback(
    (studyId: string, chapterIdx: number) => {
      persist(
        studies.map((s) =>
          s.id === studyId
            ? {
                ...s,
                lines: s.lines.map((l) =>
                  l.chapterIdx === chapterIdx ? { ...l, paused: false } : l,
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
    updateLine,
    renameStudy,
    renameChapter,
    addChapter,
    addToChapter,
    setCategories,
    setPaused,
    setLineWeights,
    pauseLowWeight,
    resumeAllInChapter,
    persist,
  };
}

export interface LineItem {
  studyId: string;
  line: Line;
}

// Paused lines are excluded from practice and scheduling. Read-mode UIs work
// directly with `study.lines` so they still see paused lines.
export function lineItemsOf(study: Study): LineItem[] {
  return study.lines
    .filter((l) => !l.paused)
    .map((line) => ({ studyId: study.id, line }));
}

export function chapterLineItems(study: Study, idx: number): LineItem[] {
  return study.lines
    .filter((l) => l.chapterIdx === idx && !l.paused)
    .map((line) => ({ studyId: study.id, line }));
}

export function dueLines(studies: Study[]): LineItem[] {
  const now = nowSrs();
  const items: LineItem[] = [];
  for (const s of studies) {
    for (const line of s.lines) {
      if (line.paused) continue;
      if (isDue(line.sched, now)) items.push({ studyId: s.id, line });
    }
  }
  items.sort((a, b) => a.line.sched.due - b.line.sched.due);
  return items;
}

export interface PositionItem {
  studyId: string;
  lineId: string;
  orientation: Orientation;
  fenBefore: string;
  from: string;
  to: string;
  san: string;
}

// Random single-move positions (reached after 3+ plies) drawn from the given
// lines — used by "Practice position".
export function buildPositions(
  study: Study,
  items: LineItem[],
  limit = 20,
): PositionItem[] {
  const want = study.orientation === "white" ? "w" : "b";
  const all: PositionItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    it.line.moves.forEach((m, i) => {
      if (m.color !== want || i < 3) return;
      const key = `${m.fenBefore}|${m.san}`;
      if (seen.has(key)) return;
      seen.add(key);
      all.push({
        studyId: study.id,
        lineId: it.line.id,
        orientation: study.orientation,
        fenBefore: m.fenBefore,
        from: m.from,
        to: m.to,
        san: m.san,
      });
    });
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, limit);
}
