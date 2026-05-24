import { useState } from "react";
import { Home } from "./pages/Home";
import { Studies } from "./pages/Studies";
import { Import } from "./pages/Import";
import { Drill } from "./pages/Drill";
import { useStudies } from "./useStudies";

type Tab = "home" | "studies" | "import" | "drill";

export default function App() {
  const { studies, loaded, addStudy, removeStudy, updateCard } = useStudies();
  const [tab, setTab] = useState<Tab>("home");

  if (!loaded) {
    return <div className="page center muted">Loading…</div>;
  }

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
        {tab === "import" && (
          <Import addStudy={addStudy} onAdded={() => setTab("studies")} />
        )}
        {tab === "drill" && (
          <Drill
            studies={studies}
            updateCard={updateCard}
            onDone={() => setTab("home")}
          />
        )}
      </main>

      {tab !== "drill" && (
        <nav className="tabbar">
          <button
            className={tab === "home" ? "active" : ""}
            onClick={() => setTab("home")}
          >
            Home
          </button>
          <button
            className={tab === "studies" ? "active" : ""}
            onClick={() => setTab("studies")}
          >
            Studies
          </button>
          <button
            className={tab === "import" ? "active" : ""}
            onClick={() => setTab("import")}
          >
            Import
          </button>
        </nav>
      )}
    </div>
  );
}
