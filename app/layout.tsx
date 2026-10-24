import type { Metadata, Viewport } from 'next';
import { Archivo, Cormorant_Garamond } from 'next/font/google';
import Nav from '@/components/nav';
import './globals.css';

// Cormorant for the clubhouse's display lettering, Archivo (the game's own face) for everything else.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'], variable: '--font-cormorant' });
const body = Archivo({ subsets: ['latin'], variable: '--font-archivo' });

export const metadata: Metadata = {
  title: 'Adam Games',
  description: 'Nine Holes: a new nine-hole golf course every morning, with a streak and a handicap that follow you.',
};

// The phone's browser bar takes the baize green too.
export const viewport: Viewport = { themeColor: '#0f2219' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
