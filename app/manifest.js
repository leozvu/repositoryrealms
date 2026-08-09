import { deploymentBranding, isCeoPortalDeployment } from '@/lib/deployment-profile';

export default function manifest() {
  const brand = deploymentBranding();
  return {
    name: isCeoPortalDeployment() ? `${brand.company} — ${brand.product}` : `${brand.company} · ${brand.product}`,
    short_name: brand.shortName,
    description: brand.description,
    start_url: brand.homePath,
    display: 'standalone',
    background_color: '#F4F6F8',
    theme_color: isCeoPortalDeployment() ? '#102219' : '#1D4ED8',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
