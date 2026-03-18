import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Drive, Profile, DiffEntry, DiffResult, BackupProgress as BProgress, BackupManifest, formatBytes } from "./types";
import DrivePanel from "./components/DrivePanel";
import ProfileList from "./components/ProfileList";
import DiffViewer from "./components/DiffViewer";
import BackupProgress from "./components/BackupProgress";

type View = "diff" | "backing-up" | "done";

export default function App() {
  const [selectedDrive, setSelectedDrive]     = useState<Drive | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [diffEntries, setDiffEntries]         = useState<DiffEntry[]>([]);
  const [isScanning, setIsScanning]           = useState(false);
  const [view, setView]                       = useState<View>("diff");
  const [progress, setProgress]               = useState<BProgress | null>(null);
  const [manifest, setManifest]               = useState<BackupManifest | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [status, setStatus]                   = useState<string>("idle");

  useEffect(() => {
    const unlisten = listen<BProgress>("backup_progress", e => {
      setProgress(e.payload);
      setStatus(`Copying ${e.payload.files_done} of ${e.payload.files_total} — ${e.payload.file_path}`);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    const handleClose = async () => {
      if (isScanning) await invoke("cancel_scan");
    };
    window.addEventListener("beforeunload", handleClose);
    return () => window.removeEventListener("beforeunload", handleClose);
  }, [isScanning]);

  const handleSelectDrive = (drive: Drive) => {
    setSelectedDrive(drive);
    setSelectedProfile(null);
    setDiffEntries([]);
    setError(null);
    setStatus(`Drive mounted — ${drive.name} — ${formatBytes(drive.available_space)} free`);
  };

  const handleSelectProfile = (profile: Profile) => {
    setSelectedProfile(profile);
    setDiffEntries([]);
    setError(null);
    setView("diff");
    setStatus(`Profile loaded — ${profile.name}`);
  };

  const handleScan = async (profile: Profile) => {
    setSelectedProfile(profile);
    setDiffEntries([]);
    setError(null);
    setView("diff");
    setIsScanning(true);
    setStatus("Walking source directory...");

    try {
      const pair = profile.folder_pairs[0];
      if (!pair) throw new Error("No folder pairs configured");

      setStatus("Computing checksums and comparing with destination...");

      const result = await invoke<DiffResult>("compute_diff", {
        profileId: profile.id,
        pairIndex: 0,
        sourcePath: pair.source_path,
        destPath: pair.dest_path,
        excludeRules: profile.exclude_rules,
      });

      const changed = result.entries.filter(e => e.status !== "unchanged");
      setDiffEntries(changed);

      if (changed.length === 0) {
        setStatus("Everything is up to date — no changes detected");
      } else {
        const added    = changed.filter(e => e.status === "added").length;
        const modified = changed.filter(e => e.status === "modified").length;
        const deleted  = changed.filter(e => e.status === "deleted").length;
        const renamed  = changed.filter(e => e.status === "renamed").length;
        const parts = [
          added    > 0 ? `${added} added`       : "",
          modified > 0 ? `${modified} modified`  : "",
          deleted  > 0 ? `${deleted} deleted`    : "",
          renamed  > 0 ? `${renamed} renamed`    : "",
        ].filter(Boolean).join(" · ");
        setStatus(`Scan complete — ${parts}`);
      }
    } catch (e) {
      if (String(e).includes("cancelled")) {
        setStatus("Scan cancelled");
      } else {
        setError(String(e));
        setStatus("Scan failed");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirmBackup = async (entries: DiffEntry[]) => {
    if (!selectedProfile) return;
    const pair = selectedProfile.folder_pairs[0];
    if (!pair) return;

    setView("backing-up");
    setProgress(null);
    setManifest(null);
    setError(null);
    setStatus(`Preparing to copy ${entries.length} files...`);

    try {
      const result = await invoke<BackupManifest>("run_backup", {
        profileId: selectedProfile.id,
        pairIndex: 0,
        sourcePath: pair.source_path,
        destPath: pair.dest_path,
        entries,
        appendOnly: selectedProfile.append_only,
        verifyAfterCopy: selectedProfile.verify_after_copy,
      });
      setManifest(result);
      setView("done");
      setStatus(
        `Backup complete — ${result.files_added} added · ${result.files_modified} modified · ${formatBytes(result.bytes_transferred)} transferred`
        + (result.verified ? " · verified ✓" : "")
      );
    } catch (e) {
      setError(String(e));
      setView("diff");
      setStatus("Backup failed");
    }
  };

  const handleDone = () => {
    setProgress(null);
    setManifest(null);
    setDiffEntries([]);
    setView("diff");
    if (selectedProfile) handleScan(selectedProfile);
  };

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg-0)",
    }}>

      <DrivePanel
        selectedDrive={selectedDrive}
        onSelect={handleSelectDrive}
      />

      <ProfileList
        selectedDrive={selectedDrive}
        selectedProfile={selectedProfile}
        onSelect={handleSelectProfile}
        onScan={handleScan}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* topbar */}
        <div style={{
          height: 42,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--accent)",
            letterSpacing: "0.04em",
          }}>
            back-it-up
          </span>

          {selectedProfile && (
            <>
              <span style={{ color: "var(--border-hi)", fontSize: 14 }}>/</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-1)" }}>
                {selectedProfile.name}
              </span>
            </>
          )}

          {selectedDrive && (
            <>
              <span style={{ color: "var(--border-hi)", fontSize: 14 }}>/</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
                {selectedDrive.name}
              </span>
            </>
          )}

          {/* status + cancel */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {isScanning && (
              <button
                onClick={async () => {
                  await invoke("cancel_scan");
                  setIsScanning(false);
                  setStatus("Scan cancelled");
                }}
                style={{
                  background: "none",
                  color: "var(--red)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "3px 8px",
                  borderRadius: 3,
                  border: "1px solid var(--red)",
                  opacity: 0.7,
                }}
              >
                cancel scan
              </button>
            )}
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: view === "backing-up" ? "var(--accent)"
                   : view === "done"       ? "var(--green)"
                   : error                 ? "var(--red)"
                   : isScanning            ? "var(--yellow)"
                   : "var(--text-2)",
              maxWidth: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {status === "idle" ? "" : status}
            </span>
          </div>
        </div>

        {/* error bar */}
        {error && (
          <div style={{
            padding: "8px 16px",
            background: "rgba(184,80,80,0.12)",
            borderBottom: "1px solid rgba(184,80,80,0.3)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ background: "none", color: "var(--red)", fontSize: 16 }}
            >×</button>
          </div>
        )}

        {/* empty state */}
        {!selectedDrive && (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}>
            <div style={{ fontSize: 32, opacity: 0.15 }}>💾</div>
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>Connect a drive to get started</div>
          </div>
        )}

        {selectedDrive && !selectedProfile && (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}>
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>
              Select a profile or create one for <span style={{ color: "var(--text-1)" }}>{selectedDrive.name}</span>
            </div>
          </div>
        )}

        {selectedProfile && view === "diff" && (
          <DiffViewer
            entries={diffEntries}
            onConfirmBackup={handleConfirmBackup}
            isScanning={isScanning}
          />
        )}

        {(view === "backing-up" || view === "done") && (
          <BackupProgress
            progress={progress}
            manifest={manifest}
            onDone={handleDone}
          />
        )}
      </div>
    </div>
  );
}