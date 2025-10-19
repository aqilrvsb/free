"use server";

import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import type { BillingSummaryResponse } from "@/lib/types";
import ExcelJS from "exceljs";
import { format } from "date-fns";

const NUMBER_FORMAT = "#,##0.00";
const CURRENCY_FORMAT = "#,##0.00 [$₫-421]";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const params = new URLSearchParams();
  if (tenantId && tenantId !== "all") {
    params.set("tenantId", tenantId);
  }
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }

  const summaryPath = `/billing/summary${params.toString() ? `?${params.toString()}` : ""}`;

  try {
    const summary = await apiFetch<BillingSummaryResponse>(summaryPath, {
      cache: "no-store",
      fallbackValue: undefined,
      suppressError: false,
    });

    const charges = summary.charges ?? [];
    const currency = summary.totals.currency || "VND";
    const { totalCost, totalCalls, totalBillMinutes, totalBillSeconds, averageCostPerCall, averageCostPerMinute } =
      summary.totals;
    const serviceCost = Number(totalCost ?? 0);
    const chargesTotal =
      summary.chargesTotal ?? charges.reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
    const overallCost = serviceCost + chargesTotal;
    const chargesCount = charges.length;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "PBX Portal";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Tong quan");
    summarySheet.columns = [
      { header: "Phân loại", key: "category", width: 24 },
      { header: "Mục", key: "label", width: 32 },
      { header: "Mã chỉ số", key: "code", width: 24 },
      { header: "Giá trị thô", key: "raw", width: 18 },
      { header: "Giá trị hiển thị", key: "display", width: 24 },
      { header: "Tiền tệ", key: "currency", width: 12 },
      { header: "Ghi chú", key: "note", width: 36 },
    ];
    summarySheet.addRows([
      ["Tổng quan", "Cước dịch vụ", "service_cost", serviceCost, undefined, currency, `${totalBillMinutes.toFixed(2)} phút`],
      ["Tổng quan", "Phí phát sinh", "charges_total", chargesTotal, undefined, currency, `${chargesCount} giao dịch`],
      ["Tổng quan", "Tổng chi phí", "overall_cost", overallCost, undefined, currency, ""],
      ["Tổng quan", "Tổng cuộc gọi", "total_calls", totalCalls, undefined, "", ""],
      ["Tổng quan", "Tổng phút tính cước", "total_bill_minutes", totalBillMinutes, undefined, "", `${totalBillSeconds.toFixed(0)} giây`],
      ["Tổng quan", "Giá trung bình mỗi cuộc", "avg_cost_per_call", averageCostPerCall ?? 0, undefined, currency, ""],
      ["Tổng quan", "Giá trung bình mỗi phút", "avg_cost_per_minute", averageCostPerMinute ?? 0, undefined, currency, ""],
    ]);
    summarySheet.getColumn("raw").numFmt = NUMBER_FORMAT;
    summarySheet.getRows(2, summarySheet.rowCount - 1)?.forEach((row) => {
      const currencyCell = row.getCell("currency").value ? row.getCell("raw") : null;
      if (currencyCell) {
        currencyCell.numFmt = CURRENCY_FORMAT;
      }
    });

    const byDaySheet = workbook.addWorksheet("Theo ngay");
    byDaySheet.columns = [
      { header: "Ngày", key: "day", width: 18 },
      { header: "Chi phí (thô)", key: "raw", width: 18 },
      { header: "Chi phí (hiển thị)", key: "display", width: 22 },
      { header: "Cuộc gọi", key: "calls", width: 14 },
    ];
    summary.byDay.forEach((item) => {
      byDaySheet.addRow({
        day: item.day,
        raw: item.totalCost,
        display: undefined,
        calls: item.totalCalls,
      });
    });
    byDaySheet.getColumn("raw").numFmt = CURRENCY_FORMAT;

    const routeSheet = workbook.addWorksheet("Theo route");
    routeSheet.columns = [
      { header: "Route ID", key: "routeId", width: 24 },
      { header: "Tên route", key: "routeName", width: 36 },
      { header: "Chi phí (thô)", key: "cost", width: 18 },
      { header: "Cuộc gọi", key: "calls", width: 14 },
      { header: "Chi phí/cuộc", key: "avg", width: 18 },
    ];
    summary.topRoutes.forEach((route) => {
      const avg = route.totalCalls > 0 ? route.totalCost / route.totalCalls : 0;
      routeSheet.addRow({
        routeId: route.routeId || "",
        routeName: route.routeName || "-",
        cost: route.totalCost,
        calls: route.totalCalls,
        avg,
      });
    });
    routeSheet.getColumn("cost").numFmt = CURRENCY_FORMAT;
    routeSheet.getColumn("avg").numFmt = CURRENCY_FORMAT;

    const cidSheet = workbook.addWorksheet("Theo caller ID");
    cidSheet.columns = [
      { header: "Caller ID", key: "cid", width: 28 },
      { header: "Chi phí (thô)", key: "cost", width: 18 },
      { header: "Cuộc gọi", key: "calls", width: 14 },
      { header: "Tỷ trọng", key: "share", width: 14 },
    ];
    summary.cidBreakdown.forEach((cid) => {
      const share = overallCost > 0 ? cid.totalCost / overallCost : 0;
      cidSheet.addRow({
        cid: cid.cid || "-",
        cost: cid.totalCost,
        calls: cid.totalCalls,
        share,
      });
    });
    cidSheet.getColumn("cost").numFmt = CURRENCY_FORMAT;
    cidSheet.getColumn("share").numFmt = "0.00%";

    const chargeSheet = workbook.addWorksheet("Phi phat sinh");
    chargeSheet.columns = [
      { header: "Mã", key: "id", width: 32 },
      { header: "Số tiền", key: "amount", width: 18 },
      { header: "Mô tả", key: "description", width: 40 },
      { header: "Ngày tạo (ISO)", key: "createdIso", width: 24 },
      { header: "Ngày tạo (VN)", key: "createdLocal", width: 24 },
    ];
    charges.forEach((charge) => {
      const amount = Number(charge.amount ?? 0);
      const createdIso = charge.createdAt ? format(new Date(charge.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
      const createdLocal = charge.createdAt ? format(new Date(charge.createdAt), "dd/MM/yyyy HH:mm:ss") : "";
      chargeSheet.addRow({
        id: charge.id || "",
        amount,
        description: charge.description || "-",
        createdIso,
        createdLocal,
      });
    });
    chargeSheet.getColumn("amount").numFmt = CURRENCY_FORMAT;

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `billing-export-${format(new Date(), "yyyyMMdd-HHmmss")}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Không thể xuất dữ liệu billing.", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
