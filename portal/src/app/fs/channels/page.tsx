import { apiFetch } from "@/lib/api";
import type { CommandResult, FsChannel } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

export default async function ChannelsPage() {
  const channels = await apiFetch<CommandResult<FsChannel[]>>("/fs/channels", { revalidate: 5 });
  const items = Array.isArray(channels.parsed) ? channels.parsed : [];

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <CardTitle>Kênh đang hoạt động</CardTitle>
        <div className="text-sm text-muted-foreground">{items.length} kênh</div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UUID</TableHead>
                <TableHead>Chiều</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Đích</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Ứng dụng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((channel) => (
                <TableRow key={channel.uuid}>
                  <TableCell className="font-mono text-xs">{channel.uuid}</TableCell>
                  <TableCell>{channel.direction}</TableCell>
                  <TableCell>
                    {channel.cid_name ? `${channel.cid_name} (${channel.cid_num})` : channel.cid_num || "-"}
                  </TableCell>
                  <TableCell>{channel.dest || "-"}</TableCell>
                  <TableCell>{channel.state}</TableCell>
                  <TableCell>{formatDate(channel.created)}</TableCell>
                  <TableCell>{channel.application || "-"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Không có kênh nào hoạt động.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
