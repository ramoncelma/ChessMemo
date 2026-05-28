import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Practice } from "./pages/Practice";
import { ReadList } from "./pages/ReadList";
import { ReadView } from "./pages/ReadView";
import { Import } from "./pages/Import";
import { LineDrill } from "./pages/LineDrill";
import { PositionDrill } from "./pages/PositionDrill";
import { RealGames } from "./pages/RealGames";
import { Settings } from "./pages/Settings";
import { useStudies, type LineItem, type PositionItem } from "./useStudies";
import { useSettings } from "./settings";
import { I18nContext, makeT } from "./i18n";

type Tab =
  | "dashboard"
  | "practice"
  | "read"
  | "realgames"
  | "import"
  | "settings"
  | "drill";

type DrillState =
  | { kind: "line"; items: LineItem[]; freeze: boolean }
  | { kind: "position"; positions: PositionItem[] }
  | null;

export default function App() {
  const {
    studies,
    loaded,
    addStudy,
    removeStudy,
    updateLine,
    renameStudy,
    renameChapter,
    addChapter,
    setCategories,
  } = useStudies();
  const {
    settings,
    setBoardTheme,
    setPieceSet,
    setTheme,
    setPositionMissResetsLine,
    setLang,
    setLichessUser,
    setImportSince,
    setSpeed,
  } = useSettings();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readingLineId, setReadingLineId] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillState>(null);

  const t = makeT(settings.lang);

  if (!loaded) {
    return <div className="page center muted">{t("common.loading")}</div>;
  }

  const readingStudy = studies.find((s) => s.id === readingId) ?? null;

  function startLine(items: LineItem[], freeze = false) {
    if (items.length === 0) return;
    setDrill({ kind: "line", items, freeze });
    setTab("drill");
  }

  function startPosition(positions: PositionItem[]) {
    if (positions.length === 0) return;
    setDrill({ kind: "position", positions });
    setTab("drill");
  }

  function openRead(studyId: string, lineId: string | null) {
    setReadingId(studyId);
    setReadingLineId(lineId);
    setDrill(null);
    setTab("read");
  }

  function endDrill() {
    setDrill(null);
    setTab("dashboard");
  }

  const showTabbar = tab !== "drill";

  return (
    <I18nContext.Provider value={t}>
      <div className="app">
        <main>
          {tab === "dashboard" && (
            <Dashboard
              studies={studies}
              onPractice={() => setTab("practice")}
              onRead={() => {
                setReadingId(null);
                setReadingLineId(null);
                setTab("read");
              }}
              onImport={() => setTab("import")}
              onSettings={() => setTab("settings")}
              onStartLine={startLine}
            />
          )}
          {tab === "practice" && (
            <Practice
              studies={studies}
              onStartLine={startLine}
              onStartPosition={startPosition}
              onImport={() => setTab("import")}
            />
          )}
          {tab === "read" &&
            (readingStudy ? (
              <ReadView
                study={readingStudy}
                settings={settings}
                initialLineId={readingLineId}
                onBack={() => {
                  setReadingId(null);
                  setReadingLineId(null);
                }}
                onPractice={startLine}
              />
            ) : (
              <ReadList
                studies={studies}
                onRead={(id) => openRead(id, null)}
                onImport={() => setTab("import")}
              />
            ))}
          {tab === "realgames" && (
            <RealGames
              studies={studies}
              settings={settings}
              onSettings={() => setTab("settings")}
            />
          )}
          {tab === "import" && (
            <Import
              studies={studies}
              addStudy={addStudy}
              addChapter={addChapter}
              renameStudy={renameStudy}
              renameChapter={renameChapter}
              removeStudy={removeStudy}
              setCategories={setCategories}
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
              setLang={setLang}
              setLichessUser={setLichessUser}
              setImportSince={setImportSince}
              setSpeed={setSpeed}
            />
          )}
          {tab === "drill" && drill?.kind === "line" && (
            <LineDrill
              items={drill.items}
              studies={studies}
              settings={settings}
              updateLine={updateLine}
              freezeOnSuccess={drill.freeze}
              onOpenRead={openRead}
              onDone={endDrill}
            />
          )}
          {tab === "drill" && drill?.kind === "position" && (
            <PositionDrill
              positions={drill.positions}
              studies={studies}
              settings={settings}
              updateLine={updateLine}
              onDone={endDrill}
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
              {t("nav.dashboard")}
            </button>
            <button
              className={tab === "practice" ? "active" : ""}
              onClick={() => setTab("practice")}
            >
              <span className="tab-ico">♟</span>
              {t("nav.practice")}
            </button>
            <button
              className={tab === "read" ? "active" : ""}
              onClick={() => {
                setReadingId(null);
                setReadingLineId(null);
                setTab("read");
              }}
            >
              <span className="tab-ico">≣</span>
              {t("nav.read")}
            </button>
            <button
              className={tab === "realgames" ? "active" : ""}
              onClick={() => setTab("realgames")}
            >
              <span className="tab-ico">♞</span>
              {t("nav.realGames")}
            </button>
            <button
              className={tab === "import" ? "active" : ""}
              onClick={() => setTab("import")}
            >
              <span className="tab-ico">＋</span>
              {t("nav.import")}
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              <span className="tab-ico">⚙</span>
              {t("nav.settings")}
            </button>
          </nav>
        )}
      </div>
    </I18nContext.Provider>
  );
}
