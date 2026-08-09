import { deploymentBranding, isCeoPortalDeployment } from '@/lib/deployment-profile';

export default function manifest() {
  const brand = deploymentBranding();
  if (isCeoPortalDeployment()) {
    return {
      name: `${brand.company} — ${brand.product}`,
      short_name: brand.shortName,
      description: brand.description,
      start_url: brand.homePath,
      display: 'standalone',
      background_color: '#F4F0E7',
      theme_color: '#102219',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    };
  }
  return {
    name: 'CRMegoric ERP · CRM — Realms',
    short_name: 'CRMegoric',
    description: 'ERP và CRM đầy đủ với lớp trải nghiệm medieval, Realm, Quest, Gold và Tavern.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F4F0E7',
    theme_color: '#102219',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
