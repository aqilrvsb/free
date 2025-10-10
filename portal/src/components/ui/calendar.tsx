"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "grid gap-4 sm:flex sm:flex-row",
        month: "space-y-4",
        caption: "relative flex items-center justify-center pt-1 pb-2",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button:
          "inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-background/80 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        nav_button_previous: "absolute left-1 top-1",
        nav_button_next: "absolute right-1 top-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex w-full justify-between",
        head_cell: "w-9 text-center text-xs font-medium uppercase text-muted-foreground",
        row: "flex w-full justify-between",
        cell: "relative h-9 w-9 text-center text-sm focus-within:relative focus-within:z-20",
        day: cn(
          "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-all",
          "hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ),
        day_selected:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-muted text-foreground",
        day_outside: "text-muted-foreground/60 opacity-60",
        day_disabled: "opacity-40 pointer-events-none",
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_range_middle: "aria-selected:bg-primary/20 aria-selected:text-primary",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...iconProps }) => (
          <svg
            {...iconProps}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        ),
        IconRight: ({ ...iconProps }) => (
          <svg
            {...iconProps}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
