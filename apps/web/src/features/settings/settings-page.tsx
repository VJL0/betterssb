import { DownloadIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { Fragment, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { StoreKey } from "@workspace/shared/types/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { ButtonLink } from "@/components/button-link";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Kbd } from "@workspace/ui/components/kbd";
import { Switch } from "@workspace/ui/components/switch";
import { Spinner } from "@workspace/ui/components/spinner";
import { SearchCombobox } from "@workspace/ui/components/search-combobox";
import { BannerBadge } from "@/components/banner-status";
import { TermSelect } from "@/components/term-select";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { useSettings } from "@/hooks/use-settings";
import { findSchools } from "@/lib/schools";
import { BANNER_REGISTRATION_URL, EXTENSION_INSTALL_URL } from "@/lib/config";
import { useStoreDocument, useStoreState } from "@/lib/store/store-context";
import { downloadStoreExport } from "./export-data";
import type { RmpSchool } from "@workspace/api-client";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "school", label: "School and term" },
  { id: "banner", label: "Banner" },
  { id: "banner-pages", label: "On Banner pages" },
  { id: "keyboard", label: "Keyboard" },
  { id: "data", label: "Data and privacy" },
] as const;

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-base font-medium">
          {title}
        </h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** W4.2 · Settings. Guest-only until account sync exists. */
export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <title>Settings · BetterSSB</title>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="flex flex-wrap items-start gap-8">
        <nav
          aria-label="Settings sections"
          className="min-w-0 flex-[1_1_11rem] md:sticky md:top-24"
        >
          <ul className="flex flex-wrap gap-0.5 md:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex min-h-8 items-center rounded-xl px-3 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-[999_1_35rem] flex-col gap-5">
          <AccountSection />
          <SchoolSection />
          <BannerSection />
          <BannerPagesSection />
          <KeyboardSection />
          <DataSection />
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  return (
    <SettingsSection id="account" title="Account">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <UserRoundIcon aria-hidden className="size-4.5" />
        </span>
        <span className="flex flex-col">
          <span className="font-medium">Using BetterSSB as a guest</span>
          <span className="text-muted-foreground">
            No account needed. Your plans, schedules and settings stay on this
            device.
          </span>
        </span>
      </div>
      <p className="rounded-xl bg-muted/50 px-3 py-2.5">
        Browsers can clear site data. Download a copy under Data and privacy to
        keep a backup.
      </p>
    </SettingsSection>
  );
}

function SchoolSection() {
  const { settings, update } = useSettings();
  const [major, setMajor] = useState<string | null>(null);
  const majorId = useId();

  return (
    <SettingsSection id="school" title="School and term">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-4">
        <Field>
          <FieldLabel htmlFor="settings-school">School</FieldLabel>
          <SearchCombobox<RmpSchool>
            id="settings-school"
            value={
              settings.school
                ? {
                    id: settings.school.id,
                    name: settings.school.name,
                    legacyId: 0,
                  }
                : null
            }
            onSelect={(s) => {
              void update({ school: { id: s.id, name: s.name } }).then(() =>
                toast.success(`School set to ${s.name}`),
              );
            }}
            search={findSchools}
            itemKey={(s) => s.id}
            itemLabel={(s) => s.name}
            placeholder="Search schools"
            noun="schools"
          />
        </Field>
        <Field>
          {/* The select names itself; this is the visible heading. */}
          <FieldTitle>Term</FieldTitle>
          <TermSelect className="w-full" />
          <FieldDescription>Also in the top bar.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={majorId}>Major</FieldLabel>
          <Input
            id={majorId}
            value={major ?? settings.major}
            placeholder="e.g. Computer Science"
            autoComplete="off"
            onChange={(e) => setMajor(e.target.value)}
            onBlur={() => {
              if (major !== null && major !== settings.major) {
                void update({ major });
              }
              setMajor(null);
            }}
          />
        </Field>
      </div>
    </SettingsSection>
  );
}

/** Only the shortcuts that exist; the rest of the DS6 keyboard map comes later. */
const SHORTCUTS = [
  { keys: ["/"], action: "Focus course search" },
  { keys: ["J", "K"], action: "Next or previous section in search results" },
  { keys: ["A"], action: "Add or remove the focused section" },
  { keys: ["[", "]"], action: "Previous or next generated schedule" },
] as const;

function BannerPagesSection() {
  const { settings, update } = useSettings();
  const switchId = useId();
  return (
    <SettingsSection
      id="banner-pages"
      title="On Banner pages"
      description="What the extension adds to your school's registration pages."
    >
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>
            Ratings, seats and your plan
          </FieldLabel>
          <FieldDescription>
            Rate My Professors scores, seat meters, plan and conflict tags, and
            a plan panel on Banner's class search. Banner's own page stays as it
            is when this is off.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={settings.bannerOverlay}
          onCheckedChange={(bannerOverlay) => void update({ bannerOverlay })}
        />
      </Field>
    </SettingsSection>
  );
}

