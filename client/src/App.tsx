import { useEffect, useMemo, useState } from "react";
import { Settings as Gear, Smartphone } from "lucide-react";
import type { Device } from "./api";
import { fsHome, fsList, getDevices, getSettings, provision, putSettings, subscribeLogs, uninstall, type FsEntry } from "./api";

function clampId(v: number) {
  if (!Number.isFinite(v)) return 1;
  const n = Math.floor(v);
  if (n < 1) return 1;
  if (n > 50) return 50;
  return n;
}

function parseAndClampId(raw: string) {
  // Allow empty while typing; on blur/actions we normalize.
  const n = Number(raw);
  return clampId(n);
}

export default function App() {
  const [settings, setSettings] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  // Keep a text state so the user can type freely (avoid the "it prepends 1" issue
  // caused by clamping on every keypress when the value is temporarily empty/NaN).
  const [currentIdText, setCurrentIdText] = useState<string>("1");
  const [autoInc, setAutoInc] = useState<boolean>(true);
  const [logs, setLogs] = useState<{ ts: number; level: string; message: string }[]>([]);
  const [busySerial, setBusySerial] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<"install" | "uninstall" | null>(null);
  const [progressBySerial, setProgressBySerial] = useState<Record<string, { pct: number; label: string }>>({});

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"file" | "dir">("file");
  const [pickerPath, setPickerPath] = useState<string>("");
  const [pickerEntries, setPickerEntries] = useState<FsEntry[]>([]);
  const [pickerParent, setPickerParent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setDraft(s);
      const id = clampId(Number(s.lastUsedID ?? 1));
      setCurrentIdText(String(id));
      setAutoInc(!!s.autoIncrement);
    })().catch(console.error);
  }, []);

  useEffect(() => {
    const off = subscribeLogs((line) => {
      // Capture progress hints from server logs.
      const msg = String(line?.message ?? "");
      // Be tolerant: some log transports may append extra text after the message.
      const m = msg.match(/\[progress serial=([^\s\]]+) pct=(\d+)\]\s*([^\n\r]*)/);
      if (m) {
        const serial = m[1];
        const pct = Number(m[2]);
        const label = m[3] || "Working";
        if (Number.isFinite(pct)) {
          setProgressBySerial((prev) => ({ ...prev, [serial]: { pct, label } }));
        }
      }

      setLogs((prev) => {
        const next = [...prev, line];
        return next.length > 400 ? next.slice(next.length - 400) : next;
      });
    });
    return off;
  }, []);

  // autoSearch removed: device polling is always on.

  async function refreshDevices() {
    const d = await getDevices();
    setDevices(d);
  }

  useEffect(() => {
    refreshDevices().catch(() => void 0);
  }, []);

  // Always poll devices every 5s (keeps the UI updated without extra controls).
  useEffect(() => {
    const t = setInterval(() => refreshDevices().catch(() => void 0), 5000);
    return () => clearInterval(t);
  }, []);

  const headerRight = useMemo(() => {
    if (!settings) return null;
    return (
      <button
        className="flex items-center gap-2 text-xs text-slate-300 hover:text-white"
        onClick={() => {
          setDraft(settings);
          setShowSettings(true);
        }}
        title="Settings"
      >
        <span className="hidden sm:inline">{settings.packageName ? `pkg: ${settings.packageName}` : "pkg: (set packageName)"}</span>
        <Gear className="h-5 w-5 opacity-80" />
      </button>
    );
  }, [settings]);

  const canProvision = (serial: string) => !busySerial || busySerial === serial;

  async function provisionAll() {
    // Sequential (safer with USB/ADB). Uses auto-increment behavior via API response.
    let id = parseAndClampId(currentIdText || "0");
    setCurrentIdText(String(id));

    for (const d of devices) {
      try {
        setBusySerial(d.serial);
        setBusyOp("install");

        await putSettings({ lastUsedID: id });
        const r = await provision(d.serial, id);

        if (r.ok && typeof r.nextId === "number") {
          id = clampId(r.nextId);
          setCurrentIdText(String(id));
          const s = await getSettings();
          setSettings(s);
        }

        await refreshDevices();
      } finally {
        setBusySerial(null);
        setBusyOp(null);
        // Keep last progress visible; it will update on the next run.
      }
    }
  }

  async function uninstallAll() {
    for (const d of devices) {
      try {
        setBusySerial(d.serial);
        setBusyOp("uninstall");
        await uninstall(d.serial);
        await refreshDevices();
      } finally {
        setBusySerial(null);
        setBusyOp(null);
        // Keep last progress visible; it will update on the next run.
      }
    }
  }

  async function loadPicker(p: string) {
    const r = await fsList(p);
    setPickerPath(r.path);
    setPickerEntries(r.entries);
    setPickerParent(r.parent);
  }

  function fieldLabel(field: string | null) {
    switch (field) {
      case "apkPath":
        return "APK path";
      case "configBasePath":
        return "Base config.txt path";
      case "videoPath":
        return "360 video path (local)";
      case "brandingPath":
        return "Branding folder path (local)";
      default:
        return field ?? "";
    }
  }

  async function openPicker(field: string, mode: "file" | "dir") {
    setPickerField(field);
    setPickerMode(mode);
    setPickerOpen(true);
    const { home } = await fsHome();
    await loadPicker(home);
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Quest Manager</div>
            <div className="text-sm text-slate-400">Install & sync files to Meta Quest via ADB</div>
          </div>
          {headerRight}
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-200">Configuración Inicial</div>

            <label className="block">
              <div className="text-xs text-slate-400 mb-1">Current ID (1-50)</div>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={currentIdText}
                onChange={(e) => {
                  // digits only
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setCurrentIdText(v);
                }}
                onBlur={() => {
                  // Normalize on blur: if empty or 0 => 1; clamp to 1..50.
                  const id = parseAndClampId(currentIdText || "0");
                  setCurrentIdText(String(id));
                }}
              />
            </label>

            <label className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm">Auto-increment</div>
                <div className="text-xs text-slate-400">Save next ID after provisioning</div>
              </div>
              <input
                type="checkbox"
                checked={autoInc}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setAutoInc(v);
                  const s = await putSettings({ autoIncrement: v });
                  setSettings(s);
                }}
              />
            </label>

            <button
              className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-sm"
              onClick={async () => {
                const id = parseAndClampId(currentIdText || "0");
                setCurrentIdText(String(id));
                const s = await putSettings({ lastUsedID: id });
                setSettings(s);
              }}
            >
              Guardar ID
            </button>

            <div className="text-xs text-slate-400">
              Paths (APK/Video/Branding/Config) se configuran en <code className="text-slate-200">.data/settings.json</code>.
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">Gafas Conectadas</div>
              <div className="flex items-center gap-3">
                {/* Device polling is always enabled; removed auto-search toggle. */}
                <button
                  className="text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 disabled:opacity-50"
                  disabled={!!busySerial}
                  onClick={() => provisionAll().catch(console.error)}
                  title="Instala y sincroniza en todas las gafas (una por una)"
                >
                  Instalar todo
                </button>

                <button
                  className="text-xs rounded-md border border-red-700/70 text-red-300 hover:bg-red-900/20 px-3 py-2 disabled:opacity-50"
                  disabled={!!busySerial}
                  onClick={() => uninstallAll().catch(console.error)}
                  title="Desinstala en todas las gafas (una por una)"
                >
                  Desinstalar todo
                </button>

                {/* Manual refresh removed (polling always on). */}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((d) => {
                const isBusy = busySerial === d.serial;
                return (
                  <div key={d.serial} className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-slate-300" />
                        <div>
                          <div className="text-sm font-semibold">{d.model ?? "Meta Quest"}</div>
                          <div className="text-xs text-slate-400 break-all">{d.serial}</div>
                        </div>
                      </div>
                      <span
                        className={
                          "text-xs px-2 py-1 rounded-full border " +
                          (d.installed ? "bg-emerald-900/30 border-emerald-700 text-emerald-300" : "bg-slate-900 border-slate-700 text-slate-300")
                        }
                      >
                        {d.installed ? "Installed" : "Not installed"}
                      </span>
                    </div>

                    {(isBusy || progressBySerial[d.serial]) && (
                      <div className="pt-1 space-y-1">
                        {(() => {
                          const p = progressBySerial[d.serial];
                          const pct = Math.max(0, Math.min(100, p?.pct ?? 0));
                          const label = p?.label ?? (isBusy ? "Working…" : "—");
                          return (
                            <>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span className="truncate">{label}</span>
                                <span className="tabular-nums">{pct}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-800 overflow-hidden" aria-label="Progress">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Battery</span>
                      <span>{typeof d.battery === "number" ? `${d.battery}%` : "—"}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${typeof d.battery === "number" ? d.battery : 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={!canProvision(d.serial)}
                      className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
                      onClick={async () => {
                        try {
                          setBusySerial(d.serial);
                          setBusyOp("install");
                          const id = parseAndClampId(currentIdText || "0");
                          setCurrentIdText(String(id));

                          // ensure lastUsedID sync
                          await putSettings({ lastUsedID: id });
                          const r = await provision(d.serial, id);
                          if (r.ok && typeof r.nextId === "number") {
                            const nextId = clampId(r.nextId);
                            setCurrentIdText(String(nextId));
                            const s = await getSettings();
                            setSettings(s);
                          }
                          await refreshDevices();
                        } finally {
                          setBusySerial(null);
                          setBusyOp(null);
                          // Keep last progress visible; it will update on the next run.
                        }
                      }}
                    >
                      {isBusy && busyOp === "install" ? "Installing…" : "Install & Sync"}
                    </button>

                    <button
                      disabled={!canProvision(d.serial)}
                      className="rounded-lg border border-red-700/70 text-red-300 hover:bg-red-900/20 disabled:opacity-50 px-3 py-2 text-sm"
                      onClick={async () => {
                        try {
                          setBusySerial(d.serial);
                          setBusyOp("uninstall");
                          await uninstall(d.serial);
                          await refreshDevices();
                        } finally {
                          setBusySerial(null);
                          setBusyOp(null);
                          // Keep last progress visible; it will update on the next run.
                        }
                      }}
                    >
                      {isBusy && busyOp === "uninstall" ? "Uninstalling…" : "Uninstall"}
                    </button>
                  </div>
                </div>
                );
              })}

              {devices.length === 0 && (
                <div className="text-sm text-slate-400">No devices detected. Conecta el Quest por USB y asegúrate que ADB esté instalado y autorizado.</div>
              )}
            </div>
          </div>
        </section>

        {showSettings && draft && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-slate-950 border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Settings</div>
                  <div className="text-xs text-slate-400">Edit local file paths and Quest remote destinations</div>
                </div>
                <button
                  className="text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2"
                  onClick={() => setShowSettings(false)}
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">APK path</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2"
                      value={draft.apkPath ?? ""}
                      onChange={(e) => setDraft({ ...draft, apkPath: e.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => openPicker("apkPath", "file").catch(console.error)}
                    >
                      Browse
                    </button>
                  </div>
                </label>

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">Package name (for uninstall/installed badge)</div>
                  <input className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2" value={draft.packageName ?? ""} onChange={(e) => setDraft({ ...draft, packageName: e.target.value })} />
                </label>

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">Base config.txt path</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2"
                      value={draft.configBasePath ?? ""}
                      onChange={(e) => setDraft({ ...draft, configBasePath: e.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => openPicker("configBasePath", "file").catch(console.error)}
                    >
                      Browse
                    </button>
                  </div>
                </label>

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">Branding folder path (local)</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2"
                      value={draft.brandingPath ?? ""}
                      onChange={(e) => setDraft({ ...draft, brandingPath: e.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => openPicker("brandingPath", "dir").catch(console.error)}
                    >
                      Browse
                    </button>
                  </div>
                </label>

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">360 video path (local)</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2"
                      value={draft.videoPath ?? ""}
                      onChange={(e) => setDraft({ ...draft, videoPath: e.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs"
                      onClick={() => openPicker("videoPath", "file").catch(console.error)}
                    >
                      Browse
                    </button>
                  </div>
                </label>

                <div className="hidden md:block" />

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">Remote config destination (Quest)</div>
                  <input className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2" value={draft.remoteConfigPath ?? ""} onChange={(e) => setDraft({ ...draft, remoteConfigPath: e.target.value })} />
                </label>

                <label className="block">
                  <div className="text-xs text-slate-400 mb-1">Remote branding destination dir (Quest)</div>
                  <input className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2" value={draft.remoteBrandingDir ?? ""} onChange={(e) => setDraft({ ...draft, remoteBrandingDir: e.target.value })} />
                </label>

                <label className="block md:col-span-2">
                  <div className="text-xs text-slate-400 mb-1">Remote 360 video destination (Quest)</div>
                  <input className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2" value={draft.remoteVideoPath ?? ""} onChange={(e) => setDraft({ ...draft, remoteVideoPath: e.target.value })} />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  className="text-xs rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2"
                  onClick={() => {
                    setDraft(settings);
                  }}
                >
                  Reset
                </button>
                <button
                  className="text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-2 font-semibold"
                  onClick={async () => {
                    const s = await putSettings(draft);
                    setSettings(s);
                    setDraft(s);
                    setShowSettings(false);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {pickerOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-slate-950 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Select {pickerMode === "dir" ? "folder" : "file"}</div>
                  <div className="text-xs text-slate-400">For: <span className="text-slate-200">{fieldLabel(pickerField)}</span></div>
                  <div className="text-xs text-slate-400 break-all">{pickerPath}</div>
                </div>
                <button
                  className="text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2"
                  onClick={() => setPickerOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="text-xs rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2 disabled:opacity-50"
                  disabled={!pickerParent}
                  onClick={() => {
                    if (pickerParent) loadPicker(pickerParent).catch(console.error);
                  }}
                >
                  Up
                </button>
                {pickerMode === "dir" && (
                  <button
                    className="text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-2 font-semibold"
                    onClick={() => {
                      if (!pickerField) return;
                      setDraft((prev: any) => ({ ...prev, [pickerField]: pickerPath }));
                      setPickerOpen(false);
                    }}
                  >
                    Use this folder
                  </button>
                )}
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-800">
                {pickerEntries.map((e) => (
                  <button
                    key={e.path}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-900 flex items-center justify-between"
                    onClick={() => {
                      if (e.isDir) {
                        loadPicker(e.path).catch(console.error);
                        return;
                      }
                      if (pickerMode === "file") {
                        if (!pickerField) return;
                        setDraft((prev: any) => ({ ...prev, [pickerField]: e.path }));
                        setPickerOpen(false);
                      }
                    }}
                  >
                    <span className="truncate">{e.name}{e.isDir ? "/" : ""}</span>
                    <span className="text-xs text-slate-500">{e.isDir ? "dir" : "file"}</span>
                  </button>
                ))}
              </div>

              {pickerMode === "file" && (
                <div className="text-xs text-slate-400">
                  Tip: click a folder to enter; click a file to select it.
                </div>
              )}
            </div>
          </div>
        )}

        <section className="rounded-2xl bg-black border border-slate-800 p-4">
          <div className="text-xs text-slate-400 mb-2">Registros de Actividad</div>
          <div className="font-mono text-xs space-y-1 max-h-64 overflow-auto">
            {logs.map((l, idx) => (
              <div key={idx} className={l.level === "error" ? "text-red-300" : "text-slate-200"}>
                <span className="text-slate-500">[{new Date(l.ts).toLocaleTimeString()}]</span> {l.message}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
