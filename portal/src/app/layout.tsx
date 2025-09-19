import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PBX Portal",
  description: "Giao diện quản lý và giám sát FreeSWITCH",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="bg-[radial-gradient(120%_120%_at_50%_-20%,rgba(249,115,22,0.16),transparent)]">
            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-6">
                  <SidebarTrigger className="text-muted-foreground hover:text-primary" />
                  <div className="flex flex-col">
                    <h1 className="text-lg font-semibold">PBX Portal</h1>
                    <p className="text-sm text-muted-foreground">
                      Theo dõi CDR, trạng thái FreeSWITCH và ghi âm cuộc gọi
                    </p>
                  </div>
                </div>
              </header>
              <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-6 py-10">{children}</main>
              <footer className="border-t bg-card/60">
                <div className="mx-auto w-full max-w-7xl px-6 py-4 text-sm text-muted-foreground">
                  Build bởi Next.js + shadcn/ui · {new Date().getFullYear()}
                </div>
              </footer>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
