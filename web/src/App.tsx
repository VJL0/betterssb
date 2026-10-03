import { useEffect, useRef, useState, type DragEvent } from "react";
import { AuditReport } from "./components/AuditReport";
import { StatusIcon } from "./components/StatusBadge";
import { formatCredits, isNoteOnly, runFromFile, type Audit } from "./lib/dars";
import { runViaExtension, waitForExtension } from "./lib/extension";

const DARS_URL = "https://prd-dars.temple.edu/selfservice/";

type Method = "extension" | "upload";

type RunState =
  | { kind: "idle" }
  | { kind: "running"; startedAt: number; label: string }
  | { kind: "error"; message: string }
  | { kind: "done"; audit: Audit };

function App() {
  const [method, setMethod] = useState<Method>("upload");
  const [extVersion, setExtVersion] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });

  useEffect(() => {
    void waitForExtension().then((v) => {
      setExtVersion(v);
      if (v) setMethod("extension");
    });
  }, []);

  async function execute(label: string, task: () => Promise<Audit>) {
    setRun({ kind: "running", startedAt: Date.now(), label });
    try {
      setRun({ kind: "done", audit: await task() });
    } catch (err) {
      setRun({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  const running = run.kind === "running";

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 lg:grid lg:h-dvh lg:grid-cols-2">
      <aside className="flex flex-col gap-6 border-slate-200 p-4 sm:p-6 lg:overflow-y-auto lg:border-r lg:p-10">
        <header>
          <p className="text-sm font-semibold tracking-wide text-rose-700 uppercase">
            BetterSSB
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Degree audit
          </h1>
          <p className="mt-2 max-w-prose text-slate-600">
            See your DARS audit, requirement by requirement — what's done,
            what's in progress, and exactly which courses can fill what's left.
          </p>
        </header>

        <MethodTabs
          method={method}
          onChange={setMethod}
          extInstalled={extVersion != null}
          disabled={running}
        />

        {method === "extension" && (
          <ExtensionPanel
            installed={extVersion != null}
            running={running}
            onRun={() =>
              execute("Running your audit in DARS…", runViaExtension)
            }
          />
        )}
        {method === "upload" && (
          <UploadPanel
            running={running}
            onFile={(file) =>
              execute("Reading your audit…", () => runFromFile(file))
            }
          />
        )}

        {run.kind === "running" && (
          <RunningNotice startedAt={run.startedAt} label={run.label} />
        )}
        {run.kind === "error" && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          >
            <p className="font-medium">{run.message}</p>
          </div>
        )}
        {run.kind === "done" && <AuditSummary audit={run.audit} />}
      </aside>

      <main className="min-h-[50vh] px-4 pb-10 sm:px-6 lg:overflow-y-auto">
        {run.kind === "done" ? (
          <AuditReport audit={run.audit} />
        ) : (
          <EmptyReport running={running} />
        )}
      </main>
    </div>
  );
}

function MethodTabs({
  method,
  onChange,
  extInstalled,
  disabled,
}: {
  method: Method;
  onChange: (m: Method) => void;
  extInstalled: boolean;
  disabled: boolean;
}) {
  const tabs: { id: Method; label: string }[] = [
    { id: "extension", label: extInstalled ? "Extension" : "Extension •" },
    { id: "upload", label: "Upload file" },
  ];
  return (
    <div
      role="tablist"
      aria-label="How to load your audit"
      className="flex gap-1 rounded-lg bg-slate-100 p-1"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={method === t.id}
          disabled={disabled}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            method === t.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ExtensionPanel({
  installed,
  running,
  onRun,
}: {
  installed: boolean;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Runs the audit in your browser using the DARS session you're already
        signed into. Nothing sensitive leaves your computer.
      </p>
      {!installed && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The BetterSSB extension isn't detected. Install it, or use{" "}
          <b>Upload file</b> instead.
        </p>
      )}
      <button
        type="button"
        onClick={onRun}
        disabled={running || !installed}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running && <Spinner />}
        {running ? "Running…" : "Run audit"}
      </button>
      <p className="text-xs text-slate-500">
        If you're not signed in, a DARS tab opens so you can log in — then the
        audit runs automatically.
      </p>
    </div>
  );
}

function UploadPanel({
  running,
  onFile,
}: {
  running: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={running}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-50 ${
          dragging
            ? "border-rose-400 bg-rose-50"
            : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <span className="text-2xl">📄</span>
        <span className="text-sm font-medium text-slate-700">
          Drop your audit file here, or click to choose
        </span>
        <span className="text-xs text-slate-500">
          The saved DARS audit page (.html)
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          How do I save it?
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open your audit in{" "}
            <a
              href={DARS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-rose-700 underline"
            >
              DARS
            </a>{" "}
            and click the printer-friendly / print view.
          </li>
          <li>
            Save the page (<kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd>) as an HTML file.
          </li>
          <li>
            Drop that file above. It never leaves our server after parsing.
          </li>
        </ol>
      </details>
    </div>
  );
}

function RunningNotice({
  startedAt,
  label,
}: {
  startedAt: number;
  label: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <Spinner />
      <span>
        {label} <span className="tabular-nums">{seconds}s</span>
        <span className="block text-xs text-slate-500">
          A fresh audit usually takes 5–20 seconds.
        </span>
      </span>
    </div>
  );
}

function AuditSummary({ audit }: { audit: Audit }) {
  const reqs = audit.requirements.filter(
    (r) => !isNoteOnly(r) && r.status !== "none",
  );
  const count = (s: string) => reqs.filter((r) => r.status === s).length;
  const totals = audit.requirements.find((r) => r.category === "Total_Hours");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <StatusIcon status={audit.complete ? "complete" : "incomplete"} />
        <div>
          <h2 className="font-semibold">{audit.programTitle}</h2>
          <p className="text-sm text-slate-500">
            {audit.programCode} · Catalog {audit.catalogYear} · Run{" "}
            {audit.preparedOn}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        <Stat
          label="Complete"
          value={count("complete")}
          tone="text-emerald-700"
        />
        <Stat
          label="In progress"
          value={count("in_progress")}
          tone="text-amber-700"
        />
        <Stat
          label="Still needed"
          value={count("incomplete")}
          tone="text-rose-700"
        />
      </dl>

      {totals?.earned?.credits != null && (
        <div className="mt-5">
          <CreditsBar
            earned={totals.earned.credits}
            inProgress={totals.inProgress?.credits ?? 0}
            needed={totals.needs?.credits ?? 0}
          />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function CreditsBar({
  earned,
  inProgress,
  needed,
}: {
  earned: number;
  inProgress: number;
  needed: number;
}) {
  // DARS "needs" already subtracts in-progress credits, so the total is the sum of all three.
  const total = earned + inProgress + needed;
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>Credits toward degree</span>
        <span className="tabular-nums">
          {formatCredits(earned)} earned · {formatCredits(inProgress)} in
          progress · {formatCredits(needed)} to go
        </span>
      </div>
      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-emerald-500" style={{ width: pct(earned) }} />
        <div className="bg-amber-400" style={{ width: pct(inProgress) }} />
      </div>
    </div>
  );
}

function EmptyReport({ running }: { running: boolean }) {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <p className="max-w-xs text-center text-sm text-slate-500">
        {running
          ? "Waiting for your audit…"
          : "Your audit will appear here once it loads."}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export default App;
