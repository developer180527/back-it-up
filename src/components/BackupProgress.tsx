import { BackupProgress as Progress, BackupManifest, formatBytes, formatSpeed, formatEta } from "../types";

interface Props {
  progress: Progress | null;
  manifest: BackupManifest | null;
  onDone: () => void;
}

export default function BackupProgress({ progress, manifest, onDone }: Props) {
  if (manifest) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
        padding: 40,
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "1.5px solid var(--green)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--green)",
          fontSize: 20,
        }}>✓</div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-0)", marginBottom: 4 }}>
            Backup complete
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>
            {new Date(manifest.completed_at).toLocaleString()}
          </div>
        </div>

        {/* stats grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
          width: "100%",
          maxWidth: 420,
        }}>
          {[
            { label: "Added",       value: manifest.files_added,    color: "var(--green)" },
            { label: "Modified",    value: manifest.files_modified,  color: "var(--yellow)" },
            { label: "Deleted",     value: manifest.files_deleted,   color: "var(--red)" },
          ].map(stat => (
            <div key={stat.label} style={{
              background: "var(--bg-2)",
              padding: "14px 16px",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 500,
                color: stat.value > 0 ? stat.color : "var(--text-2)",
                lineHeight: 1,
                marginBottom: 4,
              }}>
                {stat.value}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          display: "flex",
          gap: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-2)",
        }}>
          <span>{formatBytes(manifest.bytes_transferred)} transferred</span>
          {manifest.verified && (
            <span style={{ color: "var(--green)" }}>· verified ✓</span>
          )}
        </div>

        <button
          onClick={onDone}
          style={{
            background: "var(--bg-3)",
            color: "var(--text-1)",
            padding: "8px 24px",
            borderRadius: 4,
            fontSize: 13,
            border: "1px solid var(--border-hi)",
          }}
        >
          Done
        </button>
      </div>
    );
  }

  if (!progress) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
          preparing backup...
        </div>
      </div>
    );
  }

  const pct = progress.bytes_total > 0
    ? Math.round((progress.bytes_done / progress.bytes_total) * 100)
    : 0;

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      gap: 20,
    }}>

      {/* percentage */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 48,
        fontWeight: 500,
        color: "var(--text-0)",
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {pct}<span style={{ fontSize: 20, color: "var(--text-2)" }}>%</span>
      </div>

      {/* progress bar */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        height: 3,
        background: "var(--bg-3)",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: "var(--accent)",
          borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* current file */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-2)",
        maxWidth: 480,
        width: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textAlign: "center",
      }}>
        {progress.file_path}
      </div>

      {/* stats row */}
      <div style={{
        display: "flex",
        gap: 24,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-1)",
      }}>
        <span>
          <span style={{ color: "var(--text-2)" }}>files </span>
          {progress.files_done}/{progress.files_total}
        </span>
        <span>
          <span style={{ color: "var(--text-2)" }}>speed </span>
          {formatSpeed(progress.speed_bps)}
        </span>
        <span>
          <span style={{ color: "var(--text-2)" }}>eta </span>
          {formatEta(progress.eta_seconds)}
        </span>
        <span>
          <span style={{ color: "var(--text-2)" }}>done </span>
          {formatBytes(progress.bytes_done)} / {formatBytes(progress.bytes_total)}
        </span>
      </div>
    </div>
  );
}