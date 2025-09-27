import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, className, actions }: PageHeaderProps) {
  const accentLabel = title?.split(" ")[0] ?? "";

  return (
    <div
      className={cn(
        "glass-surface relative overflow-hidden rounded-3xl px-6 py-6",
        "md:flex-row md:items-center md:justify-between md:gap-8",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_20%_0%,rgba(234,88,12,0.2),transparent),radial-gradient(90%_80%_at_80%_0%,rgba(249,115,22,0.12),transparent)]" />
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          {accentLabel}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-sm">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="relative z-[1] flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
