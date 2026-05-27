import { useT, levelName, levelInterval } from "../i18n";

export function LevelBadge({ level }: { level: number }) {
  const t = useT();
  const title =
    level === 0
      ? t("level.new")
      : `${levelName(t, level)} · ${levelInterval(t, level)}`;
  return (
    <span className="lvl-badge" title={title}>
      <span className={`level-dot lvl-${level}`} />
      {level === 0 ? t("level.new") : `L${level}`}
    </span>
  );
}
