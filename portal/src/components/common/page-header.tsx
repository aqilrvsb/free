import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { getServerTimezone } from "@/lib/server-timezone";

interface PageHeaderMeta {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  indicator?: "default" | "success" | "warning" | "danger";
  description?: ReactNode;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  actions?: ReactNode;
  meta?: PageHeaderMeta[];
}

function indicatorClass(variant: PageHeaderMeta["indicator"]) {
  switch (variant) {
    case "success":
      return "text-emerald-500";
    case "warning":
      return "text-amber-500";
    case "danger":
      return "text-rose-500";
    default:
      return "text-foreground";
  }
}

export async function PageHeader({ title, description, className, actions, meta }: PageHeaderProps) {
  const accentLabel = title?.split(" ")[0] ?? "";
  const timezone = await getServerTimezone();
  const sanitizedTimezone = timezone || "UTC";
  const timeLabel = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: sanitizedTimezone,
  }).format(new Date());

  const defaultMeta: PageHeaderMeta[] = [
    {
      label: "Múi giờ hệ thống",
      value: sanitizedTimezone,
      helper: timeLabel,
    },
    {
      label: "Trạng thái kết nối",
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.85)]" />
          Hoạt động
        </span>
      ),
      indicator: "success",
      description: "ESL & webhook ổn định",
    },
  ];

  const metaCards = meta && meta.length > 0 ? meta : defaultMeta;

  return (
    <AspectRatio
      ratio={16 / 6}
      className={cn(
        "relative w-full overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/12 via-background to-primary/5 shadow-lg",
        className,
      )}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_120%_at_15%_-10%,rgba(59,130,246,0.16),transparent),radial-gradient(110%_120%_at_90%_0%,rgba(249,115,22,0.16),transparent)]" />
      <div className="relative grid h-full gap-6 px-8 py-9 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {accentLabel}
            </div>
            <h2 className="text-3xl font-semibold leading-tight text-foreground drop-shadow-sm">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        <div className="grid gap-3">
          {metaCards.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl border border-border/60 bg-background/85 px-5 py-4 text-xs shadow-sm backdrop-blur"
            >
              <div className="flex items-center justify-between uppercase tracking-[0.2em] text-muted-foreground">
                <span>{item.label}</span>
                {item.helper ? (
                  <span className="font-medium normal-case tracking-normal text-foreground">{item.helper}</span>
                ) : null}
              </div>
              <div className="mt-3 text-sm font-semibold">
                <span className={cn("text-sm font-semibold", indicatorClass(item.indicator))}>{item.value}</span>
              </div>
              {item.description ? (
                <p className="mt-2 text-xs text-muted-foreground normal-case tracking-normal">{item.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </AspectRatio>
  );
}
