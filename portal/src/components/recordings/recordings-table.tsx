"use client";

import { useMemo, useState } from "react";
import type { RecordingMetadata, RecordingStorageConfig } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RecordingsTableProps {
  recordings: RecordingMetadata[];
  apiBaseUrl: string;
  storageConfig: RecordingStorageConfig;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN");
}

function formatSize(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const megaBytes = bytes / 1024 / 1024;
  if (megaBytes < 1) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${megaBytes.toFixed(2)} MB`;
}

export function RecordingsTable({ recordings, apiBaseUrl, storageConfig }: RecordingsTableProps) {
  const [open, setOpen] = useState(false);
  const [activeRecording, setActiveRecording] = useState<RecordingMetadata | null>(null);

  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);
  const cdnBase = useMemo(() => {
    if (storageConfig.mode !== 'cdn' || !storageConfig.cdnBaseUrl) {
      return null;
    }
    return storageConfig.cdnBaseUrl.replace(/\/$/, "");
  }, [storageConfig]);

  const buildUrl = (path: string) => {
    const normalized = path.replace(/^\/+/, '').split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return `${baseUrl}/recordings/${normalized}`;
  };

  const handlePreview = (recording: RecordingMetadata) => {
    setActiveRecording(recording);
    setOpen(true);
  };

  const playbackUrl = activeRecording ? buildUrl(activeRecording.path) : "";
  const storageDescription = cdnBase
    ? 'File được đồng bộ lên CDN nhưng được phát/tải qua API backend để đảm bảo quyền truy cập.'
    : 'Ghi âm được lưu tại FreeSWITCH và phục vụ trực tiếp qua API backend.';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setActiveRecording(null);
        }
      }}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên file</TableHead>
              <TableHead>Dung lượng</TableHead>
              <TableHead>Cập nhật</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((recording) => {
              const downloadUrl = buildUrl(recording.path);

              return (
                <TableRow key={recording.path}>
                  <TableCell className="font-medium">{recording.name}</TableCell>
                  <TableCell>{formatSize(recording.size)}</TableCell>
                  <TableCell>{formatDate(recording.modifiedAt)}</TableCell>
                  <TableCell className="flex items-center justify-end gap-2">
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handlePreview(recording)}
                      >
                        Nghe
                      </Button>
                    </DialogTrigger>
                    <Button asChild size="sm" variant="outline">
                      <a href={downloadUrl}>Tải xuống</a>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {recordings.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Chưa có file ghi âm nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DialogContent className="max-w-xl">
        {activeRecording ? (
          <>
            <DialogHeader>
              <DialogTitle>Nghe ghi âm</DialogTitle>
              <DialogDescription>
                {activeRecording.name} · {formatSize(activeRecording.size)} · {formatDate(activeRecording.modifiedAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm">
                <p>
                  <span className="font-medium">Đường dẫn:</span> {activeRecording.path}
                </p>
              </div>
              <audio controls className="w-full rounded-lg bg-card/80">
                <source src={playbackUrl} type="audio/wav" />
                Trình duyệt của bạn không hỗ trợ phát âm thanh.
              </audio>
            </div>
            <DialogFooter className="sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {storageDescription}
              </p>
              <Button asChild>
                <a href={playbackUrl} download>
                  Tải file WAV
                </a>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
