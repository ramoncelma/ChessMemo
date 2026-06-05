import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Practice } from "./pages/Practice";
import { ReadList } from "./pages/ReadList";
import { ReadView } from "./pages/ReadView";
import { Repertoire } from "./pages/Repertoire";
import { LineDrill } from "./pages/LineDrill";
import { PositionDrill } from "./pages/PositionDrill";
import { RealGames } from "./pages/RealGames";
import { Settings } from "./pages/Settings";
import { useStudies, type LineItem, type PositionItem } from "./useStudies";
import { useSettings } from "./settings";
import { I18nContext, makeT } from "./i18n";
import {
  flushPendingPush,
  getProfile,
  pullFromCloud,
  pushToCloud,
  syncOnStart,
  type SyncResult,
} from "./sync";

type Tab =
  | "dashboard"
  | "practice"
  | "read"
  | "realgames"
  | "repertoire"
  | "settings"
  | "drill";

type DrillState =
  | { kind: "line"; items: LineItem[]; freeze: boolean }
  | { kind: "position"; positions: PositionItem[] }
  | null;

export default function App() {
  const [syncPhase, setSyncPhase] = useState<"pending" | "ready">(
    getProfile() ? "pending" : "ready",
  );
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    if (syncPhase !== "pending") return;
    syncOnStart().then((r) => {
      setSyncResult(r);
      setSyncPhase("ready");
    });
  }, [syncPhase]);

  useEffect(() => {
    const onUnload = () => {
      void flushPendingPush();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  if (syncPhase === "pending") {
    const profile = getProfile();
    return (
      <div className="page center muted">
        Syncing {profile?.name ?? ""}…
      </div>
    );
  }

  return (
    <AppInner
      initialSyncResult={syncResult}
      clearSyncResult={() => setSyncResult(null)}
      reload={() => setSyncPhase("pending")}
    />
  );
}

interface InnerProps {
  initialSyncResult: SyncResult | null;
  clearSyncResult: () => void;
  reload: () => void;
}

function AppInner({ initialSyncResult, clearSyncResult, reload }: InnerProps) {
  const [conflict, setConflict] = useState<SyncResult | null>(
    initialSyncResult?.status === "conflict" ? initialSyncResult : null,
  );
  const [syncError, setSyncError] = useState<string | null>(
    initialSyncResult?.status === "error"
      ? initialSyncResult.message ?? "Sync error"
      : null,
  );

  async function resolveConflict(side: "cloud" | "local") {
    try {
      if (side === "cloud") {
        await pullFromCloud();
        setConflict(null);
        clearSyncResult();
        reload();
      } else {
        await pushToCloud();
        setConflict(null);
        clearSyncResult();
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  }

  const {
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
    pauseLowWeight,
    resumeAllInChapter,
  } = useStudies();
  const {
    settings,
    setBoardTheme,
    setPieceSet,
    setTheme,
    setPositionMissResetsLine,
    setLang,
    setLichessUser,
    setChesscomUser,
    setImportSince,
    setSpeed,
    setOpponentDelayMs,
    setEngineLines,
    setEngineArrows,
    setReplayFromStartOnMiss,
    setVacation,
    setChapterView,
    setForgiveIfEngineEquivalent,
    setForgiveCpTolerance,
    setCoverageThreshold,
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
        {conflict && (
          <div className="sync-banner conflict">
            <span>
              Sync conflict: this device and the cloud both have unsynced
              changes. Keep which copy?
            </span>
            <div className="row">
              <button className="small" onClick={() => resolveConflict("cloud")}>
                Use cloud
              </button>
              <button
                className="small primary"
                onClick={() => resolveConflict("local")}
              >
                Keep this device
              </button>
            </div>
          </div>
        )}
        {syncError && (
          <div className="sync-banner error">
            <span>Sync error: {syncError}</span>
            <button className="small" onClick={() => setSyncError(null)}>
              Dismiss
            </button>
          </div>
        )}
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
              onImport={() => setTab("repertoire")}
              onSettings={() => setTab("settings")}
              onStartLine={startLine}
            />
          )}
          {tab === "practice" && (
            <Practice
              studies={studies}
              settings={settings}
              onStartLine={startLine}
              onStartPosition={startPosition}
              onImport={() => setTab("repertoire")}
              pauseLowWeight={pauseLowWeight}
              resumeAllInChapter={resumeAllInChapter}
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
                setPaused={setPaused}
                pauseLowWeight={pauseLowWeight}
                resumeAllInChapter={resumeAllInChapter}
              />
            ) : (
              <ReadList
                studies={studies}
                onRead={(id) => openRead(id, null)}
                onImport={() => setTab("repertoire")}
              />
            ))}
          {tab === "realgames" && (
            <RealGames
              studies={studies}
              settings={settings}
              onSettings={() => setTab("settings")}
            />
          )}
          {tab === "repertoire" && (
            <Repertoire
              studies={studies}
              settings={settings}
              addStudy={addStudy}
              addChapter={addChapter}
              addToChapter={addToChapter}
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
              setChesscomUser={setChesscomUser}
              setImportSince={setImportSince}
              setSpeed={setSpeed}
              setOpponentDelayMs={setOpponentDelayMs}
              setEngineLines={setEngineLines}
              setEngineArrows={setEngineArrows}
              setReplayFromStartOnMiss={setReplayFromStartOnMiss}
              setVacation={setVacation}
              setChapterView={setChapterView}
              setForgiveIfEngineEquivalent={setForgiveIfEngineEquivalent}
              setForgiveCpTolerance={setForgiveCpTolerance}
              setCoverageThreshold={setCoverageThreshold}
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
              className={tab === "repertoire" ? "active" : ""}
              onClick={() => setTab("repertoire")}
            >
              <span className="tab-ico">＋</span>
              {t("nav.repertoire")}
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