function KeyboardSection() {
  const { settings, update } = useSettings();
  const switchId = useId();
  return (
    <SettingsSection id="keyboard" title="Keyboard">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>Single-key shortcuts</FieldLabel>
          <FieldDescription>
            They never fire while you type in a field. Turn them off if they get
            in the way of a screen reader or voice control.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={settings.keyboardShortcuts}
          onCheckedChange={(keyboardShortcuts) =>
            void update({ keyboardShortcuts })
          }
        />
      </Field>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {SHORTCUTS.map((shortcut) => (
          <Fragment key={shortcut.action}>
            <dt className="flex gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd className="text-muted-foreground">{shortcut.action}</dd>
          </Fragment>
        ))}
      </dl>
    </SettingsSection>
  );
}

function BannerSection() {
  const { connection, extensionInstalled } = useBannerConnection();
  const explanation = !extensionInstalled
    ? "Your degree audit, auto-register and Banner page overlays need the BetterSSB Chrome extension. Everything else works without it."
    : connection === "connected"
      ? "The extension can reach your Banner tab. Your Banner login stays with Banner."
      : connection === "signed-out"
        ? "Banner signed you out. Sign in again in any tab and BetterSSB reconnects on its own."
        : "Open Banner registration in a tab and sign in. The extension notices and connects.";

  return (
    <SettingsSection
      id="banner"
      title="Banner"
      description="Separate from BetterSSB. BetterSSB never sees your Banner password."
    >
      <div className="flex flex-wrap items-center gap-3">
        <BannerBadge connection={connection} />
        <span className="text-muted-foreground">
          {extensionInstalled
            ? "Extension installed"
            : "Extension not installed"}
        </span>
      </div>
      <p>{explanation}</p>
      <div className="flex flex-wrap gap-2">
        {extensionInstalled && connection !== "connected" && (
          <ButtonLink variant="outline" href={BANNER_REGISTRATION_URL}>
            Open Banner
          </ButtonLink>
        )}
        {!extensionInstalled && EXTENSION_INSTALL_URL && (
          <ButtonLink href={EXTENSION_INSTALL_URL}>
            Add the extension
          </ButtonLink>
        )}
      </div>
    </SettingsSection>
  );
}

function DataSection() {
  const state = useStoreState();
  const threads = useStoreDocument("advisorThreads");
  const opened = state.status === "ready" ? state.opened : null;
  const where =
    opened?.location === "extension"
      ? "Your data is saved in the BetterSSB extension in this browser."
      : "Your data is saved in this browser.";

  async function clearAll() {
    if (!opened) return;
    const keys: StoreKey[] = await opened.store.keys();
    await Promise.all(keys.map((key) => opened.store.delete(key)));
    toast.success("Cleared everything saved on this device");
  }

  return (
    <SettingsSection
      id="data"
      title="Data and privacy"
      description="Your Banner password never touches BetterSSB. Registration runs in your own browser."
    >
      <p className="text-muted-foreground">{where}</p>
      <DataRow
        title="Download my data"
        description="Plans, schedules, settings, your audit and transcript, and advisor history, as a JSON file."
        action={
          <Button
            variant="outline"
            disabled={!opened}
            onClick={() => {
              if (opened) void downloadStoreExport(opened.store);
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        }
      />
      <DataRow
        title="Clear advisor history"
        description={
          threads.value?.length
            ? `Deletes ${threads.value.length} saved conversation${threads.value.length === 1 ? "" : "s"}.`
            : "No saved conversations."
        }
        action={
          <ConfirmButton
            label="Clear"
            accessibleName="Clear advisor history"
            disabled={!opened || !threads.value?.length}
            title="Clear advisor history?"
            description="This deletes every saved advisor conversation on this device. It can't be undone."
            confirmLabel="Clear history"
            onConfirm={async () => {
              await opened?.store.delete("advisorThreads");
              toast.success("Advisor history cleared");
            }}
          />
        }
      />
      <DataRow
        title="Clear this device"
        description="Deletes plans, schedules, settings, your saved audit and transcript, and advisor history."
        action={
          <ConfirmButton
            label="Clear"
            accessibleName="Clear this device"
            destructive
            disabled={!opened}
            title="Clear everything on this device?"
            description="Download your data first if you might want it back. This can't be undone."
            confirmLabel="Clear everything"
            onConfirm={clearAll}
          />
        }
      />
    </SettingsSection>
  );
}

function DataRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <span className="flex min-w-0 flex-[1_1_16rem] flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{description}</span>
      </span>
      {action}
    </div>
  );
}

interface ConfirmButtonProps {
  label: string;
  /** Full name for assistive tech, starting with `label` (WCAG 2.5.3). */
  accessibleName: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
}

/** Irreversible actions are confirmed in an AlertDialog; nothing else is. */
function ConfirmButton({
  label,
  accessibleName,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  destructive,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "That didn't work. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant={destructive ? "destructive" : "outline"}
            disabled={disabled}
            aria-label={accessibleName}
          />
        }
      >
        <Trash2Icon data-icon="inline-start" />
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending && <Spinner data-icon="inline-start" aria-hidden />}
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
