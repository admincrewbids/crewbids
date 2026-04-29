import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_FILE = /\.[^/]+$/;

function shouldBypassMaintenance(pathname: string) {
  return (
    pathname === "/maintenance" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const maintenanceEnabled =
    process.env.MAINTENANCE_MODE === "true";

  if (!maintenanceEnabled) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (shouldBypassMaintenance(pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/:path*"],
};
