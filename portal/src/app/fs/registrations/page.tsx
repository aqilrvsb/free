import { apiFetch } from "@/lib/api";
import { parsePortalUserCookie } from "@/lib/auth";
import type { CommandResult, PortalUserSummary, TenantLookupItem } from "@/lib/types";
import { RegistrationFilter } from "@/components/fs/registration-filter";
import { PageHeader } from "@/components/common/page-header";
import { RegistrationsRealtime } from "@/components/fs/registrations-realtime";
import { buildSnapshot, type RegistrationSnapshot, type SofiaRegistrationsPayload } from "@/lib/registrations";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

type SearchParamValue = string | string[] | undefined;

export const dynamic = "force-dynamic";

function getValue(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const profile = getValue(resolvedSearchParams.profile) || "internal";
  const rawDomain = getValue(resolvedSearchParams.domain);
  const domain = rawDomain?.trim() ? rawDomain.trim().toLowerCase() : undefined;

  const fallback: CommandResult<SofiaRegistrationsPayload> = {
    raw: "",
    parsed: {
      profiles: {},
    },
  };

  const cookieStore = await cookies();
  const rawUser = cookieStore.get("portal_user")?.value ?? null;
  let currentUser: PortalUserSummary | null = parsePortalUserCookie(rawUser);

  if (!currentUser) {
    currentUser =
      (await apiFetch<PortalUserSummary | null>("/auth/profile", {
        cache: "no-store",
        fallbackValue: null,
        suppressError: true,
        onError: (error) => console.warn("[fs/registrations] Không thể tải profile", error),
      })) || null;
  }

  if (!currentUser || !hasPermission(currentUser, "view_registrations")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Đăng ký SIP"
          description="Bạn không có quyền truy cập trang theo dõi đăng ký SIP."
        />
      </div>
    );
  }

  const isSuperAdmin = currentUser?.role === "super_admin";
  const shouldPersistProfileParam = resolvedSearchParams.profile !== undefined || profile !== "internal";

  const buildTargetUrl = (nextDomain?: string | null) => {
    const urlParams = new URLSearchParams();
    if (shouldPersistProfileParam) {
      urlParams.set("profile", profile);
    }
    if (nextDomain) {
      urlParams.set("domain", nextDomain);
    }
    const query = urlParams.toString();
    return query ? `/fs/registrations?${query}` : "/fs/registrations";
  };

  const buildRequestPath = (domainValue?: string | null) => {
    const urlParams = new URLSearchParams();
    if (domainValue) {
      urlParams.set("domain", domainValue);
    }
    return `/fs/sofia/${profile}/registrations${
      urlParams.size > 0 ? `?${urlParams.toString()}` : ""
    }`;
  };

  let tenantOptions: TenantLookupItem[] = [];
  let effectiveDomain: string | null = domain ?? null;
  let data: CommandResult<SofiaRegistrationsPayload>;

  if (isSuperAdmin) {
    const requestPath = buildRequestPath(effectiveDomain);
    const [fetchedData, fetchedTenantOptions] = await Promise.all([
      apiFetch<CommandResult<SofiaRegistrationsPayload>>(requestPath, {
        cache: "no-store",
        fallbackValue: fallback,
        suppressError: true,
        onError: (error) => console.warn(`[_registrations] Không thể tải dữ liệu profile ${profile}`, error),
      }),
      apiFetch<TenantLookupItem[]>("/tenants/options", {
        cache: "no-store",
        fallbackValue: [],
        suppressError: true,
        onError: (error) => console.warn("[_registrations] Không thể tải danh sách domain", error),
      }),
    ]);
    data = fetchedData;
    tenantOptions = fetchedTenantOptions;
  } else {
    tenantOptions =
      (await apiFetch<TenantLookupItem[]>("/tenants/options", {
        cache: "no-store",
        fallbackValue: [],
        suppressError: true,
        onError: (error) => console.warn("[_registrations] Không thể tải danh sách domain", error),
      })) ?? [];

    const normalizedDomains = tenantOptions
      .map((tenant) => tenant.domain?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value));
    const allowedDomains = new Set(normalizedDomains);

    if (normalizedDomains.length === 0) {
      if (domain) {
        redirect(buildTargetUrl(null));
      }
      effectiveDomain = null;
    } else {
      if (!domain || !allowedDomains.has(domain)) {
        const fallbackDomain = normalizedDomains[0];
        if (fallbackDomain !== undefined) {
          redirect(buildTargetUrl(fallbackDomain));
        }
      }
      effectiveDomain = domain ?? normalizedDomains[0] ?? null;
    }

    const requestPath = buildRequestPath(effectiveDomain);
    data = await apiFetch<CommandResult<SofiaRegistrationsPayload>>(requestPath, {
      cache: "no-store",
      fallbackValue: fallback,
      suppressError: true,
      onError: (error) => console.warn(`[_registrations] Không thể tải dữ liệu profile ${profile}`, error),
    });
  }

  const parsedPayload = data.parsed as SofiaRegistrationsPayload | undefined;
  const availableProfiles = Object.keys(parsedPayload?.profiles ?? {});
  if (!availableProfiles.includes(profile)) {
    availableProfiles.unshift(profile);
  }

  const initialSnapshot: RegistrationSnapshot = buildSnapshot(
    parsedPayload,
    profile,
    data.raw ?? "",
    effectiveDomain,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đăng ký SIP (${profile})`}
        description="Giám sát thiết bị đăng ký vào profile FreeSWITCH với cập nhật realtime."
        actions={
          <RegistrationFilter
            profiles={availableProfiles}
            currentProfile={profile}
            currentDomain={effectiveDomain}
            tenantOptions={tenantOptions}
            allowAllDomains={isSuperAdmin}
          />
        }
      />
      <RegistrationsRealtime profile={profile} domain={effectiveDomain} initialSnapshot={initialSnapshot} />
    </div>
  );
}
