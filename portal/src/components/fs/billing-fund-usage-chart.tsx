"use client"

import { useMemo } from "react"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Pie, PieChart, Cell } from "recharts"

type FundSliceKey = "usage" | "charges" | "remaining" | "overdrawn"

interface FundSlice {
  key: FundSliceKey
  label: string
  value: number
}

interface BillingFundUsageChartProps {
  slices: FundSlice[]
  currency: string
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${value.toFixed(0)} ${currency}`
  }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

export function BillingFundUsageChart({ slices, currency }: BillingFundUsageChartProps) {
  const filtered = useMemo(() => slices.filter((slice) => slice.value > 0), [slices])
  const chartConfig: ChartConfig = {
    usage: {
      label: "Cước dịch vụ",
      color: "hsl(17 88% 56%)",
    },
    charges: {
      label: "Phí phát sinh",
      color: "hsl(31 90% 60%)",
    },
    remaining: {
      label: "Còn lại",
      color: "hsl(161 70% 40%)",
    },
    overdrawn: {
      label: "Âm quỹ",
      color: "hsl(349 80% 58%)",
    },
  }

  const { total, consumptionValue } = useMemo(() => {
    const totalValue = Math.max(0, filtered.reduce((sum, slice) => sum + slice.value, 0))
    const consumption = filtered
      .filter((slice) => slice.key === "usage" || slice.key === "charges")
      .reduce((sum, slice) => sum + slice.value, 0)
    return {
      total: totalValue,
      consumptionValue: consumption,
    }
  }, [filtered])

  if (!filtered.length || total <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu cước hoặc quỹ cho khoảng thời gian đã chọn.
      </div>
    )
  }

  const percentSpent = total > 0 ? (consumptionValue / total) * 100 : 0

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full max-w-[320px]">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full rounded-[28px] border border-border/40 bg-card/80 p-4"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => {
                    const numeric = typeof value === "number" ? value : Number(value ?? 0)
                    const percent = total > 0 ? (numeric / total) * 100 : 0
                    const label = item?.payload?.label || name
                    return (
                      <div className="flex w-full flex-col gap-1">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="font-mono text-sm text-foreground">
                          {formatCurrency(numeric, currency)}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatPercent(percent)}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="label"
              innerRadius="60%"
              outerRadius="85%"
              paddingAngle={filtered.length > 1 ? 3 : 0}
              strokeWidth={3}
              startAngle={90}
              endAngle={-270}
            >
              {filtered.map((slice) => (
                <Cell key={slice.key} fill={`var(--color-${slice.key})`} stroke="transparent" />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Đã sử dụng</span>
          <span className="text-2xl font-semibold text-foreground">
            {formatCurrency(consumptionValue ?? 0, currency)}
          </span>
          <span className="text-xs text-muted-foreground">{formatPercent(percentSpent)} quỹ</span>
        </div>
      </div>

      <div className="grid w-full gap-2 text-sm">
        {filtered.map((slice) => {
          const percent = total > 0 ? (slice.value / total) * 100 : 0
          return (
            <div
              key={slice.key}
              className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/70 px-4 py-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: `var(--color-${slice.key})` }}
                />
                <span className="font-medium text-foreground">{slice.label}</span>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-foreground">
                  {formatCurrency(slice.value, currency)}
                </p>
                <p className="text-xs text-muted-foreground">{formatPercent(percent)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
