export default function manifest() {
  return {
    name: 'Agency ERP',
    short_name: 'AgencyERP',
    description: 'Hệ thống quản trị agency: CRM, dự án, tài chính, nhân sự, AI',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0F172A',
    theme_color: '#2563EB',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
