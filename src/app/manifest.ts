import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Neo — Command Center',
    short_name: 'Neo',
    description:
      'Self-hosted AI command center: fleet telemetry, agent pipelines, GitHub control and multi-provider chat.',
    start_url: '/command',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#04070d',
    theme_color: '#04070d',
    categories: ['productivity', 'developer', 'utilities'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
