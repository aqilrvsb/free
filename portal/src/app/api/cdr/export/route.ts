"use server";

import { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import type { CdrRecord, PaginatedCdrResponse } from "@/lib/types";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { getServerTimezone } from "@/lib/server-timezone";
import { formatWithTimezone } from "@/lib/timezone";

const PAGE_SIZE = 500;
const CURRENCY_FORMAT = "#,##0.00 [$₫-421]";
const NUMBER_FORMAT = "#,##0.00";

function resolveDirection(direction?: string | null) {
  if (!direction) return "-";
  switch (direction.toLowerCase()) {
    case "inbound":
      return "Cuộc gọi đến";
    case "outbound":
      return "Cuộc gọi đi";
    case "internal":
      return "Nội bộ";
    default:
      return direction;
  }
}

function formatDateValue(value: string | null | undefined, timezone: string) {
  if (!value) return { iso: "", local: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { iso: value, local: value };
  }
  return {
    iso: format(date, "yyyy-MM-dd HH:mm:ss"),
    local: formatWithTimezone(date, timezone || "UTC", {
      dateStyle: "short",
      timeStyle: "medium",
    }),
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.delete("page");
  params.delete("pageSize");

  const fetchPage = async (page: number): Promise<PaginatedCdrResponse | null> => {
    const pageParams = new URLSearchParams(params);
    pageParams.set("page", String(page));
    pageParams.set("pageSize", String(PAGE_SIZE));
    try {
      return await apiFetch<PaginatedCdrResponse>(`/cdr?${pageParams.toString()}`, {
        cache: "no-store",
        suppressError: false,
      });
    } catch (error) {
      console.error("[cdr-export] fetch page failed", error);
      return null;
    }
  };

  const allItems: CdrRecord[] = [];
  let page = 1;
  let total = Infinity;

  const timezone = await getServerTimezone();

  while (allItems.length < total) {
    const result = await fetchPage(page);
    if (!result || !Array.isArray(result.items) || result.items.length === 0) {
      break;
    }
    total = result.total ?? result.items.length;
    allItems.push(...result.items);
    if (result.items.length < PAGE_SIZE) {
      break;
    }
    page += 1;
    if (page > 2000) {
      break;
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PBX Portal";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("CDR");
  sheet.columns = [
    { header: "Call UUID", key: "callUuid", width: 40 },
    { header: "Chiều", key: "direction", width: 18 },
    { header: "Extension", key: "extension", width: 16 },
    { header: "Caller ID", key: "callerId", width: 24 },
    { header: "Số bị gọi", key: "destination", width: 24 },
    { header: "Agent", key: "agent", width: 22 },
    { header: "Nhóm agent", key: "agentGroup", width: 22 },
    { header: "Gateway", key: "gateway", width: 18 },
    { header: "Bill seconds", key: "billSeconds", width: 16 },
    { header: "Chi phí", key: "cost", width: 18 },
    { header: "Tiền tệ", key: "currency", width: 12 },
    { header: "Trạng thái", key: "status", width: 18 },
    { header: "Bắt đầu", key: "startLocal", width: 24 },
    { header: "Kết thúc", key: "endLocal", width: 24 },
    { header: "Ghi âm", key: "recording", width: 30 },
  ];

  allItems.forEach((item) => {
    const extension = item.extensionNumber || item.legs?.internal?.extension || "";
    const callerId =
      item.externalCallerId ||
      item.billingCid ||
      item.legs?.external?.callerId ||
      item.fromNumber ||
      item.legs?.internal?.callerIdName ||
      "";
    const destination = item.destinationNumber || item.legs?.external?.destination || item.toNumber || "";
    const gateway = item.gatewayName || item.legs?.external?.gateway || item.legs?.internal?.gateway || "";
    const agent = item.agentName || "";
    const agentGroup = item.agentGroupName || "";
    const currencyValue = item.billingCurrency || "VND";
    const cost = Number(item.billingCost ?? 0);
    const timeStart = formatDateValue(item.startTime, timezone);
    const timeEnd = formatDateValue(item.endTime, timezone);
    const recording = item.recordingUrl || item.recordingFilename || "";

    sheet.addRow({
      callUuid: item.callUuid,
      direction: resolveDirection(item.direction),
      extension,
      callerId,
      destination,
      agent,
      agentGroup,
      gateway,
      billSeconds: Number(item.billSeconds ?? item.durationSeconds ?? 0),
      cost,
      currency: currencyValue,
      status: item.finalStatusLabel || item.finalStatus || "",
      startLocal: timeStart.local,
      endLocal: timeEnd.local,
      recording,
    });
  });

  sheet.getColumn("billSeconds").numFmt = NUMBER_FORMAT;
  sheet.getColumn("cost").numFmt = CURRENCY_FORMAT;

  const now = new Date();
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = `cdr-export-${format(now, "yyyyMMdd-HHmmss")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
