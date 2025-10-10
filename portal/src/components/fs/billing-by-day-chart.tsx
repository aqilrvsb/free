"use client"

import { useMemo } from "react"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { formatDistanceToNow } from "date-fns"
import { vi } from "date-fns/locale"

type BillingChartPoint = {
  day: string
  rawDay: string
  cost: number
  calls: number
}

interface BillingByDayChartProps {
  data: BillingChartPoint[]
  config: ChartConfig
  currency: string
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCurrencyCompact(value: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)
}

export function BillingByDayChart({ data, config, currency }: BillingByDayChartProps) {
  const hasData = data.length > 0
  const caption = useMemo(() => {
    if (!hasData) return null
    const last = data[data.length - 1]
    return formatDistanceToNow(new Date(last.rawDay), {
      addSuffix: true,
      locale: vi,
    })
  }, [data, hasData])

  if (!hasData) {
    return (
      <div className="rounded-[24px] border border-dashed border-primary/30 bg-gradient-to-t from-primary/5 via-background to-background px-6 py-10 text-sm text-muted-foreground">
        Không có dữ liệu trong giai đoạn đã chọn.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ChartContainer
        config={config}
        className="rounded-[24px] border border-dashed border-primary/30 bg-gradient-to-t from-primary/5 via-background to-background p-4"
      >
        <BarChart data={data} barSize={14} className="pt-2">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            tickLine={false}
            axisLine={false}
            width={80}
            tickFormatter={(value) => formatCurrencyCompact(value as number, currency)}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(value) => formatNumber(value as number)}
            stroke="hsl(var(--muted-foreground))"
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  const numeric = typeof value === "number" ? value : Number(value ?? 0)
                  const label = config[name as keyof typeof config]?.label ?? name
                  const formattedValue =
                    name === "cost" ? formatCurrency(numeric, currency) : formatNumber(numeric)
                  return (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold tabular-nums">{formattedValue}</span>
                    </div>
                  )
                }}
                labelFormatter={(_value, payload) => {
                  const rawDay = payload?.[0]?.payload?.rawDay as string | undefined
                  return rawDay ?? payload?.[0]?.payload?.day ?? ""
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="right" />
          <Bar yAxisId="left" dataKey="cost" radius={[6, 6, 0, 0]} fill="var(--color-cost)" />
          <Bar yAxisId="right" dataKey="calls" radius={[6, 6, 0, 0]} fill="var(--color-calls)" />
        </BarChart>
      </ChartContainer>
      {caption ? (
        <p className="px-1 text-xs text-muted-foreground">
          Dữ liệu mới nhất cập nhật {caption}.
        </p>
      ) : null}
    </div>
  )
}

export type { BillingChartPoint }
