import {
  createPartyId,
  DEFAULT_MAX_PARTY_SIZE,
  normalizePartyClientId,
  normalizePartyId,
} from './realm-party.js';
import { normalizeProfile } from './realm-protocol.js';

const keyFor = (roomKey, clientId) => `${roomKey}\u0000${clientId}`;
const delivery = (targetId, type, payload) => ({ targetId, type, payload });

export class RealmPartyDirectory {
  constructor({ maxPartySize = DEFAULT_MAX_PARTY_SIZE, now = () => Date.now(), makePartyId = createPartyId } = {}) {
    this.maxPartySize = Math.max(2, Math.min(Math.round(Number(maxPartySize) || DEFAULT_MAX_PARTY_SIZE), 12));
    this.now = now;
    this.makePartyId = makePartyId;
    this.parties = new Map();
    this.memberships = new Map();
    this.invitations = new Map();
  }

  get size() {
    return this.parties.size;
  }

  partyFor(roomKey, clientId) {
    const partyId = this.memberships.get(keyFor(roomKey, clientId));
    return partyId ? this.parties.get(partyId) || null : null;
  }

  invitationFor(roomKey, clientId) {
    const partyId = this.invitations.get(keyFor(roomKey, clientId));
    const party = partyId ? this.parties.get(partyId) : null;
    return party?.invites.get(clientId) ? { party, invite: party.invites.get(clientId) } : null;
  }

  error(targetId, code, message, partyId = '') {
    return [delivery(targetId, 'party-event', {
      kind: 'party-error',
      partyId,
      code,
      message,
    })];
  }

  serializeParty(party, viewerId) {
    return {
      id: party.id,
      hostId: party.hostId,
      maxMembers: party.maxMembers,
      createdAt: party.createdAt,
      authoritative: true,
      members: [...party.members.values()].map((member) => ({ ...member })),
      pendingInvites: viewerId === party.hostId
        ? [...party.invites.values()].map((invite) => ({ ...invite }))
        : [],
    };
  }

  stateDeliveries(party) {
    return [...party.members.keys()].map((memberId) => delivery(memberId, 'party-state', {
      party: this.serializeParty(party, memberId),
      authoritative: true,
    }));
  }

  invitePayload(party) {
    const host = party.members.get(party.hostId);
    return {
      partyId: party.id,
      hostId: party.hostId,
      hostProfile: host.profile,
      memberCount: party.members.size,
      maxMembers: party.maxMembers,
      authoritative: true,
    };
  }

  invite({ roomKey, senderId, senderProfile, targetId, targetProfile, targetConnected = true }) {
    const hostId = normalizePartyClientId(senderId);
    const invitedId = normalizePartyClientId(targetId);
    if (!hostId || !invitedId || hostId === invitedId) {
      return this.error(senderId, 'invalid-target', 'Không thể mời người chơi này vào Party.');
    }
    if (!targetConnected) return this.error(hostId, 'target-offline', 'Người chơi vừa rời Realm. Hãy chọn người đang online.');

    let party = this.partyFor(roomKey, hostId);
    if (party && party.hostId !== hostId) {
      return this.error(hostId, 'host-only', 'Chỉ host của Party mới có thể mời thêm thành viên.', party.id);
    }
    if (this.partyFor(roomKey, invitedId)) {
      return this.error(hostId, 'target-busy', 'Người chơi đang ở một Party khác.', party?.id);
    }
    if (this.invitationFor(roomKey, invitedId)) {
      return this.error(hostId, 'target-invited', 'Người chơi đang xử lý một lời mời Party khác.', party?.id);
    }

    if (!party) {
      const id = normalizePartyId(this.makePartyId());
      if (!id) return this.error(hostId, 'party-id-failed', 'Không thể tạo Party lúc này. Hãy thử lại.');
      party = {
        id,
        roomKey,
        hostId,
        maxMembers: this.maxPartySize,
        createdAt: this.now(),
        members: new Map(),
        invites: new Map(),
      };
      party.members.set(hostId, {
        id: hostId,
        profile: normalizeProfile(senderProfile),
        joinedAt: party.createdAt,
      });
      this.parties.set(party.id, party);
      this.memberships.set(keyFor(roomKey, hostId), party.id);
    }

    if (party.members.size + party.invites.size >= party.maxMembers) {
      return this.error(hostId, 'party-full', `Party đã đạt giới hạn ${party.maxMembers} người hoặc lời mời đang chờ.`, party.id);
    }

    const invite = {
      targetId: invitedId,
      targetProfile: normalizeProfile(targetProfile),
      invitedAt: this.now(),
    };
    party.invites.set(invitedId, invite);
    this.invitations.set(keyFor(roomKey, invitedId), party.id);

    return [
      ...this.stateDeliveries(party),
      delivery(invitedId, 'party-invite', this.invitePayload(party)),
      delivery(hostId, 'party-event', {
        kind: 'invite-sent',
        partyId: party.id,
        targetId: invitedId,
        targetProfile: invite.targetProfile,
      }),
    ];
  }

