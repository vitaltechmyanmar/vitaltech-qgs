import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based CSP. This middleware deliberately does NOT authorize: auth checks
 * live next to the data (server components/actions) so they never depend on the
 * edge runtime. Here we only add a per-request nonce and the policy header.
 */
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV !== "production";
  const isHttps = (process.env.APP_URL ?? process.env.AUTH_URL ?? "").startsWith(
    "https://",
  );

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only. API routes set their own response headers; static assets and
    // fonts do not need a policy and would only add noise.
    "/((?!api|_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
