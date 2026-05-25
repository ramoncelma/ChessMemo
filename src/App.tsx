import { useState } from "react";
import { Home } from "./pages/Home";
import { Studies } from "./pages/Studies";
import { Import } from "./pages/Import";
import { Drill } from "./pages/Drill";
import { ReadView } from "./pages/ReadView";
import { Stats } from "./pages/Stats";
import { Settings } from "./pages/Settings";
import { useStudies, dueCards, type DueItem } from "./useStudies";
import { useSettings } from "./settings";

type Tab = "home" | "studies" | "stats" | "settings" | "import" | "drill" | "read";

export default function App() {
  const { studies, loaded, addStudy, removeStudy, updateCard } = useStudies();
  const { settings, setBoardTheme, setPieceSet } = useSettings();
  const [tab, setTab] = useState<Tab>("home");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drillItems, setDrillItems] = useState<DueItem[]>([]);

  if (!loaded) {
    return <div className="page center muted">Loading…</div>;
  }

  const activeStudy = studies.find((s) => s.id === activeId) ?? null;

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

  function readStudy(id: string) {
    setActiveId(id);
    setTab("read");
  }

  const showTabbar = tab === "home" || tab === "studies" || tab === "stats" || tab === "settings";

  return (
    <div className="app">
      <main>
        {tab === "home" && (
          <Home
            studies={studies}
            onDrill={reviewAllDue}
            onImport={() => setTab("import")}
          />
        )}
        {tab === "studies" && (
          <Studies
            studies={studies}
            removeStudy={removeStudy}
            onImport={() => setTab("import")}
            onRead={readStudy}
            onPractice={practiceStudy}
          />
        )}
        {tab === "stats" && <Stats studies={studies} />}
        {tab === "import" && (
          <Import
            addStudy={addStudy}
            onAdded={() => setTab("studies")}
            onCancel={() => setTab("studies")}
          />
        )}
        {tab === "settings" && (
          <Settings
            settings={settings}
            setBoardTheme={setBoardTheme}
            setPieceSet={setPieceSet}
          />
        )}
        {tab === "read" && activeStudy && (
          <ReadView
            study={activeStudy}
            settings={settings}
            onBack={() => setTab("studies")}
          />
        )}
        {tab === "drill" && (
          <Drill
            items={drillItems}
            studies={studies}
            settings={settings}
            updateCard={updateCard}
            onDone={() => setTab("home")}
          />
        )}
      </main>

      {showTabbar && (
        <nav className="tabbar">
          <button
            className={tab === "home" ? "active" : ""}
            onClick={() => setTab("home")}
          >
            <span className="tab-ico">♞</span>
            Home
          </button>
          <button
            className={tab === "studies" ? "active" : ""}
            onClick={() => setTab("studies")}
          >
            <span className="tab-ico">≣</span>
            Openings
          </button>
          <button
            className={tab === "stats" ? "active" : ""}
            onClick={() => setTab("stats")}
          >
            <span className="tab-ico">▦</span>
            Progress
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
