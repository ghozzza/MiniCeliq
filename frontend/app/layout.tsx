// Root layout (Server Component): metadata, viewport, and app chrome
// (header with app name + logo distinct from MiniPay; footer with nav + legal).
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { APP_NAME, APP_TAGLINE, copy } from "@/lib/copy";
import { SupportLink } from "@/components/SupportLink";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description:
    "Subscribe to curated stablecoin and macro news with AI summaries, paid in stablecoins inside MiniPay.",
  applicationName: APP_NAME,
};

// Mobile-first viewport. MiniPay target is 360×640.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="mx-auto flex min-h-full max-w-md flex-col bg-white antialiased">
        {/* App ownership: name + logo clearly distinct from MiniPay's branding. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt={`${APP_NAME} logo`}
              width={28}
              height={28}
              priority
            />
            <span className="text-base font-bold tracking-tight text-gray-900">
              {APP_NAME}
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              {copy.nav.feed}
            </Link>
            <Link href="/stats" className="text-gray-600 hover:text-gray-900">
              {copy.nav.stats}
            </Link>
            <SupportLink />
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-gray-100 px-4 py-4 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-gray-600">
              {copy.legal.terms}
            </Link>
            <Link href="/privacy" className="hover:text-gray-600">
              {copy.legal.privacy}
            </Link>
            <SupportLink className="hover:text-gray-600" />
          </div>
          <p className="mt-2">
            {APP_NAME} is an independent app, not operated by MiniPay.
          </p>
        </footer>
      </body>
    </html>
  );
}
