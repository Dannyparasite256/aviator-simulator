import type { Metadata, Viewport } from 'next';
import { TopBar } from '@/components/layout/TopBar';
import { Providers } from '@/components/layout/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aviator',
  description:
    'Crash flight game simulator with dual bets, live feed, and provably fair verification. Virtual credits only.',
  applicationName: 'Aviator Sim',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Aviator',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0c0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh bg-av-bg font-sans text-white antialiased">
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <TopBar />
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-2 pb-[calc(12px+var(--safe-bottom))] pt-2 sm:px-3 md:px-4">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
