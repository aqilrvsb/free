import { apiFetch } from "@/lib/api";
import type { CommandResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegistrationFilter } from "@/components/fs/registration-filter";
import { PageHeader } from "@/components/common/page-header";

type SearchParamValue = string | string[] | undefined;

interface SofiaRegistration {
  aor?: string;
  user?: string;
  contact?: string;
  network_ip?: string;
  network_port?: string;
  status?: string;
  rpid?: string;
}

interface SofiaProfile {
  status?: { type?: string; state?: string };
  info?: Record<string, unknown>;
  registrations?: SofiaRegistration[] | { registrations?: SofiaRegistration[] };
}

interface SofiaRegistrationsPayload {
  profiles?: Record<string, SofiaProfile>;
}

function getValue(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractRegistrations(profile?: SofiaProfile): SofiaRegistration[] {
  if (!profile?.registrations) return [];
  if (Array.isArray(profile.registrations)) {
    return profile.registrations;
  }
  if (Array.isArray(profile.registrations.registrations)) {
    return profile.registrations.registrations;
  }
  return [];
}

export default async function RegistrationsPage({ searchParams = {} }: { searchParams?: Record<string, SearchParamValue> }) {
  const profile = getValue(searchParams.profile) || "internal";
  const data = await apiFetch<CommandResult<SofiaRegistrationsPayload>>(
    `/fs/sofia/${profile}/registrations`,
    { revalidate: 5 },
  );

  const payload = data.parsed;
  const profileData = payload?.profiles?.[profile];
  const registrations = extractRegistrations(profileData);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đăng ký SIP (${profile})`}
        description="Giám sát thiết bị đăng ký vào profile FreeSWITCH."
        actions={<RegistrationFilter />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Thông tin profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div><span className="font-medium">Trạng thái:</span> {profileData?.status?.state ?? "Không rõ"}</div>
          <div><span className="font-medium">Dialplan:</span> {(profileData?.info?.dialplan as string) ?? "-"}</div>
          <div><span className="font-medium">Context:</span> {(profileData?.info?.context as string) ?? "-"}</div>
          <div><span className="font-medium">SIP IP:</span> {(profileData?.info?.["sip-ip"] as string) ?? "-"}</div>
          <div>
            <span className="font-medium">RTP IP:</span>{" "}
            {Array.isArray(profileData?.info?.["rtp-ip"])
              ? (profileData?.info?.["rtp-ip"] as string[]).join(", ")
              : ((profileData?.info?.["rtp-ip"] as string) ?? "-")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Danh sách đăng ký</CardTitle>
          <div className="text-sm text-muted-foreground">{registrations.length} mục</div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((item) => (
                  <TableRow key={`${item.aor}-${item.contact}`}>
                    <TableCell>{item.aor || item.user || "-"}</TableCell>
                    <TableCell>{item.contact || "-"}</TableCell>
                    <TableCell>
                      {item.network_ip ? `${item.network_ip}${item.network_port ? `:${item.network_port}` : ""}` : "-"}
                    </TableCell>
                    <TableCell>{item.status || item.rpid || "-"}</TableCell>
                  </TableRow>
                ))}
                {registrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Không có thiết bị nào đăng ký.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw response</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {data.raw}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
