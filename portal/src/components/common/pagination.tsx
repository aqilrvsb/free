"use client";

import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function PaginationControls({ page, pageSize, total }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const updatePage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm text-muted-foreground">
        Trang {page} / {pageCount} · Tổng {total} bản ghi
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => updatePage(Math.max(1, page - 1))}
          disabled={isPending || page <= 1}
        >
          Trang trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => updatePage(Math.min(pageCount, page + 1))}
          disabled={isPending || page >= pageCount}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}
