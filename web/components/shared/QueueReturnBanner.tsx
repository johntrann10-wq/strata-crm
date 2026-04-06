export function QueueReturnBanner({
  href,
}: {
  href: string | null | undefined;
}) {
  if (!href) return null;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
      <p className="text-sm font-medium">Working from a queue</p>
      <p className="text-xs text-muted-foreground">
        Your back and cancel actions will return to the same filtered list.
      </p>
    </div>
  );
}