  respond({ roomKey, senderId, senderProfile, partyId, accepted }) {
    const memberId = normalizePartyClientId(senderId);
    const id = normalizePartyId(partyId);
    const pending = this.invitationFor(roomKey, memberId);
    if (!memberId || !id || !pending || pending.party.id !== id) {
      return this.error(senderId, 'invite-expired', 'Lời mời Party đã hết hiệu lực.', id);
    }

    const { party } = pending;
    party.invites.delete(memberId);
    this.invitations.delete(keyFor(roomKey, memberId));
    if (accepted !== true) {
      return [
        ...this.stateDeliveries(party),
        delivery(party.hostId, 'party-event', {
          kind: 'invite-declined',
          partyId: party.id,
          actorId: memberId,
          actorProfile: normalizeProfile(senderProfile),
        }),
      ];
    }

    if (party.members.size >= party.maxMembers || this.partyFor(roomKey, memberId)) {
      return [
        ...this.stateDeliveries(party),
        ...this.error(memberId, 'party-full', 'Party không còn chỗ trống. Hãy xin lời mời mới.', party.id),
      ];
    }

    const member = {
      id: memberId,
      profile: normalizeProfile(senderProfile),
      joinedAt: this.now(),
    };
    party.members.set(memberId, member);
    this.memberships.set(keyFor(roomKey, memberId), party.id);
    return [
      ...this.stateDeliveries(party),
      ...[...party.members.keys()].map((targetId) => delivery(targetId, 'party-event', {
        kind: 'member-joined',
        partyId: party.id,
        actorId: memberId,
        actorProfile: member.profile,
      })),
    ];
  }

  cancelInvite({ roomKey, senderId, partyId, targetId }) {
    const hostId = normalizePartyClientId(senderId);
    const invitedId = normalizePartyClientId(targetId);
    const party = this.partyFor(roomKey, hostId);
    if (!party || party.id !== normalizePartyId(partyId) || party.hostId !== hostId) {
      return this.error(senderId, 'host-only', 'Chỉ host mới có thể thu hồi lời mời.', party?.id);
    }
    const invite = party.invites.get(invitedId);
    if (!invite) return this.error(hostId, 'invite-expired', 'Lời mời này không còn hiệu lực.', party.id);
    party.invites.delete(invitedId);
    this.invitations.delete(keyFor(roomKey, invitedId));
    return [
      ...this.stateDeliveries(party),
      delivery(invitedId, 'party-event', {
        kind: 'invite-cancelled',
        partyId: party.id,
        actorId: hostId,
        actorProfile: party.members.get(hostId).profile,
      }),
    ];
  }

