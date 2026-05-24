import { Board } from "../components/Board";
import {
  BOARD_THEMES,
  PIECE_SETS,
  type PieceSet,
  type Settings as SettingsType,
} from "../settings";

const PREVIEW_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

interface Props {
  settings: SettingsType;
  setBoardTheme: (id: string) => void;
  setPieceSet: (set: PieceSet) => void;
}

function pieceThumb(set: PieceSet): string {
  return `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/${set}/wN.svg`;
}

export function Settings({ settings, setBoardTheme, setPieceSet }: Props) {
  return (
    <div className="page">
      <h2>Appearance</h2>

      <div className="preview">
        <Board
          fen={PREVIEW_FEN}
          orientation="white"
          draggable={false}
          onDrop={() => false}
          boardThemeId={settings.boardThemeId}
          pieceSet={settings.pieceSet}
        />
      </div>

      <section>
        <h3 className="section-label">Board</h3>
        <div className="swatch-grid">
          {BOARD_THEMES.map((t) => (
            <button
              key={t.id}
              className={`swatch ${settings.boardThemeId === t.id ? "active" : ""}`}
              onClick={() => setBoardTheme(t.id)}
            >
              <span className="swatch-tiles">
                <span style={{ background: t.light }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.light }} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-label">Pieces</h3>
        <div className="piece-grid">
          {PIECE_SETS.map((set) => (
            <button
              key={set}
              className={`piece-option ${settings.pieceSet === set ? "active" : ""}`}
              onClick={() => setPieceSet(set)}
            >
              <img src={pieceThumb(set)} alt={set} />
              <span>{set}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
