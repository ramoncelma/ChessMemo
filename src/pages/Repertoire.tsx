import { useState } from "react";
import { Import } from "./Import";
import { ManualBuilder } from "./ManualBuilder";
import { useT } from "../i18n";
import type { Settings } from "../settings";
import type { Chapter, Line, Study } from "../types";
import type { Speed } from "../settings";

interface Props {
  studies: Study[];
  settings: Settings;
  addStudy: (s: Study) => void;
  addChapter: (id: string, chapter: Chapter, lines: Line[]) => void;
  renameStudy: (id: string, name: string) => void;
  renameChapter: (id: string, idx: number, name: string) => void;
  removeStudy: (id: string) => void;
  setCategories: (id: string, categories: Speed[]) => void;
  onDone: () => void;
}

type Mode = "import" | "create";

export function Repertoire({
  studies,
  settings,
  addStudy,
  addChapter,
  renameStudy,
  renameChapter,
  removeStudy,
  setCategories,
  onDone,
}: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("import");

  return (
    <div className="page">
      <h2>{t("repertoire.title")}</h2>

      <div className="seg">
        <button
          className={mode === "import" ? "active" : ""}
          onClick={() => setMode("import")}
        >
          {t("repertoire.importTab")}
        </button>
        <button
          className={mode === "create" ? "active" : ""}
          onClick={() => setMode("create")}
        >
          {t("repertoire.createTab")}
        </button>
      </div>

      {mode === "import" ? (
        <Import
          studies={studies}
          addStudy={addStudy}
          addChapter={addChapter}
          renameStudy={renameStudy}
          renameChapter={renameChapter}
          removeStudy={removeStudy}
          setCategories={setCategories}
          onDone={onDone}
        />
      ) : (
        <ManualBuilder settings={settings} addStudy={addStudy} onDone={onDone} />
      )}
    </div>
  );
}
