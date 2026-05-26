import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Practice } from "./pages/Practice";
import { ReadList } from "./pages/ReadList";
import { ReadView } from "./pages/ReadView";
import { Import } from "./pages/Import";
import { Drill, type DrillMode } from "./pages/Drill";
import { Settings } from "./pages/Settings";
import { useStudies, type DueItem } from "./useStudies";
import { useSettings } from "./settings";

type Tab = "dashboard" | "practice" | "read" | "import" | "settings" | "drill";

export default function App() {
  const {
    studies,
    loaded,
    addStudy,
    removeStudy,
    updateCard,
    renameStudy,
    renameChapter,
    addChapter,
  } = useStudies();
  const {
    settings,
    setBoardTheme,
    setPieceSet,
    setTheme,
    setPositionMissResetsLine,
  } = useSettings();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [drillItems, setDrillItems] = useState<DueItem[]>([]);
  const [drillMode, setDrillMode] = useState<DrillMode>("line");

  if (!loaded) {
    return <div className="page center muted">Loading…</div>;
  }

  const readingStudy = studies.find((s) => s.id === readingId) ?? null;

  function startDrill(items: DueItem[], mode: DrillMode) {
    setDrillItems(items);
    setDrillMode(mode);
    setTab("drill");
  }

  function practiceStudy(id: string) {
    const study = studies.find((s) => s.id === id);
    if (!study) return;
    startDrill(study.cards.map((card) => ({ studyId: id, card })), "line");
  }

  function openRead(id: string) {
    setReadingId(id);
    setTab("read");
  }

  const showTabbar = tab !== "drill";

  return (
    <div className="app">
      <main>
        {tab === "dashboard" && (
          <Dashboard
            studies={studies}
            onPractice={() => setTab("practice")}
            onRead={() => {
              setReadingId(null);
              setTab("read");
            }}
            onImport={() => setTab("import")}
            onSettings={() => setTab("settings")}
          />
        )}
        {tab === "practice" && (
          <Practice
            studies={studies}
            onStart={startDrill}
            onImport={() => setTab("import")}
          />
        )}
        {tab === "read" &&
          (readingStudy ? (
            <ReadView
              study={readingStudy}
              settings={settings}
              onBack={() => setReadingId(null)}
              onPractice={practiceStudy}
            />
          ) : (
            <ReadList
              studies={studies}
              onRead={openRead}
              onImport={() => setTab("import")}
            />
          ))}
        {tab === "import" && (
          <Import
            studies={studies}
            addStudy={addStudy}
            addChapter={addChapter}
            renameStudy={renameStudy}
            renameChapter={renameChapter}
            removeStudy={removeStudy}
            onDone={() => setTab("dashboard")}
          />
        )}
        {tab === "settings" && (
          <Settings
            settings={settings}
            setBoardTheme={setBoardTheme}
            setPieceSet={setPieceSet}
            setTheme={setTheme}
            setPositionMissResetsLine={setPositionMissResetsLine}
          />
        )}
        {tab === "drill" && (
          <Drill
            items={drillItems}
            mode={drillMode}
            studies={studies}
            settings={settings}
            updateCard={updateCard}
            onDone={() => setTab("dashboard")}
          />
        )}
      </main>

      {showTabbar && (
        <nav className="tabbar">
          <button
            className={tab === "dashboard" ? "active" : ""}
            onClick={() => setTab("dashboard")}
          >
            <span className="tab-ico">▦</span>
            Dashboard
          </button>
          <button
            className={tab === "practice" ? "active" : ""}
            onClick={() => setTab("practice")}
          >
            <span className="tab-ico">♟</span>
            Practice
          </button>
          <button
            className={tab === "read" ? "active" : ""}
            onClick={() => {
              setReadingId(null);
              setTab("read");
            }}
          >
            <span className="tab-ico">≣</span>
            Read
          </button>
          <button
            className={tab === "import" ? "active" : ""}
            onClick={() => setTab("import")}
          >
            <span className="tab-ico">＋</span>
            Import
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <span className="tab-ico">⚙</span>
            Settings
          </button>
        </nav>
      )}
    </div>
  );
}
