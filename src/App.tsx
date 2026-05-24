import { useState } from "react";
import { Home } from "./pages/Home";
import { Studies } from "./pages/Studies";
import { Import } from "./pages/Import";
import { Drill } from "./pages/Drill";
import { Stats } from "./pages/Stats";
import { Settings } from "./pages/Settings";
import { useStudies } from "./useStudies";
import { useSettings } from "./settings";

type Tab = "home" | "studies" | "stats" | "settings" | "import" | "drill";

export default function App() {
  const { studies, loaded, addStudy, removeStudy, updateCard } = useStudies();
  const { settings, setBoardTheme, setPieceSet } = useSettings();
  const [tab, setTab] = useState<Tab>("home");

  if (!loaded) {
    return <div className="page center muted">Loading…</div>;
  }

  const showTabbar = tab !== "drill" && tab !== "import";

  return (
    <div className="app">
      <main>
        {tab === "home" && (
          <Home
            studies={studies}
            onDrill={() => setTab("drill")}
            onImport={() => setTab("import")}
          />
        )}
        {tab === "studies" && (
          <Studies
            studies={studies}
            removeStudy={removeStudy}
            onImport={() => setTab("import")}
          />
        )}
        {tab === "stats" && <Stats studies={studies} />}
        {tab === "import" && (
          <Import addStudy={addStudy} onAdded={() => setTab("studies")} />
        )}
        {tab === "settings" && (
          <Settings
            settings={settings}
            setBoardTheme={setBoardTheme}
            setPieceSet={setPieceSet}
          />
        )}
        {tab === "drill" && (
          <Drill
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
            Lines
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
