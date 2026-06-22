// Root layout (Server Component): metadata, viewport, fonts, and app chrome
// (editorial header with wordmark + green accent, distinct from MiniPay; footer
// with nav + legal). Mirrors the Celiq app's editorial design language.
import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { APP_NAME, APP_TAGLINE, copy } from "@/lib/copy";
import { SupportLink } from "@/components/SupportLink";

// Serif display for headlines / article titles / wordmark.
const newsreader = Newsreader({
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-newsreader-var",
  subsets: ["latin"],
  display: "swap",
});

// Sans for body / UI text.
const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans-var",
  subsets: ["latin"],
  display: "swap",
});

// Mono for numbers / prices / addresses (tabular-nums via .num).
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono-var",
  subsets: ["latin"],
  display: "swap",
});

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
  themeColor: "#00B27A",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="font-plex-sans relative mx-auto flex min-h-full max-w-md flex-col bg-warm text-ink antialiased">
        {/* Faint editorial watermark — a single large serif "C" sitting behind all
            content. Static (no animation), non-interactive, and excluded from
            layout/scroll/tap targets so it can never affect the MiniPay UX. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 flex select-none items-center justify-center overflow-hidden"
        >
          <span className="font-newsreader text-[58vw] font-extrabold leading-none tracking-[-0.04em] text-ink opacity-[0.025]">
            C
          </span>
        </div>

        {/* App ownership: serif wordmark + green accent, clearly distinct from MiniPay. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b-[0.5px] border-rule bg-warm/92 px-4 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <Image
              src="/miniceliq_icon.svg"
              alt={`${APP_NAME} logo`}
              width={26}
              height={26}
              priority
              className="rounded-[7px]"
            />
            <span className="font-newsreader text-[19px] font-extrabold tracking-[-0.02em] text-ink">
              MiniCeliq<span className="text-accent">.</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-[13.5px]">
            <Link
              href="/"
              className="font-medium text-ink-2 no-underline transition-colors duration-[120ms] hover:text-accent"
            >
              {copy.nav.feed}
            </Link>
            <Link
              href="/stats"
              className="font-medium text-ink-2 no-underline transition-colors duration-[120ms] hover:text-accent"
            >
              {copy.nav.stats}
            </Link>
            <SupportLink />
          </nav>
        </header>

        <main className="relative z-10 flex-1">{children}</main>

        <footer className="relative z-10 border-t-[0.5px] border-rule px-4 pb-6 pt-8">
          <div className="font-newsreader text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            MiniCeliq<span className="text-accent">.</span>
          </div>
          <div className="font-newsreader mt-1 text-[14px] italic text-ink-muted">
            {APP_TAGLINE}
          </div>

          <div className="mt-5 flex items-center gap-4 border-t-[0.5px] border-rule pt-4 text-[12px]">
            <Link
              href="/terms"
              className="text-ink-2 no-underline transition-colors hover:text-accent"
            >
              {copy.legal.terms}
            </Link>
            <Link
              href="/privacy"
              className="text-ink-2 no-underline transition-colors hover:text-accent"
            >
              {copy.legal.privacy}
            </Link>
            <SupportLink className="text-ink-2 no-underline transition-colors hover:text-accent" />
          </div>

          <p className="mt-4 text-[11px] leading-[1.5] text-ink-muted">
            {APP_NAME} is an independent app, not operated by MiniPay.
          </p>
        </footer>
      </body>
    </html>
  );
}