  leave({ roomKey, senderId, disconnected = false }) {
    const memberId = normalizePartyClientId(senderId);
    const party = this.partyFor(roomKey, memberId);
    if (!party) return disconnected ? [] : this.error(senderId, 'not-in-party', 'Bạn không còn ở trong Party nào.');
    const leavingMember = party.members.get(memberId);

    party.members.delete(memberId);
    this.memberships.delete(keyFor(roomKey, memberId));
    if (!party.members.size) return this.destroyParty(party, memberId, disconnected ? 'host-disconnected' : 'host-left');

    const deliveries = [delivery(memberId, 'party-state', { party: null, authoritative: true })];
    if (party.hostId === memberId) {
      const nextHost = [...party.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      party.hostId = nextHost.id;
      for (const invite of party.invites.values()) {
        this.invitations.delete(keyFor(roomKey, invite.targetId));
        deliveries.push(delivery(invite.targetId, 'party-event', {
          kind: 'invite-cancelled',
          partyId: party.id,
          actorId: memberId,
          actorProfile: leavingMember.profile,
        }));
      }
      party.invites.clear();
      deliveries.push(...this.stateDeliveries(party));
      deliveries.push(...[...party.members.keys()].map((targetId) => delivery(targetId, 'party-event', {
        kind: 'host-transferred',
        partyId: party.id,
        actorId: nextHost.id,
        actorProfile: nextHost.profile,
      })));
      return deliveries;
    }

    deliveries.push(...this.stateDeliveries(party));
    deliveries.push(...[...party.members.keys()].map((targetId) => delivery(targetId, 'party-event', {
      kind: 'member-left',
      partyId: party.id,
      actorId: memberId,
      actorProfile: leavingMember.profile,
      code: disconnected ? 'disconnected' : 'left',
    })));
    return deliveries;
  }

  end({ roomKey, senderId }) {
    const hostId = normalizePartyClientId(senderId);
    const party = this.partyFor(roomKey, hostId);
    if (!party || party.hostId !== hostId) return this.error(senderId, 'host-only', 'Chỉ host mới có thể kết thúc Party.', party?.id);
    return this.destroyParty(party, hostId, 'ended');
  }

  kick({ roomKey, senderId, targetId }) {
    const hostId = normalizePartyClientId(senderId);
    const memberId = normalizePartyClientId(targetId);
    const party = this.partyFor(roomKey, hostId);
    if (!party || party.hostId !== hostId) return this.error(senderId, 'host-only', 'Chỉ host mới có thể loại thành viên.', party?.id);
    if (!memberId || memberId === hostId || !party.members.has(memberId)) {
      return this.error(hostId, 'invalid-member', 'Thành viên này không còn trong Party.', party.id);
    }
    const member = party.members.get(memberId);
    party.members.delete(memberId);
    this.memberships.delete(keyFor(roomKey, memberId));
    return [
      delivery(memberId, 'party-state', { party: null, authoritative: true }),
      delivery(memberId, 'party-event', {
        kind: 'member-kicked',
        partyId: party.id,
        actorId: hostId,
        targetId: memberId,
        targetProfile: member.profile,
      }),
      ...this.stateDeliveries(party),
      ...[...party.members.keys()].map((targetId) => delivery(targetId, 'party-event', {
        kind: 'member-left',
        partyId: party.id,
        actorId: memberId,
        actorProfile: member.profile,
        code: 'kicked',
      })),
    ];
  }

  destroyParty(party, actorId, code) {
    const actor = party.members.get(actorId);
    const deliveries = [];
    for (const member of party.members.values()) {
      this.memberships.delete(keyFor(party.roomKey, member.id));
      deliveries.push(delivery(member.id, 'party-state', { party: null, authoritative: true }));
      deliveries.push(delivery(member.id, 'party-event', {
        kind: 'party-ended',
        partyId: party.id,
        actorId,
        actorProfile: actor?.profile,
        code,
      }));
    }
    for (const invite of party.invites.values()) {
      this.invitations.delete(keyFor(party.roomKey, invite.targetId));
      deliveries.push(delivery(invite.targetId, 'party-event', {
        kind: 'invite-cancelled',
        partyId: party.id,
        actorId,
        actorProfile: actor?.profile,
      }));
    }
    this.parties.delete(party.id);
    return deliveries;
  }

  disconnect(roomKey, clientId) {
    const pending = this.invitationFor(roomKey, clientId);
    const deliveries = [];
    if (pending) {
      pending.party.invites.delete(clientId);
      this.invitations.delete(keyFor(roomKey, clientId));
      deliveries.push(...this.stateDeliveries(pending.party));
    }
    deliveries.push(...this.leave({ roomKey, senderId: clientId, disconnected: true }));
    return deliveries;
  }

  sync(roomKey, clientId) {
    const party = this.partyFor(roomKey, clientId);
    if (party) return [delivery(clientId, 'party-state', { party: this.serializeParty(party, clientId), authoritative: true })];
    const pending = this.invitationFor(roomKey, clientId);
    if (pending) return [delivery(clientId, 'party-invite', this.invitePayload(pending.party))];
    return [];
  }
}
