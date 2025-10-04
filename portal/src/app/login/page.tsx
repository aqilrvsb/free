import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

function sanitizeRedirectPath(input?: string | null): string {
  if (!input) {
    return "/";
  }
  try {
    const url = new URL(input, "https://placeholder.local");
    const path = url.pathname + url.search + url.hash;
    if (path.startsWith("/login")) {
      return "/";
    }
    return path;
  } catch {
    return input.startsWith("/") ? input : "/";
  }
}

interface LoginPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_token")?.value;
  const requestedRedirect = Array.isArray(searchParams?.next)
    ? searchParams?.next[0]
    : searchParams?.next;
  const redirectTo = sanitizeRedirectPath(requestedRedirect);

  if (token) {
    redirect(redirectTo || "/");
  }

  return (
    <div className="relative w-full max-w-lg px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(234,88,12,0.15),_transparent_45%),radial-gradient(circle_at_bottom,_rgba(17,24,39,0.7),_transparent_50%)]" />
      <Card className="relative glass-surface border border-primary/20 shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold">Đăng nhập PBX Portal</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Quản lý người dùng portal, theo dõi hệ thống FreeSWITCH và cấu hình tenant.
          </CardDescription>
        </CardHeader>
          <CardContent>
            <LoginForm redirectTo={redirectTo} />
          </CardContent>
        </Card>
      </div>
  );
}
