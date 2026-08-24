'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyRealmWorkSessionAction,
  COOPERATION_MESSAGE_TYPES,
  createRealmWorkSession,
  normalizeRealmWorkSession,
  syncRealmWorkSessionMembers,
} from '@/lib/realm-cooperation';
import { normalizeProfile } from '@/lib/realm-protocol';

function eventId(prefix = 'entry') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useRealmCooperation({
  sessionId,
  profile,
  party,
  sendCooperation,
  subscribeCooperation,
}) {
  const [workSession, setWorkSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const sessionRef = useRef(null);
  const partyRef = useRef(party);
  const profileRef = useRef(normalizeProfile(profile));
  const memberSignature = useMemo(
    () => (party?.members || []).map((member) => member.id).sort().join('|'),
    [party?.members],
  );

  useEffect(() => { partyRef.current = party; }, [party]);
  useEffect(() => { profileRef.current = normalizeProfile(profile); }, [profile]);

  const commit = useCallback((value) => {
    const next = value ? normalizeRealmWorkSession(value) : null;
    sessionRef.current = next;
    setWorkSession(next);
  }, []);

  const announce = useCallback((text, tone = 'success') => {
    setNotice({ id: eventId('notice'), text, tone });
  }, []);

  const sendStateTo = useCallback((targetId, session = sessionRef.current) => {
    const currentParty = partyRef.current;
    if (!currentParty?.id || !targetId) return false;
    return sendCooperation('coop-state', targetId, {
      partyId: currentParty.id,
      session,
    });
  }, [sendCooperation]);

  const broadcastState = useCallback((session = sessionRef.current) => {
    const currentParty = partyRef.current;
    if (!currentParty?.id) return false;
    let sent = false;
    for (const member of currentParty.members || []) {
      if (member.id === sessionId) continue;
      sent = sendStateTo(member.id, session) || sent;
    }
    return sent;
  }, [sendStateTo, sessionId]);

  const applyHostAction = useCallback((actor, action) => {
    const currentParty = partyRef.current;
    const currentSession = sessionRef.current;
    if (!currentParty || currentParty.hostId !== sessionId || !currentSession) return false;
    try {
      const next = applyRealmWorkSessionAction(currentSession, actor, action, currentParty, Date.now());
      if (next?.finished) {
        for (const member of currentParty.members || []) {
          if (member.id === sessionId) continue;
          sendCooperation('coop-state', member.id, { partyId: currentParty.id, session: null });
          sendCooperation('coop-event', member.id, { partyId: currentParty.id, kind: 'finished', actorName: normalizeProfile(actor.profile).name });
        }
        commit(null);
        announce('Đã khép phiên phối hợp. Task ERP và Gold không bị thay đổi tự động.');
        return true;
      }
      commit(next);
      broadcastState(next);
      return true;
    } catch (error) {
      if (actor.id !== sessionId) {
        sendCooperation('coop-event', actor.id, {
          partyId: currentParty.id,
          kind: 'error',
          code: error.code || 'work_session_action_failed',
          message: error.message || 'Không thể cập nhật phiên phối hợp.',
        });
      } else announce(error.message || 'Không thể cập nhật phiên phối hợp.', 'error');
      return false;
    }
  }, [announce, broadcastState, commit, sendCooperation, sessionId]);

  useEffect(() => subscribeCooperation(({ from, type, payload }) => {
    if (!COOPERATION_MESSAGE_TYPES.includes(type)) return;
    const currentParty = partyRef.current;
    if (!currentParty?.id || payload?.partyId !== currentParty.id) return;
    if (!(currentParty.members || []).some((member) => member.id === from)) return;

    if (type === 'coop-sync-request') {
      if (currentParty.hostId === sessionId) sendStateTo(from);
      return;
    }
    if (type === 'coop-state') {
      if (from !== currentParty.hostId || sessionId === currentParty.hostId) return;
      if (payload.session === null) {
        commit(null);
        return;
      }
      const next = normalizeRealmWorkSession(payload.session);
      const current = sessionRef.current;
      if (!next || next.partyId !== currentParty.id || next.hostId !== from) return;
      if (!current || next.id !== current.id || next.version > current.version) commit(next);
      return;
    }
    if (type === 'coop-action') {
      if (currentParty.hostId !== sessionId) return;
      const actorMember = currentParty.members.find((member) => member.id === from);
      if (!actorMember) return;
      applyHostAction({ id: from, profile: actorMember.profile }, payload.action);
      return;
    }
    if (type === 'coop-event') {
      if (from !== currentParty.hostId) return;
      if (payload.kind === 'error') announce(payload.message || 'Phiên phối hợp không thể cập nhật.', 'error');
      else if (payload.kind === 'started') announce(`${payload.actorName || 'Facilitator'} đã mở một phiên phối hợp.`);
      else if (payload.kind === 'finished') announce(`${payload.actorName || 'Facilitator'} đã khép phiên phối hợp.`);
    }
  }), [announce, applyHostAction, commit, sendStateTo, sessionId, subscribeCooperation]);

  useEffect(() => {
    if (!party?.id) {
      commit(null);
      return;
    }
    if (party.hostId === sessionId) {
      if (!sessionRef.current) return;
      const next = syncRealmWorkSessionMembers(sessionRef.current, party, Date.now());
      if (!next) {
        broadcastState(null);
        commit(null);
        return;
      }
      if (next.version !== sessionRef.current.version) {
        commit(next);
        broadcastState(next);
      }
      return;
    }
    sendCooperation('coop-sync-request', party.hostId, { partyId: party.id });
  }, [broadcastState, commit, memberSignature, party?.hostId, party?.id, sendCooperation, sessionId]);

  const startSession = useCallback(({ work, anchor, agenda }) => {
    const currentParty = partyRef.current;
    if (!currentParty || currentParty.hostId !== sessionId) {
      announce('Chỉ host của Party mới có thể mở phiên phối hợp.', 'error');
      return false;
    }
    try {
      const next = createRealmWorkSession({ party: currentParty, hostId: sessionId, work, anchor, agenda }, Date.now());
      commit(next);
      broadcastState(next);
      for (const member of currentParty.members || []) {
        if (member.id !== sessionId) sendCooperation('coop-event', member.id, { partyId: currentParty.id, kind: 'started', actorName: profileRef.current.name });
      }
      announce(`Đã mở phiên phối hợp cho “${next.work.title}”.`);
      return true;
    } catch (error) {
      announce(error.message || 'Không thể mở phiên phối hợp.', 'error');
      return false;
    }
  }, [announce, broadcastState, commit, sendCooperation, sessionId]);

  const dispatch = useCallback((type, payload = {}) => {
    const currentParty = partyRef.current;
    const currentSession = sessionRef.current;
    if (!currentParty || !currentSession) return false;
    const action = { type, sessionId: currentSession.id, payload };
    if (currentParty.hostId === sessionId) {
      return applyHostAction({ id: sessionId, profile: profileRef.current }, action);
    }
    return sendCooperation('coop-action', currentParty.hostId, { partyId: currentParty.id, action });
  }, [applyHostAction, sendCooperation, sessionId]);

  return {
    workSession,
    notice,
    startSession,
    setReady: (ready) => dispatch('set-ready', { ready: ready === true }),
    setPhase: (phase) => dispatch('set-phase', { phase }),
    toggleAgenda: (itemId) => dispatch('toggle-agenda', { itemId }),
    addNote: (kind, text) => dispatch('add-note', { id: eventId('entry'), kind, text }),
    setAnchor: (anchor) => dispatch('set-anchor', { anchor }),
    finishSession: () => dispatch('finish'),
  };
}
