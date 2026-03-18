import { useState, useMemo } from "react";
import { DiffEntry, DiffStatus, formatBytes } from "../types";

interface Props {
  entries: DiffEntry[];
  onConfirmBackup: (selected: DiffEntry[]) => void;
  isScanning: boolean;
}

const STATUS_COLOR: Record<DiffStatus, string> = {
  added:     "var(--green)",
  modified:  "var(--yellow)",
  deleted:   "var(--red)",
  renamed:   "var(--blue)",
  unchanged: "var(--text-2)",
};

const STATUS_LABEL: Record<DiffStatus, string> = {
  added:     "A",
  modified:  "M",
  deleted:   "D",
  renamed:   "R",
  unchanged: "–",
};

type FilterTab = "all" | DiffStatus;

export default function DiffViewer({ entries, onConfirmBackup, isScanning }: Props) {
  const [filter, setFilter]     = useState<FilterTab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy]     = useState<"path" | "size" | "status">("status");

  const counts = useMemo(() => ({
    added:    entries.filter(e => e.status === "added").length,
    modified: entries.filter(e => e.status === "modified").length,
    deleted:  entries.filter(e => e.status === "deleted").length,
    renamed:  entries.filter(e => e.status === "renamed").length,
  }), [entries]);

  const visible = useMemo(() => {
    const filtered = filter === "all" ? entries : entries.filter(e => e.status === filter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "path")   return a.relative_path.localeCompare(b.relative_path);
      if (sortBy === "size")   return b.size_bytes - a.size_bytes;
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return 0;
    });
  }, [entries, filter, sortBy]);

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map(e => e.relative_path)));
    }
  };

  const handleBackup = () => {
    const toBackup = entries.filter(e => selected.has(e.relative_path));
    onConfirmBackup(toBackup);
  };

  const totalSelectedBytes = useMemo(() => {
    return entries
      .filter(e => selected.has(e.relative_path))
      .reduce((acc, e) => acc + (e.size_delta > 0 ? e.size_delta : 0), 0);
  }, [selected, entries]);

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all",      label: "All",      count: entries.length },
    { key: "added",    label: "Added",    count: counts.added },
    { key: "modified", label: "Modified", count: counts.modified },
    { key: "deleted",  label: "Deleted",  count: counts.deleted },
    { key: "renamed",  label: "Renamed",  count: counts.renamed },
  ];

  if (isScanning) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)", letterSpacing: "0.05em" }}>
          scanning files...
        </div>
        <div style={{ width: 200, height: 1, background: "var(--border)", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", height: "100%", width: 60,
            background: "var(--accent)",
            animation: "scan 1.2s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes scan { 0%{left:-60px} 100%{left:200px} }`}</style>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 28, opacity: 0.2 }}>✓</div>
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>Everything is up to date</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* filter tabs */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        flexShrink: 0,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: "none",
              padding: "10px 12px",
              fontSize: 12,
              color: filter === tab.key ? "var(--text-0)" : "var(--text-2)",
              borderBottom: filter === tab.key ? "1px solid var(--accent)" : "1px solid transparent",
              borderRadius: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                background: "var(--bg-3)",
                color: "var(--text-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 3,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--text-2)", fontSize: 11, fontFamily: "var(--font-mono)" }}>sort</span>
          {(["status", "path", "size"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                background: sortBy === s ? "var(--bg-3)" : "none",
                color: sortBy === s ? "var(--text-0)" : "var(--text-2)",
                padding: "3px 8px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                borderRadius: 3,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "20px 16px 1fr 80px 80px",
        gap: "0 12px",
        padding: "6px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        flexShrink: 0,
      }}>
        <input
          type="checkbox"
          checked={selected.size === visible.length && visible.length > 0}
          onChange={selectAll}
          style={{ accentColor: "var(--accent)", cursor: "pointer" }}
        />
        <span />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Path</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.06em" }}>Size</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.06em" }}>Delta</span>
      </div>

      {/* file rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {visible.map((entry, i) => {
          const isSelected = selected.has(entry.relative_path);
          return (
            <div
              key={entry.relative_path}
              onClick={() => toggleSelect(entry.relative_path)}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 16px 1fr 80px 80px",
                gap: "0 12px",
                padding: "5px 16px",
                cursor: "pointer",
                background: isSelected ? "var(--bg-2)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                borderLeft: isSelected ? "1px solid var(--accent-dim)" : "1px solid transparent",
                alignItems: "center",
                contentVisibility: "auto",
                containIntrinsicSize: "0 34px",
              } as React.CSSProperties}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(entry.relative_path)}
                onClick={e => e.stopPropagation()}
                style={{ accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 500,
                color: STATUS_COLOR[entry.status],
              }}>
                {STATUS_LABEL[entry.status]}
              </span>
              <div style={{ overflow: "hidden" }}>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: entry.status === "deleted" ? "var(--text-2)" : "var(--text-0)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textDecoration: entry.status === "deleted" ? "line-through" : "none",
                }}>
                  {entry.relative_path}
                </div>
                {entry.status === "renamed" && entry.old_path && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", marginTop: 1 }}>
                    ← {entry.old_path}
                  </div>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-1)", textAlign: "right" }}>
                {formatBytes(entry.size_bytes)}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                textAlign: "right",
                color: entry.size_delta > 0 ? "var(--green)" : entry.size_delta < 0 ? "var(--red)" : "var(--text-2)",
              }}>
                {entry.size_delta > 0 ? "+" : ""}{formatBytes(Math.abs(entry.size_delta))}
              </span>
            </div>
          );
        })}
      </div>

      {/* action bar */}
      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>
          {selected.size} selected
          {totalSelectedBytes > 0 && (
            <span style={{ marginLeft: 8, color: "var(--text-1)" }}>
              · {formatBytes(totalSelectedBytes)} to transfer
            </span>
          )}
        </div>
        <button
          onClick={handleBackup}
          disabled={selected.size === 0}
          style={{
            background: selected.size > 0 ? "var(--accent)" : "var(--bg-3)",
            color: selected.size > 0 ? "#000" : "var(--text-2)",
            padding: "7px 20px",
            fontWeight: 500,
            fontSize: 13,
            borderRadius: 4,
          }}
        >
          Back up {selected.size > 0 ? `${selected.size} file${selected.size > 1 ? "s" : ""}` : ""}
        </button>
      </div>
    </div>
  );
}