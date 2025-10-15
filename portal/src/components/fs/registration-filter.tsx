'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TenantLookupItem } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

const DEFAULT_PROFILES = ["internal", "external"];
const ALL_DOMAINS_VALUE = "__all__";

interface RegistrationFilterProps {
  profiles?: string[];
  currentProfile?: string;
  tenantOptions?: TenantLookupItem[];
  currentDomain?: string | null;
  allowAllDomains?: boolean;
}

export function RegistrationFilter({
  profiles = DEFAULT_PROFILES,
  currentProfile,
  tenantOptions = [],
  currentDomain = null,
  allowAllDomains = true,
}: RegistrationFilterProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const selectedProfile = currentProfile ?? searchParams.get("profile") ?? profiles[0] ?? "internal";
  const selectedDomainParam = currentDomain ?? searchParams.get("domain") ?? "";
  const selectedDomain = selectedDomainParam?.trim().toLowerCase() ?? "";

  const uniqueProfiles = useMemo(() => Array.from(new Set(profiles.length ? profiles : DEFAULT_PROFILES)), [profiles]);

  const domainChoices = useMemo(() => {
    const unique = new Map<string, { value: string; label: string; description?: string | null }>();
    for (const tenant of tenantOptions) {
      const domain = tenant.domain?.trim();
      if (!domain) {
        continue;
      }
      const value = domain.toLowerCase();
      if (unique.has(value)) {
        continue;
      }
      unique.set(value, {
        value,
        label: domain,
        description: tenant.name ?? null,
      });
    }
    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [tenantOptions]);

  const domainSelectValue = useMemo(() => {
    if (selectedDomain) {
      return selectedDomain;
    }
    if (allowAllDomains) {
      return ALL_DOMAINS_VALUE;
    }
    return domainChoices[0]?.value ?? "";
  }, [allowAllDomains, domainChoices, selectedDomain]);

  const pushWithParams = (params: URLSearchParams) => {
    const queryString = params.toString();
    const target = queryString ? `/fs/registrations?${queryString}` : "/fs/registrations";
    startTransition(() => {
      router.push(target);
    });
  };

  const handleProfileChange = (nextProfile: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", nextProfile);
    pushWithParams(params);
  };

  const handleDomainChange = (nextDomainValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (allowAllDomains && nextDomainValue === ALL_DOMAINS_VALUE) {
      params.delete("domain");
      pushWithParams(params);
      return;
    }
    const normalized = nextDomainValue.trim().toLowerCase();
    if (normalized) {
      params.set("domain", normalized);
    } else {
      params.delete("domain");
    }
    pushWithParams(params);
  };

  const hasDomainOptions = allowAllDomains || domainChoices.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedProfile} onValueChange={handleProfileChange} disabled={isPending}>
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

      {hasDomainOptions ? (
        <Select value={domainSelectValue} onValueChange={handleDomainChange} disabled={isPending}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={allowAllDomains ? "Tất cả domain" : "Chọn domain"} />
          </SelectTrigger>
          <SelectContent>
            {allowAllDomains ? <SelectItem value={ALL_DOMAINS_VALUE}>Tất cả domain</SelectItem> : null}
            {domainChoices.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.description ? `${option.label} (${option.description})` : option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
