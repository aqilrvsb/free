import { apiFetch } from "@/lib/api";
import type { CommandResult } from "@/lib/types";
import { RegistrationFilter } from "@/components/fs/registration-filter";
import { PageHeader } from "@/components/common/page-header";
import { RegistrationsRealtime } from "@/components/fs/registrations-realtime";
import { buildSnapshot, type RegistrationSnapshot, type SofiaRegistrationsPayload } from "@/lib/registrations";

type SearchParamValue = string | string[] | undefined;

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
  const data = await apiFetch<CommandResult<SofiaRegistrationsPayload>>(
    `/fs/sofia/${profile}/registrations`,
    { revalidate: 5 },
  );

  const parsedPayload = data.parsed as SofiaRegistrationsPayload | undefined;
  const availableProfiles = Object.keys(parsedPayload?.profiles ?? {});
  if (!availableProfiles.includes(profile)) {
    availableProfiles.unshift(profile);
  }

  const initialSnapshot: RegistrationSnapshot = buildSnapshot(
    parsedPayload,
    profile,
    data.raw ?? "",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đăng ký SIP (${profile})`}
        description="Giám sát thiết bị đăng ký vào profile FreeSWITCH với cập nhật realtime."
        actions={<RegistrationFilter profiles={availableProfiles} currentProfile={profile} />}
      />
      <RegistrationsRealtime profile={profile} initialSnapshot={initialSnapshot} />
    </div>
  );
}
