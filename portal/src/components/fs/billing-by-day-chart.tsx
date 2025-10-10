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
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
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

  const insight = useMemo(() => {
    if (!hasData) {
      return null
    }
    const totalCost = data.reduce((acc, item) => acc + item.cost, 0)
    const totalCalls = data.reduce((acc, item) => acc + item.calls, 0)
    const averageCost = totalCost / data.length
    const peakCost = data.reduce(
      (acc, item) => (item.cost > acc.cost ? item : acc),
      data[0],
    )
    const peakCalls = data.reduce(
      (acc, item) => (item.calls > acc.calls ? item : acc),
      data[0],
    )
    return {
      averageCost,
      averageCalls: totalCalls / data.length,
      peakCost,
      peakCalls,
    }
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
        <ComposedChart data={data} className="pt-2">
          <defs>
            <linearGradient id="billingCostGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-cost)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-cost)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
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
          {insight ? (
            <ReferenceLine
              yAxisId="left"
              y={insight.averageCost}
              stroke="var(--color-cost)"
              strokeDasharray="6 6"
              strokeOpacity={0.3}
            />
          ) : null}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="cost"
            stroke="var(--color-cost)"
            strokeWidth={2.5}
            fill="url(#billingCostGradient)"
            activeDot={{ r: 5, strokeWidth: 1.5 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="calls"
            stroke="var(--color-calls)"
            strokeWidth={2.4}
            dot={{ r: 3.2 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ChartContainer>
      {caption ? (
        <p className="px-1 text-xs text-muted-foreground">
          Dữ liệu mới nhất cập nhật {caption}.
        </p>
      ) : null}
      {insight ? (
        <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-primary">Chi phí trung bình</span>
            <span className="font-mono text-sm text-foreground">
              {formatCurrency(insight.averageCost, currency)}
            </span>
            <span>
              Ngày cao nhất:{" "}
              <span className="font-medium text-foreground">
                {insight.peakCost.day} · {formatCurrency(insight.peakCost.cost, currency)}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-primary">Cuộc gọi trung bình</span>
            <span className="font-mono text-sm text-foreground">
              {formatNumber(insight.averageCalls)}
            </span>
            <span>
              Đỉnh tần suất:{" "}
              <span className="font-medium text-foreground">
                {insight.peakCalls.day} · {formatNumber(insight.peakCalls.calls)} cuộc
              </span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export type { BillingChartPoint }
