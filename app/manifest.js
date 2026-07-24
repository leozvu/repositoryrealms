// v3.40: manifest theo từng deployment. CEO Terminal cài lên điện thoại phải mang tên và
// màn hình khởi động riêng (mở thẳng Tổng quan 4 công ty), không lẫn với app ERP công ty.
const IS_CEO_PORTAL = process.env.NEXT_PUBLIC_CEO_GROUP_WORKFORCE === '1';

export default function manifest() {
  if (IS_CEO_PORTAL) {
    return {
      name: 'Leoz Group — CEO Terminal',
      short_name: 'CEO Terminal',
      description: 'Trung tâm điều hành 4 công ty: số liệu hợp nhất, giao việc liên công ty, hộp thư và bản đồ vương quốc.',
      start_url: '/ceo-overview',
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
