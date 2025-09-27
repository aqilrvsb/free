import { apiFetch } from "@/lib/api";
import type { CdrRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

interface CdrDetailPageProps {
  params: { callUuid: string };
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
  { key: "startTime", label: "Bắt đầu" },
  { key: "answerTime", label: "Trả lời" },
  { key: "endTime", label: "Kết thúc" },
  { key: "receivedAt", label: "Ghi nhận" },
];

export const dynamic = "force-dynamic";

export default async function CdrDetailPage({ params }: CdrDetailPageProps) {
  const callUuid = params.callUuid;
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
              {FIELDS.map(({ key, label }) => (
                <TableRow key={key as string}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell>{formatValue(record[key])}</TableCell>
                </TableRow>
              ))}
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (value instanceof Date) {
    return value.toLocaleString("vi-VN");
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && /T/.test(value)) {
      return date.toLocaleString("vi-VN");
    }
    return value;
  }
  return String(value);
}
