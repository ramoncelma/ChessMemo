import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Practice } from "./pages/Practice";
import { ReadList } from "./pages/ReadList";
import { ReadView } from "./pages/ReadView";
import { Import } from "./pages/Import";
import { Drill } from "./pages/Drill";
import { Settings } from "./pages/Settings";
import { useStudies, dueCards, type DueItem } from "./useStudies";
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
    addChapter,
  } = useStudies();
  const { settings, setBoardTheme, setPieceSet, setTheme } = useSettings();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [drillItems, setDrillItems] = useState<DueItem[]>([]);

  if (!loaded) {
    return <div className="page center muted">Loading…</div>;
  }

  const readingStudy = studies.find((s) => s.id === readingId) ?? null;

  function reviewAllDue() {
    setDrillItems(dueCards(studies));
    setTab("drill");
  }

  function practiceStudy(id: string) {
    const study = studies.find((s) => s.id === id);
    if (!study) return;
    setDrillItems(study.cards.map((card) => ({ studyId: id, card })));
    setTab("drill");
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
            onReviewDue={reviewAllDue}
            onPracticeStudy={practiceStudy}
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
          />
        )}
        {tab === "drill" && (
          <Drill
            items={drillItems}
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
