import { hasAny, isDirector, isFreelancer } from './perm.js';
import { enqueueEvent } from './event-outbox.js';

export class LeadConversionError extends Error {
  constructor(message, status = 400, code = 'lead_conversion_invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (message, status, code) => { throw new LeadConversionError(message, status, code); };

export function requireLeadConversionActor(user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user) || (user.status && user.status !== 'active') || !hasAny(user, ['AM'])) {
    fail('Chỉ Account/Sales và Giám đốc được chuyển Lead thành khách hàng.', 403, 'forbidden');
  }
}

// A lead itself is the idempotency identity: every authorized retry must return
// its existing client, regardless of browser refresh or a lost HTTP response.
export async function convertLeadToClient(db, user, leadId, now = new Date()) {
  requireLeadConversionActor(user);
  if (typeof leadId !== 'string' || !leadId.trim()) fail('Thiếu Lead cần chuyển.', 400, 'lead_required');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const lead = await tx.lead.findUnique({ where: { id: leadId } });
        if (!lead || (!isDirector(user) && lead.ownerId && lead.ownerId !== user.id)) {
          fail('Không tìm thấy Lead trong phạm vi của bạn.', 404, 'lead_not_found');
        }
        if (lead.clientId) {
          const client = await tx.client.findUnique({ where: { id: lead.clientId } });
          if (!client) fail('Liên kết khách hàng cần được kiểm tra.', 409, 'lead_client_missing');
          return { leadId: lead.id, clientId: client.id, convertedAt: lead.convertedAt, replayed: true };
        }
        if (lead.stage !== 'won') fail('Chỉ Lead đã chốt thắng mới được chuyển thành khách hàng.', 409, 'lead_not_won');
        const name = (lead.company || lead.name || '').trim();
        if (!name) fail('Bổ sung tên khách hàng trước khi chuyển.', 409, 'lead_name_required');
        const client = await tx.client.create({ data: {
          name, contact: lead.name, email: lead.email, phone: lead.phone,
          serviceLine: lead.serviceLine, note: lead.note,
          originSource: lead.source, originCampaign: lead.campaign,
          createdAt: now.toISOString().slice(0, 10),
        } });
        // The predicate also detects an owner/stage/contact/attribution edit
        // racing conversion. A failed claim rolls the new client back.
        const changed = await tx.lead.updateMany({ where: {
          id: lead.id, clientId: null, stage: 'won', ownerId: lead.ownerId,
          name: lead.name, company: lead.company, email: lead.email, phone: lead.phone,
          source: lead.source, campaign: lead.campaign, serviceLine: lead.serviceLine, note: lead.note,
        }, data: { clientId: client.id, convertedAt: now, convertedById: user.id } });
        if (changed.count !== 1) fail('Lead vừa thay đổi, đang tải lại dữ liệu.', 409, 'lead_conversion_conflict');
        await tx.auditLog.create({ data: {
          userId: user.id, userName: user.name || user.id,
          action: 'convert', entity: 'leads', refId: lead.id,
          detail: JSON.stringify({ clientId: client.id, source: lead.source, campaign: lead.campaign }),
        } });
        await enqueueEvent(tx, { resource: 'clients', event: 'create', row: client, user, occurrenceId: `lead-conversion:${lead.id}:client` }, { now });
        await enqueueEvent(tx, { resource: 'leads', event: 'update', row: { ...lead, clientId: client.id, convertedAt: now, convertedById: user.id }, old: lead, user, occurrenceId: `lead-conversion:${lead.id}:lead` }, { now });
        return { leadId: lead.id, clientId: client.id, convertedAt: now, replayed: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!['P2034', 'lead_conversion_conflict'].includes(error?.code)) throw error;
      if (attempt === 2) fail('Lead đang được cập nhật. Hãy thử lại; khách hàng đã tạo sẽ được mở lại.', 409, 'lead_conversion_conflict');
    }
  }
}
