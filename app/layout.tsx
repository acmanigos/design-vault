import type { Metadata } from 'next';
import PwaRegister from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'Design Vault',
  description: 'An offline-first visual idea library for sermon-series concepts, prompts, options, colors, notes, and video references.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="manifest.webmanifest" />
        <link rel="icon" href="icon.svg" />
        <meta name="theme-color" content="#090909" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
