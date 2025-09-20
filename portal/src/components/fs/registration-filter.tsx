"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const DEFAULT_PROFILES = ["internal", "external"];

interface RegistrationFilterProps {
  profiles?: string[];
  currentProfile?: string;
}

export function RegistrationFilter({ profiles = DEFAULT_PROFILES, currentProfile }: RegistrationFilterProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const selectedProfile = currentProfile ?? searchParams.get("profile") ?? profiles[0] ?? "internal";

  const uniqueProfiles = Array.from(new Set(profiles.length ? profiles : DEFAULT_PROFILES));

  const handleChange = (nextProfile: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", nextProfile);
    startTransition(() => {
      router.push(`/fs/registrations?${params.toString()}`);
    });
  };

  return (
    <Select value={selectedProfile} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Chọn profile" />
      </SelectTrigger>
      <SelectContent>
        {uniqueProfiles.map((profile) => (
          <SelectItem key={profile} value={profile}>
            {profile}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
