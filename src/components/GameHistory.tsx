interface GameHistoryEntry {
  id: string;
  created_at: string;
  scores: Array<{ id: string; name: string; score: number }>;
}

interface GameHistoryProps {
  entries: GameHistoryEntry[];
}

export function GameHistory({ entries }: GameHistoryProps) {
  if (!entries.length) return null;
  return (
    <section className="history-panel" aria-labelledby="history-title">
      <div>
        <span className="eyebrow">Recent games</span>
        <h2 id="history-title">Score history</h2>
      </div>
      <div className="history-list">
        {entries.slice(0, 5).map((entry) => (
          <article className="history-row" key={entry.id}>
            <time dateTime={entry.created_at}>
              {new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </time>
            <div>
              {entry.scores.map((score) => (
                <span key={score.id}><strong>{score.name}</strong> {score.score}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
