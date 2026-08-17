// Canonical company topology. Egolive is an operating department of Egoric,
// not a separate company/tenant. The alias is intentionally retained so old
// links, receipts and migration artifacts can still resolve to their owner.
export const COMPANY_TOPOLOGY = Object.freeze([
  Object.freeze({ id: 'aim', name: 'AIm Agency', departments: Object.freeze([]) }),
  Object.freeze({
    id: 'egoric',
    name: 'Egoric Agency',
    departments: Object.freeze([
      Object.freeze({
        id: 'egolive',
        name: 'Egolive',
        label: 'Phòng Livestream Egolive',
        module: 'livestream',
        legacyEntityId: 'egolive',
      }),
    ]),
  }),
  Object.freeze({ id: 'vnecom', name: 'Vnecom LLC', departments: Object.freeze([]) }),
]);

const COMPANY_ALIASES = Object.freeze({ egolive: 'egoric' });

export function canonicalCompanyId(value) {
  const id = String(value || '').trim().toLowerCase();
  return COMPANY_ALIASES[id] || id;
}

export function departmentsForCompany(value) {
  const id = canonicalCompanyId(value);
  return COMPANY_TOPOLOGY.find((company) => company.id === id)?.departments || [];
}

export function departmentById(value) {
  const id = String(value || '').trim().toLowerCase();
  return COMPANY_TOPOLOGY.flatMap((company) => company.departments)
    .find((department) => department.id === id) || null;
}
