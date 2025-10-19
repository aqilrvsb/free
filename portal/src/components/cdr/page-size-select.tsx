"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

interface CdrPageSizeSelectProps {
  pageSize: number;
  searchParams: Record<string, string | string[]>;
}

export function CdrPageSizeSelect({ pageSize, searchParams }: CdrPageSizeSelectProps) {
  const router = useRouter();
  const pathname = usePathname() || "/cdr";

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (key === "page" || key === "pageSize") {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry !== undefined && entry !== "") {
            params.append(key, entry);
          }
        });
      } else if (value !== undefined && value !== "") {
        params.set(key, value);
      }
    });
    return params;
  }, [searchParams]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(baseParams.toString());
    params.delete("page");
    params.set("pageSize", event.target.value);
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <select
      id="cdr-page-size"
      name="pageSize"
      className="h-9 rounded-lg border border-border/60 bg-background px-2 text-sm"
      value={pageSize}
      onChange={handleChange}
    >
      {[25, 50, 100, 200].map((size) => (
        <option key={size} value={size}>
          {size}/trang
        </option>
      ))}
    </select>
  );
}
