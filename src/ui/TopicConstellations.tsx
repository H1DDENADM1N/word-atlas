import { Check } from "lucide-react";
import { cardPoints, type TopicConstellation } from "../galaxy/constellation";
import { TOPIC_COLORS } from "../galaxy/layout";

/**
 * One figure, drawn from the flattened star positions.
 *
 * Two states only, never both at once: dotted and neutral until the topic is
 * lit, then a solid gold figure with a soft glow. Drawing the earned part in
 * solid over a dotted remainder read as a half-finished sketch rather than a
 * constellation, and progress is already told by the bar underneath.
 */
function Figure({ t }: { t: TopicConstellation }) {
  const pts = cardPoints(t);
  const d = t.edges
    .map(([i, j]) => {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[j];
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    })
    .join("");
  return (
    <svg className={`cg ${t.lit ? "is-lit" : ""}`} viewBox="0 0 120 72" aria-hidden="true">
      <path className="cg-ghost" d={d} />
      {t.lit && <path className="cg-glow" d={d} />}
      {t.lit && <path className="cg-line" d={d} />}
      {pts.map(([x, y], i) => (
        <circle key={i} className="cg-star" cx={x.toFixed(1)} cy={y.toFixed(1)} r={t.lit ? 1.9 : 1.5} />
      ))}
    </svg>
  );
}

export function TopicConstellations({
  items,
  selected,
  onPick,
}: {
  items: TopicConstellation[];
  selected: number | null;
  onPick: (index: number | null) => void;
}) {
  const lit = items.filter((t) => t.lit).length;
  return (
    <section className="cpanel" id="topic-constellations" aria-labelledby="cpanel-title">
      <header className="cpanel-head">
        <div>
          <p className="eyebrow">话题星座</p>
          <h2 id="cpanel-title">
            已点亮 <b>{lit}</b> / {items.length} 座
          </h2>
        </div>
        <p className="cpanel-lede">本话题中有学习记录的词达到 80%，即可点亮星座。点亮不代表已经掌握。</p>
      </header>
      <ul className="cpanel-list">
        {items.map((t) => {
          const on = selected === t.index;
          const state = t.lit ? "已点亮" : t.learned ? `再学 ${t.toGo} 个词即可点亮` : "未开始";
          return (
            <li key={t.key} className={`ccard ${t.lit ? "is-lit" : ""} ${on ? "is-on" : ""} ${t.learned ? "" : "is-new"}`} style={{ "--tc": TOPIC_COLORS[t.index % TOPIC_COLORS.length] } as React.CSSProperties}>
              <button
                className="ccard-main"
                aria-pressed={on}
                aria-label={`${t.name}，${t.learned} / ${t.total} 词，${state}。在星图中查看`}
                onClick={() => onPick(on ? null : t.index)}
              >
                <Figure t={t} />
                <span className="ccard-name">
                  <b>{t.name}</b>
                  <small lang="en">{t.english}</small>
                </span>
                <span className="ccard-bar" aria-hidden="true">
                  {/* Fills against the 80% threshold, not against every word —
                      otherwise a lit constellation would still look unfinished. */}
                  <span style={{ width: `${Math.max(t.learned ? 2 : 0, t.drawn * 100)}%` }} />
                </span>
                <span className="ccard-meta">
                  <span className="ccard-count">
                    {t.learned.toLocaleString()}
                    <small> / {t.total.toLocaleString()}</small>
                  </span>
                  <span className="ccard-state">
                    {t.lit && <Check size={12} strokeWidth={2.6} />}
                    {t.lit ? "已点亮" : t.learned ? `再学 ${t.toGo} 个词` : "未开始"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
