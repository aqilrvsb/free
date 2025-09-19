"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DIRECTION_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
];

interface CdrFilterProps {
  className?: string;
}

export function CdrFilter({ className }: CdrFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [callUuid, setCallUuid] = useState(searchParams.get("callUuid") ?? "");
  const [direction, setDirection] = useState(searchParams.get("direction") ?? "");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");

    if (callUuid.trim()) {
      params.set("callUuid", callUuid.trim());
    } else {
      params.delete("callUuid");
    }

    if (direction) {
      params.set("direction", direction);
    } else {
      params.delete("direction");
    }

    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  const handleReset = () => {
    setCallUuid("");
    setDirection("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("callUuid");
    params.delete("direction");
    params.set("page", "1");
    startTransition(() => {
      router.push(`/cdr?${params.toString()}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("grid gap-4 md:grid-cols-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="callUuid">Call UUID</Label>
        <Input
          id="callUuid"
          placeholder="Nhập Call UUID"
          value={callUuid}
          onChange={(event) => setCallUuid(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="direction">Chiều</Label>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger id="direction">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {DIRECTION_OPTIONS.map((option) => (
              <SelectItem key={option.value || "all"} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={isPending}>
          Lọc
        </Button>
        <Button type="button" variant="outline" onClick={handleReset} disabled={isPending}>
          Xóa lọc
        </Button>
      </div>
    </form>
  );
}
