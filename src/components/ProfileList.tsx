import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Profile, Drive } from "../types";

interface Props {
  selectedDrive: Drive | null;
  selectedProfile: Profile | null;
  onSelect: (profile: Profile) => void;
  onScan: (profile: Profile) => void;
}

const COMMON_EXCLUDES = ["node_modules", ".git", ".DS_Store", "__pycache__", "target", "dist", ".next"];

export default function ProfileList({ selectedDrive, selectedProfile, onSelect, onScan }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    source_path: "",
    dest_path: "",
    append_only: true,
    verify_after_copy: false,
    auto_backup: false,
    exclude_rules: [...COMMON_EXCLUDES],
  });
  const [excludeInput, setExcludeInput] = useState("");

  const loadProfiles = async () => {
    try {
      const result = await invoke<Profile[]>("get_all_profiles");
      setProfiles(result);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadProfiles(); }, []);

  const driveProfiles = selectedDrive
    ? profiles.filter(p => p.drive_uuid === selectedDrive.uuid)
    : profiles;

  const handleCreate = async () => {
    if (!form.name || !form.source_path || !form.dest_path || !selectedDrive) return;
    try {
      await invoke("create_profile", {
        name: form.name,
        driveUuid: selectedDrive.uuid,
        folderPairs: [[form.source_path, form.dest_path]],
        excludeRules: form.exclude_rules,
        appendOnly: form.append_only,
        verifyAfterCopy: form.verify_after_copy,
        autoBackup: form.auto_backup,
      });
      await loadProfiles();
      setCreating(false);
      setForm({
        name: "",
        source_path: "",
        dest_path: "",
        append_only: true,
        verify_after_copy: false,
        auto_backup: false,
        exclude_rules: [...COMMON_EXCLUDES],
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this profile?")) return;
    try {
      await invoke("delete_profile", { profileId: id });
      await loadProfiles();
    } catch (e) {
      console.error(e);
    }
  };

  const addExclude = () => {
    const val = excludeInput.trim();
    if (val && !form.exclude_rules.includes(val)) {
      setForm(f => ({ ...f, exclude_rules: [...f.exclude_rules, val] }));
    }
    setExcludeInput("");
  };

  const removeExclude = (rule: string) => {
    setForm(f => ({ ...f, exclude_rules: f.exclude_rules.filter(r => r !== rule) }));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-0)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "6px 10px",
    color: "var(--text-0)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-2)",
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 4,
    display: "block",
  };

  const browseButtonStyle: React.CSSProperties = {
    background: "var(--bg-3)",
    color: "var(--text-1)",
    padding: "6px 10px",
    borderRadius: 4,
    fontSize: 12,
    border: "1px solid var(--border)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 12,
    color: active ? "var(--text-0)" : "var(--text-2)",
  });

  return (
    <div style={{
      width: 280,
      minWidth: 280,
      borderRight: "1px solid var(--border)",
      background: "var(--bg-1)",
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
          Profiles
        </span>
        <button
          onClick={() => setCreating(c => !c)}
          disabled={!selectedDrive}
          title={!selectedDrive ? "Select a drive first" : "New profile"}
          style={{
            background: creating ? "var(--bg-3)" : "none",
            color: creating ? "var(--accent)" : "var(--text-2)",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 2px",
            borderRadius: 3,
          }}
        >
          {creating ? "×" : "+"}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* create form */}
        {creating && (
          <div style={{
            padding: 14,
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-2)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            <div>
              <span style={labelStyle}>Profile name</span>
              <input
                style={inputStyle}
                placeholder="e.g. Work docs"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <span style={labelStyle}>Source folder</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="/Users/you/Documents"
                  value={form.source_path}
                  onChange={e => setForm(f => ({ ...f, source_path: e.target.value }))}
                />
                <button
                  style={browseButtonStyle}
                  onClick={async () => {
                    const selected = await open({ directory: true, multiple: false });
                    if (selected) setForm(f => ({ ...f, source_path: selected as string }));
                  }}
                >Browse</button>
              </div>
            </div>

            <div>
              <span style={labelStyle}>Destination on drive</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder={selectedDrive ? `${selectedDrive.mount_point}/backup` : "/Volumes/Drive/backup"}
                  value={form.dest_path}
                  onChange={e => setForm(f => ({ ...f, dest_path: e.target.value }))}
                />
                <button
                  style={browseButtonStyle}
                  onClick={async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      defaultPath: selectedDrive?.mount_point,
                    });
                    if (selected) setForm(f => ({ ...f, dest_path: selected as string }));
                  }}
                >Browse</button>
              </div>
            </div>

            {/* toggles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "append_only",       label: "Append only (never delete from drive)" },
                { key: "verify_after_copy", label: "Verify after copy" },
                { key: "auto_backup",       label: "Auto-backup on connect" },
              ].map(({ key, label }) => (
                <label key={key} style={toggleStyle(form[key as keyof typeof form] as boolean)}>
                  <input
                    type="checkbox"
                    checked={form[key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* exclude rules */}
            <div>
              <span style={labelStyle}>Exclude rules</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {form.exclude_rules.map(rule => (
                  <span key={rule} style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "2px 6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}>
                    {rule}
                    <button
                      onClick={() => removeExclude(rule)}
                      style={{ background: "none", color: "var(--text-2)", fontSize: 12, padding: 0, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="add pattern..."
                  value={excludeInput}
                  onChange={e => setExcludeInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addExclude()}
                />
                <button
                  onClick={addExclude}
                  style={{
                    background: "var(--bg-3)",
                    color: "var(--text-1)",
                    padding: "6px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    border: "1px solid var(--border)",
                  }}
                >Add</button>
              </div>
            </div>

            {/* actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={!form.name || !form.source_path || !form.dest_path}
                style={{
                  flex: 1,
                  background: "var(--accent)",
                  color: "#000",
                  padding: "7px 0",
                  borderRadius: 4,
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                style={{
                  background: "var(--bg-3)",
                  color: "var(--text-1)",
                  padding: "7px 12px",
                  borderRadius: 4,
                  fontSize: 12,
                  border: "1px solid var(--border)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* profile list */}
        {!selectedDrive && !creating && (
          <div style={{ padding: "12px 16px", color: "var(--text-2)", fontSize: 12 }}>
            Select a drive to see profiles
          </div>
        )}

        {selectedDrive && driveProfiles.length === 0 && !creating && (
          <div style={{ padding: "12px 16px", color: "var(--text-2)", fontSize: 12 }}>
            No profiles for this drive
          </div>
        )}

        {driveProfiles.map(profile => {
          const isSelected = selectedProfile?.id === profile.id;
          return (
            <div
              key={profile.id}
              onClick={() => onSelect(profile)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                background: isSelected ? "var(--bg-3)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)"; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13, color: isSelected ? "var(--text-0)" : "var(--text-1)" }}>
                  {profile.name}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={e => { e.stopPropagation(); onScan(profile); }}
                    title="Scan for changes"
                    style={{
                      background: "none",
                      color: "var(--accent)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: 3,
                      border: "1px solid var(--accent-dim)",
                    }}
                  >
                    scan
                  </button>
                  <button
                    onClick={e => handleDelete(e, profile.id)}
                    title="Delete profile"
                    style={{ background: "none", color: "var(--text-2)", fontSize: 14, padding: "0 2px" }}
                  >×</button>
                </div>
              </div>

              {profile.folder_pairs.map((pair, i) => (
                <div key={i} style={{ marginTop: 3 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {pair.source_path}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", paddingLeft: 8 }}>
                    → {pair.dest_path}
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {profile.append_only && <Tag label="append-only" />}
                {profile.verify_after_copy && <Tag label="verified" color="var(--green)" />}
                {profile.auto_backup && <Tag label="auto" color="var(--blue)" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ label, color = "var(--text-2)" }: { label: string; color?: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color,
      border: `1px solid ${color}`,
      borderRadius: 2,
      padding: "1px 4px",
      opacity: 0.7,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      {label}
    </span>
  );
}