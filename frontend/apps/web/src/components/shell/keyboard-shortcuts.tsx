"use client";

import { useI18n } from "@saas/intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@saas/ui";

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm">{label}</dt>
      <dd>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {keys}
        </kbd>
      </dd>
    </div>
  );
}

/** Keyboard shortcuts reference (opened from Help or the command palette). */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shell.help.shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shell.help.shortcuts.hint")}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2.5">
          <ShortcutRow label={t("shell.shortcuts.palette")} keys="⌘K / Ctrl+K" />
          <ShortcutRow label={t("shell.shortcuts.theme")} keys="T" />
          <ShortcutRow label={t("shell.shortcuts.signOut")} keys="⌘⇧Q" />
        </dl>
      </DialogContent>
    </Dialog>
  );
}
