import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker } from '@/components/hud/RegisterServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Neo — Command Center',
  description:
    'Self-hosted AI command center: 3D fleet view, multi-provider chat, agent pipelines, GitHub control and live device telemetry.',
  applicationName: 'Neo',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Neo', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#04070d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-void text-chrome antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
