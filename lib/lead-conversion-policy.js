import { pickRecordFields, scalarRecordError } from './record-write-policy.js';

const CLIENT_FIELDS = ['name', 'contact', 'email', 'phone', 'industry', 'serviceLine', 'address', 'note', 'createdAt'];
const LEAD_FIELDS = ['name', 'company', 'email', 'phone', 'source', 'value', 'stage', 'ownerId', 'note', 'createdAt', 'expectedClose', 'campaign', 'region', 'serviceLine'];

// Conversion lineage and attribution snapshots belong to the command. Deny
// nested Prisma relation operators as well as scalar attempts to forge links.
export const clientBusinessData = data => pickRecordFields(data, CLIENT_FIELDS);
export const leadBusinessData = data => pickRecordFields(data, LEAD_FIELDS);
export const validateCrmBusinessData = (_row, data) => scalarRecordError(data);
