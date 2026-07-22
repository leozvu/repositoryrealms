'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPartyId,
  normalizePartyEvent,
  normalizePartyId,
  normalizePartyInvite,
  normalizePartyResponse,
  normalizePartyState,
  REALM_GATEWAY_ID,
} from '@/lib/realm-party';
import { normalizeProfile } from '@/lib/realm-protocol';

function localParty({ partyId, hostId, hostProfile, memberId, memberProfile, sessionId }) {
  return {
    id: partyId,
    hostId,
    members: [
      { id: hostId, profile: normalizeProfile(hostProfile), joinedAt: Date.now() },
      { id: memberId, profile: normalizeProfile(memberProfile), joinedAt: Date.now() },
    ],
    pendingInvites: [],
    maxMembers: 2,
    createdAt: Date.now(),
    authoritative: false,
    role: hostId === sessionId ? 'host' : 'member',
  };
}

export function useRealmParty({
  sessionId,
  profile,
  partyAuthority,
  sendParty,
  subscribeParty,
}) {
  const [party, setParty] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [outgoingInvite, setOutgoingInvite] = useState(null);
  const [notice, setNotice] = useState(null);
  const partyRef = useRef(null);
  const incomingRef = useRef(null);
  const outgoingRef = useRef(null);
  const profileRef = useRef(normalizeProfile(profile));
  const authorityRef = useRef(partyAuthority);

  useEffect(() => { profileRef.current = normalizeProfile(profile); }, [profile]);
  useEffect(() => { authorityRef.current = partyAuthority; }, [partyAuthority]);

  const commitParty = useCallback((value) => {
    const next = value ? { ...value, role: value.hostId === sessionId ? 'host' : 'member' } : null;
    partyRef.current = next;
    setParty(next);
  }, [sessionId]);

  const commitIncoming = useCallback((value) => {
    incomingRef.current = value;
    setIncomingInvite(value);
  }, []);

  const commitOutgoing = useCallback((value) => {
    outgoingRef.current = value;
    setOutgoingInvite(value);
  }, []);

  const announce = useCallback((text, tone = 'success') => {
    setNotice({ id: `${Date.now()}-${Math.random()}`, text, tone });
  }, []);

  const handleServerEvent = useCallback((payload) => {
    const event = normalizePartyEvent(payload);
    if (!event) return;
    const actorName = event.actorProfile.name;
    if (event.kind === 'party-error') {
      announce(event.message || 'Party không thể xử lý yêu cầu. Hãy thử lại.', 'error');
    } else if (event.kind === 'invite-sent') {
      announce(`Đã mời ${event.targetProfile.name} vào Party Voice`);
    } else if (event.kind === 'invite-declined') {
      announce(`${actorName} đã từ chối lời mời`, 'error');
    } else if (event.kind === 'invite-cancelled') {
      if (incomingRef.current?.partyId === event.partyId) commitIncoming(null);
      announce('Lời mời Party đã được thu hồi', 'error');
    } else if (event.kind === 'member-joined') {
      commitIncoming(null);
      announce(event.actorId === sessionId ? 'Đã tham gia Party Voice' : `${actorName} đã vào Party Voice`);
    } else if (event.kind === 'member-left') {
      announce(`${actorName} đã rời Party Voice`, 'error');
    } else if (event.kind === 'member-kicked') {
      if (event.targetId === sessionId) commitParty(null);
      announce(event.targetId === sessionId ? 'Host đã loại bạn khỏi Party' : `${event.targetProfile.name} đã bị loại khỏi Party`, 'error');
    } else if (event.kind === 'host-transferred') {
      announce(event.actorId === sessionId ? 'Bạn đã trở thành host mới' : `${actorName} đã trở thành host mới`);
    } else if (event.kind === 'party-ended') {
      commitParty(null);
      commitIncoming(null);
      announce('Party Voice đã kết thúc', 'error');
    }
  }, [announce, commitIncoming, commitParty, sessionId]);

  useEffect(() => subscribeParty(({ from, type, payload }) => {
    if (type === 'party-state' && from === REALM_GATEWAY_ID) {
      if (payload?.party === null) {
        commitParty(null);
        return;
      }
      const nextParty = normalizePartyState(payload);
      if (!nextParty) return;
      commitParty(nextParty);
      commitOutgoing(null);
      if (nextParty.members.some((member) => member.id === sessionId)) commitIncoming(null);
      return;
    }

    if (type === 'party-event' && from === REALM_GATEWAY_ID) {
      handleServerEvent(payload);
      return;
    }

    if (type === 'party-invite') {
      const inviteState = normalizePartyInvite(payload, from);
      if (!inviteState) return;
      if (!inviteState.authoritative && (partyRef.current || incomingRef.current || outgoingRef.current)) {
        sendParty('party-response', inviteState.hostId, {
          partyId: inviteState.partyId,
          accepted: false,
          memberProfile: profileRef.current,
        });
        return;
      }
      commitIncoming(inviteState);
      announce(`${inviteState.hostProfile.name} mời bạn vào Party Voice`);
      return;
    }

    if (type === 'party-response' && from !== REALM_GATEWAY_ID) {
      const response = normalizePartyResponse(payload, from);
      const pending = outgoingRef.current;
      if (!response || !pending || pending.partyId !== response.partyId || pending.targetId !== from) return;
      commitOutgoing(null);
      if (!response.accepted) {
        announce(`${pending.targetProfile.name} đã từ chối lời mời`, 'error');
        return;
      }
      commitParty(localParty({
        partyId: response.partyId,
        hostId: sessionId,
        hostProfile: profileRef.current,
        memberId: response.memberId,
        memberProfile: response.memberProfile,
        sessionId,
      }));
      announce(`${response.memberProfile.name} đã vào Party Voice`);
      return;
    }

    if (type === 'party-leave' && from !== REALM_GATEWAY_ID) {
      const partyId = normalizePartyId(payload?.partyId);
      if (!partyId) return;
      if (incomingRef.current?.partyId === partyId && incomingRef.current.hostId === from) commitIncoming(null);
      if (outgoingRef.current?.partyId === partyId && outgoingRef.current.targetId === from) commitOutgoing(null);
      if (partyRef.current?.id === partyId && partyRef.current.members.some((member) => member.id === from)) {
        commitParty(null);
        announce('Party Voice đã kết thúc', 'error');
      }
    }
  }), [announce, commitIncoming, commitOutgoing, commitParty, handleServerEvent, sendParty, sessionId, subscribeParty]);

  const invite = useCallback((person) => {
    const current = partyRef.current;
    const canInvite = !current || (current.role === 'host' && current.members.length + current.pendingInvites.length < current.maxMembers);
    if (!person?.isRemote || !canInvite || incomingRef.current || outgoingRef.current) {
      announce(current?.role === 'member' ? 'Chỉ host mới có thể mời thêm thành viên' : 'Hãy xử lý lời mời hiện tại trước', 'error');
      return false;
    }

    const partyId = current?.id || createPartyId();
    const invitation = { partyId, targetId: person.id, targetProfile: normalizeProfile(person) };
    const sent = sendParty('party-invite', person.id, {
      partyId,
      hostId: sessionId,
      hostProfile: profileRef.current,
      targetProfile: invitation.targetProfile,
    });
    if (!sent) {
      announce('Gateway chưa sẵn sàng. Hãy đợi kết nối lại rồi thử tiếp.', 'error');
      return false;
    }
    if (!authorityRef.current) commitOutgoing(invitation);
    return true;
  }, [announce, commitOutgoing, sendParty, sessionId]);

  const acceptInvite = useCallback(() => {
    const inviteState = incomingRef.current;
    if (!inviteState) return false;
    const accepted = sendParty('party-response', inviteState.hostId, {
      partyId: inviteState.partyId,
      accepted: true,
      memberProfile: profileRef.current,
    });
    if (!accepted) {
      announce('Không thể tham gia khi gateway đang mất kết nối. Hãy thử lại.', 'error');
      return false;
    }
    if (!inviteState.authoritative) {
      commitParty(localParty({
        partyId: inviteState.partyId,
        hostId: inviteState.hostId,
        hostProfile: inviteState.hostProfile,
        memberId: sessionId,
        memberProfile: profileRef.current,
        sessionId,
      }));
      announce(`Đã tham gia Party của ${inviteState.hostProfile.name}`);
    }
    commitIncoming(null);
    return true;
  }, [announce, commitIncoming, commitParty, sendParty, sessionId]);

  const declineInvite = useCallback(() => {
    const inviteState = incomingRef.current;
    if (!inviteState) return;
    sendParty('party-response', inviteState.hostId, {
      partyId: inviteState.partyId,
      accepted: false,
      memberProfile: profileRef.current,
    });
    commitIncoming(null);
    announce('Đã từ chối lời mời Party', 'error');
  }, [announce, commitIncoming, sendParty]);

  const cancelInvite = useCallback((targetId) => {
    const current = partyRef.current;
    const localPending = outgoingRef.current;
    if (current?.authoritative) {
      const inviteState = current.pendingInvites.find((item) => item.targetId === targetId);
      if (!inviteState) return;
      sendParty('party-cancel-invite', inviteState.targetId, { partyId: current.id });
      return;
    }
    if (!localPending) return;
    sendParty('party-leave', localPending.targetId, { partyId: localPending.partyId, reason: 'cancelled' });
    commitOutgoing(null);
    announce('Đã thu hồi lời mời Party', 'error');
  }, [announce, commitOutgoing, sendParty]);

  const leaveParty = useCallback(() => {
    const current = partyRef.current;
    if (!current) return false;
    if (current.authoritative) {
      const sent = sendParty(current.role === 'host' ? 'party-end' : 'party-leave', undefined, { partyId: current.id });
      if (!sent) announce('Gateway đang nối lại; chưa thể rời Party. Hãy thử lại.', 'error');
      return sent;
    }
    const peer = current.members.find((member) => member.id !== sessionId);
    if (peer) sendParty('party-leave', peer.id, { partyId: current.id, reason: current.role === 'host' ? 'ended' : 'left' });
    commitParty(null);
    announce(current.role === 'host' ? 'Đã kết thúc Party' : 'Đã rời Party Voice', 'error');
    return true;
  }, [announce, commitParty, sendParty, sessionId]);

  const kickMember = useCallback((targetId) => {
    const current = partyRef.current;
    if (!current?.authoritative || current.role !== 'host') return false;
    const sent = sendParty('party-kick', targetId, { partyId: current.id });
    if (!sent) announce('Gateway đang nối lại; chưa thể loại thành viên.', 'error');
    return sent;
  }, [announce, sendParty]);

  useEffect(() => () => {
    const current = partyRef.current;
    if (!authorityRef.current && current) {
      const peer = current.members.find((member) => member.id !== sessionId);
      if (peer) sendParty('party-leave', peer.id, { partyId: current.id, reason: 'disconnected' });
    }
  }, [sendParty, sessionId]);

  return {
    party,
    incomingInvite,
    outgoingInvite,
    notice,
    invite,
    acceptInvite,
    declineInvite,
    cancelInvite,
    leaveParty,
    kickMember,
  };
}
