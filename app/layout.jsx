import './globals.css';
import { Be_Vietnam_Pro, Noto_Serif, Roboto_Mono } from 'next/font/google';
import { LanguageProvider } from '@/components/LanguageProvider';

const bodyFont = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam-pro',
});

const displayFont = Noto_Serif({
  subsets: ['latin', 'vietnamese'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-noto-serif',
});

const monoFont = Roboto_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-roboto-mono',
});

export const metadata = {
  title: 'CRMegoric ERP · CRM — Medieval Realms',
  description: 'Hệ thống ERP và CRM đầy đủ với lớp trải nghiệm medieval, Realm, Quest, Gold và Tavern.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
