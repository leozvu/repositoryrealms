import './globals.css';
import './realm-canonical-v2.css';
import { Be_Vietnam_Pro, Noto_Serif, Roboto_Mono } from 'next/font/google';
import { LanguageProvider } from '@/components/LanguageProvider';
import { deploymentBranding } from '@/lib/deployment-profile';

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

export function generateMetadata() {
  const brand = deploymentBranding();
  return {
    title: brand.kind === 'ceo-portal'
      ? 'Leoz Group — CEO Terminal'
      : 'CRMegoric ERP · CRM — Medieval Realms',
    description: brand.description,
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
