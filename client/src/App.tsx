import { useEffect, useMemo, useState } from "react";
import { Settings as Gear, Smartphone } from "lucide-react";
import { Device, getDevices, getSettings, provision, putSettings, subscribeLogs, uninstall } from "./api";

function clampId(v: number) {
  if (!Number.isFinite(v)) return 1;
  const n = Math.floor(v);
  if (n < 1) return 1;
  if (n > 50) return 50;
  return n;
}

export default function App() {
  const [settings, setSettings] = useState<any>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentId, setCurrentId] = useState<number>(1);
  const [autoInc, setAutoInc] = useState<boolean>(true);
  const [logs, setLogs] = useState<{ ts: number; level: string; message: string }[]>([]);
  const [busySerial, setBusySerial] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setCurrentId(s.lastUsedID ?? 1);
      setAutoInc(!!s.autoIncrement);
    })().catch(console.error);
  }, []);

  useEffect(() => {
    const off = subscribeLogs((line) => {
      setLogs((prev) => {
        const next = [...prev, line];
        return next.length > 400 ? next.slice(next.length - 400) : next;
      });
    });
    return off;
  }, []);

  async function refreshDevices() {
    const d = await getDevices();
    setDevices(d);
  }

  useEffect(() => {
    refreshDevices().catch(() => void 0);
    const t = setInterval(() => refreshDevices().catch(() => void 0), 5000);
    return () => clearInterval(t);
  }, []);

  const headerRight = useMemo(() => {
    if (!settings) return null;
    return (
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="hidden sm:inline">{settings.packageName ? `pkg: ${settings.packageName}` : "pkg: (set in settings.json)"}</span>
        <Gear className="h-5 w-5 opacity-80" />
      </div>
    );
  }, [settings]);

  const canProvision = (serial: string) => !busySerial || busySerial === serial;

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
                type="number"
                value={currentId}
                onChange={(e) => setCurrentId(clampId(Number(e.target.value)))}
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
                const s = await putSettings({ lastUsedID: currentId });
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
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">Gafas Conectadas</div>
              <button
                className="text-xs rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2"
                onClick={() => refreshDevices().catch(console.error)}
              >
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((d) => (
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
                          // ensure lastUsedID sync
                          await putSettings({ lastUsedID: currentId });
                          const r = await provision(d.serial, currentId);
                          if (r.ok && typeof r.nextId === "number") {
                            setCurrentId(r.nextId);
                            const s = await getSettings();
                            setSettings(s);
                          }
                          await refreshDevices();
                        } finally {
                          setBusySerial(null);
                        }
                      }}
                    >
                      Install & Sync
                    </button>

                    <button
                      disabled={!canProvision(d.serial)}
                      className="rounded-lg border border-red-700/70 text-red-300 hover:bg-red-900/20 disabled:opacity-50 px-3 py-2 text-sm"
                      onClick={async () => {
                        try {
                          setBusySerial(d.serial);
                          await uninstall(d.serial);
                          await refreshDevices();
                        } finally {
                          setBusySerial(null);
                        }
                      }}
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              ))}

              {devices.length === 0 && (
                <div className="text-sm text-slate-400">No devices detected. Conecta el Quest por USB y asegúrate que ADB esté instalado y autorizado.</div>
              )}
            </div>
          </div>
        </section>

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
