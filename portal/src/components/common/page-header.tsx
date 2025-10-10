import { getServerTimezone } from "@/lib/server-timezone"
import type { PageHeaderClientProps, PageHeaderMeta } from "./page-header-client"
import { PageHeaderClient } from "./page-header-client"

export type { PageHeaderMeta }

export type PageHeaderProps = Omit<PageHeaderClientProps, "timezone" | "initialTimeIso">

export async function PageHeader(props: PageHeaderProps) {
  const timezone = (await getServerTimezone()) || "UTC"
  const initialTimeIso = new Date().toISOString()
  return <PageHeaderClient {...props} timezone={timezone} initialTimeIso={initialTimeIso} />
}
