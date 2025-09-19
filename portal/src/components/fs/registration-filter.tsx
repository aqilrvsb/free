"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const PROFILES = ["internal", "external"];

export function RegistrationFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentProfile = searchParams.get("profile") ?? "internal";

  const handleChange = (nextProfile: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", nextProfile);
    startTransition(() => {
      router.push(`/fs/registrations?${params.toString()}`);
    });
  };

  return (
    <Select value={currentProfile} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Chọn profile" />
      </SelectTrigger>
      <SelectContent>
        {PROFILES.map((profile) => (
          <SelectItem key={profile} value={profile}>
            {profile}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
