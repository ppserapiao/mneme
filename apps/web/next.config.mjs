/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,
  async headers() {
    // Next's dev-mode hot reload (`react-refresh-utils/runtime`) uses
    // `eval()` to swap modules without a full page reload. The CSP must
    // allow `'unsafe-eval'` in dev or HMR breaks silently — code changes
    // never reach the browser. In production builds Next doesn't use
    // eval, so we keep the strict CSP there.
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'"

    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          scriptSrc,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          // Dev: HMR uses a WebSocket back to localhost; allow it.
          // Prod: same-origin only.
          isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
