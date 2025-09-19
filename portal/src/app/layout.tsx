import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MainNav } from "@/components/layout/main-nav";

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
        <div className="min-h-screen flex flex-col">
          <header className="border-b bg-card/50 backdrop-blur">
            <div className="container flex flex-col gap-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">PBX Portal</h1>
                  <p className="text-sm text-muted-foreground">Theo dõi CDR, trạng thái FreeSWITCH và ghi âm cuộc gọi</p>
                </div>
              </div>
              <MainNav />
            </div>
          </header>
          <main className="container flex-1 py-8 space-y-6">{children}</main>
          <footer className="border-t bg-card/50">
            <div className="container py-4 text-sm text-muted-foreground">
              Build bởi Next.js + shadcn/ui · {new Date().getFullYear()}
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
