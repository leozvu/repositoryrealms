import './globals.css';
import './realm-canonical-v2.css';
import { Be_Vietnam_Pro, Cormorant_Garamond, Roboto_Mono } from 'next/font/google';
import { LanguageProvider } from '@/components/LanguageProvider';
import { deploymentBranding } from '@/lib/deployment-profile';

const bodyFont = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam-pro',
});

const monoFont = Roboto_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-roboto-mono',
});

// Realm uses a heritage display face for landmarks and ceremonial headings only.
// Dense ERP copy, forms and tables stay in Be Vietnam Pro for fast scanning.
const realmDisplayFont = Cormorant_Garamond({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-realm-display',
});

export function generateMetadata() {
  const brand = deploymentBranding();
  return {
    title: `${brand.company} · ${brand.product}`,
    description: brand.description,
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${bodyFont.variable} ${monoFont.variable} ${realmDisplayFont.variable}`}>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
