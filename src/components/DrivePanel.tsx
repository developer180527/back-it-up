import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Drive, formatBytes } from "../types";

interface Props {
  selectedDrive: Drive | null;
  onSelect: (drive: Drive) => void;
}

export default function DrivePanel({ selectedDrive, onSelect }: Props) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const result = await invoke<Drive[]>("get_connected_drives");
      setDrives(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
    }, []);

    useEffect(() => {
    if (drives.length === 1 && !selectedDrive) {
        onSelect(drives[0]);
    }
    }, [drives]);

  const usedPercent = (drive: Drive) => {
    const used = drive.total_space - drive.available_space;
    return Math.round((used / drive.total_space) * 100);
  };

  return (
    <div style={{
      width: 240,
      minWidth: 240,
      background: "var(--bg-1)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      {/* header */}
      <div style={{
        height: 42,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Drives
        </span>
        <button onClick={refresh} style={{
          background: "none",
          color: "var(--text-2)",
          fontSize: 16,
          lineHeight: 1,
          padding: "0 2px",
        }}
          title="Refresh"
        >↻</button>
      </div>

      {/* drive list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading && (
          <div style={{ padding: "12px 16px", color: "var(--text-2)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            scanning...
          </div>
        )}

        {!loading && drives.length === 0 && (
          <div style={{ padding: "12px 16px", color: "var(--text-2)", fontSize: 12 }}>
            No external drives detected
          </div>
        )}

        {drives.map((drive) => {
          const pct = usedPercent(drive);
          const isSelected = selectedDrive?.uuid === drive.uuid;
          const used = drive.total_space - drive.available_space;

          return (
            <div
              key={drive.uuid}
              onClick={() => onSelect(drive)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background: isSelected ? "var(--bg-3)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)";
              }}
              onMouseLeave={e => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {/* drive name */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15 }}>
                  {drive.is_removable ? "💾" : "🖴"}
                </span>
                <span style={{
                  fontFamily: "var(--font-ui)",
                  fontWeight: 500,
                  fontSize: 13,
                  color: isSelected ? "var(--text-0)" : "var(--text-1)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {drive.name || "Untitled Drive"}
                </span>
              </div>

              {/* usage bar */}
              <div style={{
                height: 2,
                background: "var(--bg-3)",
                borderRadius: 1,
                marginBottom: 5,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: pct > 90 ? "var(--red)" : pct > 70 ? "var(--yellow)" : "var(--accent-dim)",
                  borderRadius: 1,
                }} />
              </div>

              {/* size info */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
                  {formatBytes(used)} used
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
                  {formatBytes(drive.available_space)} free
                </span>
              </div>

              {/* mount point */}
              <div style={{
                marginTop: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {drive.mount_point}
              </div>
            </div>
          );
        })}
      </div>

      {/* footer: selected drive uuid */}
      {selectedDrive && (
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-2)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {selectedDrive.uuid}
        </div>
      )}
    </div>
  );
}