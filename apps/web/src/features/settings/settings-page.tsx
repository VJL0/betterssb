"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
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
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ButtonLink } from "@/components/button-link";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field";
import { Kbd } from "@workspace/ui/components/kbd";
import { Switch } from "@workspace/ui/components/switch";
import { Spinner } from "@workspace/ui/components/spinner";
import { ProgramPicker } from "@/features/program/program-picker";
import { TermSelect } from "@/components/term-select";
import { useExtensionInstalled } from "@/hooks/use-extension-installed";
import { useSettings } from "@/hooks/use-settings";
import { EXTENSION_INSTALL_URL } from "@/lib/config";
import { useStoreDocument, useStoreState } from "@/lib/store/store-context";
import { downloadStoreExport } from "./export-data";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card
      aria-labelledby={headingId}
      className="gap-4 p-5"
      render={<section />}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-base font-medium">
          {title}
        </h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

/** Guest-only until account sync exists. */
export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <TermSection />
      <ExtensionSection />
      <KeyboardSection />
      <DataSection />
    </div>
  );
}

function TermSection() {
  return (
    <SettingsSection title="Term and major">
      <Field>
        {/* The select names itself; this is the visible heading. */}
        <FieldTitle>Term</FieldTitle>
        <TermSelect className="w-full sm:w-64" />
      </Field>
      <ProgramPicker />
    </SettingsSection>
  );
}

const SHORTCUTS = [
  { keys: ["/"], action: "Jump to course search" },
  { keys: ["J", "K"], action: "Next / previous search result" },
  { keys: ["A"], action: "Add or remove a class" },
  { keys: ["[", "]"], action: "Previous / next schedule" },
] as const;

function KeyboardSection() {
  const { settings, update } = useSettings();
  const switchId = useId();
  return (
    <SettingsSection title="Keyboard">
      <Field orientation="horizontal">
        <FieldLabel htmlFor={switchId}>Keyboard shortcuts</FieldLabel>
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

function ExtensionSection() {
  const extensionInstalled = useExtensionInstalled();
  // Its options only take effect through the extension, so they wait for it.
  return (
    <SettingsSection
      title="Chrome extension"
      description={
        extensionInstalled
          ? undefined
          : "Needed for DARS, auto-register and Banner ratings."
      }
    >
      {extensionInstalled ? (
        <BannerRatingsSwitch />
      ) : (
        EXTENSION_INSTALL_URL && (
          <ButtonLink href={EXTENSION_INSTALL_URL} className="self-start">
            Add the extension
          </ButtonLink>
        )
      )}
    </SettingsSection>
  );
}

function BannerRatingsSwitch() {
  const { settings, update } = useSettings();
  const switchId = useId();
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={switchId}>Show ratings on Banner</FieldLabel>
        <FieldDescription>
          Rate My Professors scores before instructors in Banner's class search.
        </FieldDescription>
      </FieldContent>
      <Switch
        id={switchId}
        checked={settings.bannerOverlay}
        onCheckedChange={(bannerOverlay) => void update({ bannerOverlay })}
      />
    </Field>
  );
}

function DataSection() {
  const state = useStoreState();
  const threads = useStoreDocument("advisorThreads");
  const opened = state.status === "ready" ? state.opened : null;
  const where =
    opened?.location === "extension"
      ? "Only saved in the extension, not your Temple account."
      : "Only saved in this browser, not your Temple account.";

  async function deleteAll() {
    if (!opened) return;
    const keys: StoreKey[] = await opened.store.keys();
    await Promise.all(keys.map((key) => opened.store.delete(key)));
    toast.success("Everything deleted");
  }

  return (
    <SettingsSection title="Your data" description={where}>
      <DataRow
        title="Download a copy"
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
        title="Delete advisor chats"
        description={
          threads.value?.length
            ? `${threads.value.length} saved chat${threads.value.length === 1 ? "" : "s"}.`
            : "No saved chats."
        }
        action={
          <ConfirmButton
            accessibleName="Delete advisor chats"
            disabled={!opened || !threads.value?.length}
            title="Delete all advisor chats?"
            description="This can't be undone."
            confirmLabel="Delete chats"
            onConfirm={async () => {
              await opened?.store.delete("advisorThreads");
              toast.success("Chats deleted");
            }}
          />
        }
      />
      <DataRow
        title="Delete everything"
        action={
          <ConfirmButton
            accessibleName="Delete everything"
            destructive
            disabled={!opened}
            title="Delete everything?"
            description="Download a copy first if you might want it back. This can't be undone."
            confirmLabel="Delete"
            onConfirm={deleteAll}
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
  description?: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <span className="flex min-w-0 grow basis-64 flex-col">
        <span className="font-medium">{title}</span>
        {description && (
          <span className="text-muted-foreground">{description}</span>
        )}
      </span>
      {action}
    </div>
  );
}

interface ConfirmButtonProps {
  /** Full name for assistive tech, starting with "Delete" (WCAG 2.5.3). */
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
    }
    setPending(false);
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
        Delete
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
