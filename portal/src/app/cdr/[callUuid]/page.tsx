import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import type { CdrRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { LocalTime } from "@/components/common/local-time";
import { getServerTimezone } from "@/lib/server-timezone";

function resolveStatusVariant(status: string) {
  switch (status) {
    case "answered":
      return "default" as const;
    case "busy":
    case "failed":
      return "destructive" as const;
    case "cancelled":
    case "no_answer":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

interface CdrDetailPageProps {
  params: Promise<{ callUuid: string }>;
}

const FIELDS: Array<{ key: keyof CdrRecord; label: string }> = [
  { key: "callUuid", label: "Call UUID" },
  { key: "leg", label: "Leg" },
  { key: "direction", label: "Chiều" },
  { key: "tenantId", label: "Tenant" },
  { key: "fromNumber", label: "Từ" },
  { key: "toNumber", label: "Đến" },
  { key: "durationSeconds", label: "Thời lượng (s)" },
  { key: "billSeconds", label: "Billsec (s)" },
  { key: "hangupCause", label: "Nguyên nhân" },
  { key: "finalStatusLabel", label: "Trạng thái cuối" },
  { key: "startTime", label: "Bắt đầu" },
  { key: "answerTime", label: "Trả lời" },
  { key: "endTime", label: "Kết thúc" },
  { key: "receivedAt", label: "Ghi nhận" },
];

export const dynamic = "force-dynamic";

export default async function CdrDetailPage({ params }: CdrDetailPageProps) {
  const { callUuid } = await params;
  const record = await apiFetch<CdrRecord | null>(`/cdr/call/${callUuid}`, { cache: "no-store" });

  if (!record) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Không tìm thấy CDR</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Không có bản ghi nào với Call UUID {callUuid}.</p>
          <Link className="text-primary hover:underline" href="/cdr">
            Quay lại danh sách
          </Link>
        </CardContent>
      </Card>
    );
  }

  const timezone = await getServerTimezone();

  return (
    <div className="space-y-6">
      <Link href="/cdr" className="text-sm text-primary hover:underline">
        ← Quay lại danh sách CDR
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CDR</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trường</TableHead>
                <TableHead>Giá trị</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FIELDS.map(({ key, label }) => {
                const value = record[key];
                let rendered: ReactNode;
                if (key === "finalStatusLabel") {
                  rendered = (
                    <Badge variant={resolveStatusVariant(record.finalStatus)}>{record.finalStatusLabel}</Badge>
                  );
                } else {
                  rendered = formatValue(value, timezone);
                }
                return (
                  <TableRow key={key as string}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell>{rendered}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {record.rawPayload && (
        <Card>
          <CardHeader>
            <CardTitle>Raw payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
              {record.rawPayload}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatValue(value: unknown, timezone: string): ReactNode {
  if (value === null || value === undefined) {
    return "-";
  }
  if (value instanceof Date) {
    return <LocalTime value={value.toISOString()} serverTimezone={timezone} />;
  }
  if (typeof value === "string") {
    if (/T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return <LocalTime value={value} serverTimezone={timezone} />;
      }
    }
    return value;
  }
  return String(value);
}
