'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createEnvelope, isRealmMessage, normalizeProfile } from '@/lib/realm-protocol';
import { normalizeRealmText, realmEmote } from '@/lib/realm-social';
import { PARTY_CLIENT_MESSAGE_TYPES, PARTY_MESSAGE_TYPES } from '@/lib/realm-party';
import {
  createBroadcastTransport,
  createGatewayTransport,
  resolveRealmGatewayUrl,
} from './realm-transports';

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `realm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRealmPresence({ positionRef, profile, status, onChat, onEmote }) {
  const [sessionId] = useState(createSessionId);
  const [remotePlayers, setRemotePlayers] = useState([]);
  const [transportState, setTransportState] = useState('connecting');
  const [networkInfo, setNetworkInfo] = useState({
    realmId: 'crmegoric-demo',
    mapId: 'castle',
    authMode: 'local',
    partyAuthority: false,
    maxPartySize: 2,
    mediaTopology: 'p2p-mesh',
    mediaServerStatus: 'disabled',
  });
  const [iceServers, setIceServers] = useState([]);
  const transportRef = useRef(null);
  const remotesRef = useRef(new Map());
  const profileRef = useRef(normalizeProfile(profile));
  const statusRef = useRef(status);
  const onChatRef = useRef(onChat);
  const onEmoteRef = useRef(onEmote);
  const signalHandlersRef = useRef(new Set());
  const partyHandlersRef = useRef(new Set());

  useEffect(() => { profileRef.current = normalizeProfile(profile); }, [profile]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { onChatRef.current = onChat; }, [onChat]);
  useEffect(() => { onEmoteRef.current = onEmote; }, [onEmote]);

  const publish = useCallback((type, payload = {}, targetId) => {
    return transportRef.current?.send(createEnvelope(type, sessionId, payload, targetId)) || false;
  }, [sessionId]);

  const publishPresence = useCallback(() => {
    const position = positionRef.current;
    publish('presence', {
      profile: profileRef.current,
      status: statusRef.current,
      x: position.x,
      y: position.y,
      zoneId: position.zoneId || null,
    });
  }, [positionRef, publish]);

  useEffect(() => {
    let cancelled = false;
    let fallbackStarted = false;

    const handleMessage = (message) => {
      if (message?.type === 'gateway-ready') {
        setNetworkInfo((current) => ({
          ...current,
          partyAuthority: message.partyAuthority === true,
          maxPartySize: Math.max(2, Math.min(Number(message.maxPartySize) || 2, 12)),
          mediaTopology: message.mediaTopology === 'sfu-livekit' ? 'sfu-livekit' : 'p2p-mesh',
          mediaServerStatus: ['up', 'down', 'checking'].includes(message.mediaServerStatus) ? message.mediaServerStatus : 'disabled',
        }));
        return;
      }
      if (!isRealmMessage(message) || message.senderId === sessionId) return;
      if (message.targetId && message.targetId !== sessionId) return;

      if (message.type === 'leave') {
        remotesRef.current.delete(message.senderId);
        setRemotePlayers([...remotesRef.current.values()]);
        return;
      }

      if (message.type === 'presence') {
        const nextProfile = normalizeProfile(message.payload?.profile);
        remotesRef.current.set(message.senderId, {
          id: message.senderId,
          userId: typeof message.payload?.identityId === 'string' ? message.payload.identityId : undefined,
          ...nextProfile,
          status: message.payload?.status || 'available',
          x: Number(message.payload?.x) || 0,
          y: Number(message.payload?.y) || 0,
          zoneId: message.payload?.zoneId || null,
          isRemote: true,
          seenAt: Date.now(),
        });
        setRemotePlayers([...remotesRef.current.values()]);
        return;
      }

      if (message.type === 'chat' || message.type === 'whisper') {
        const text = normalizeRealmText(message.payload?.text);
        if (!text) return;
        onChatRef.current?.({
          id: createSessionId(),
          senderId: message.senderId,
          name: normalizeProfile(message.payload?.profile).name,
          text,
          at: message.payload?.at || '',
          private: message.type === 'whisper',
        });
        return;
      }

      if (message.type === 'emote') {
        const emote = realmEmote(message.payload?.emoteId);
        if (!emote) return;
        onEmoteRef.current?.({
          senderId: message.senderId,
          name: normalizeProfile(message.payload?.profile).name,
          emoteId: emote.id,
          sentAt: message.sentAt,
        });
        return;
      }

      if (PARTY_MESSAGE_TYPES.includes(message.type)) {
        for (const handler of partyHandlersRef.current) {
          handler({ from: message.senderId, type: message.type, payload: message.payload });
        }
        return;
      }

      if (message.type === 'signal') {
        for (const handler of signalHandlersRef.current) {
          handler({ from: message.senderId, signal: message.payload });
        }
      }
    };

    const startLocalTransport = async () => {
      if (cancelled || fallbackStarted) return;
      fallbackStarted = true;
      const local = createBroadcastTransport({ onMessage: handleMessage });
      try {
        await local.connect();
      } catch (error) {
        fallbackStarted = false;
        throw error;
      }
      if (cancelled) return local.close();
      transportRef.current?.close();
      transportRef.current = local;
      setTransportState('local-ready');
      setNetworkInfo({
        realmId: 'crmegoric-demo',
        mapId: 'castle',
        authMode: 'local-fallback',
        partyAuthority: false,
        maxPartySize: 2,
        mediaTopology: 'p2p-mesh',
        mediaServerStatus: 'disabled',
      });
      setIceServers([]);
      publishPresence();
    };

    const start = async () => {
      const gatewayUrl = resolveRealmGatewayUrl();
      if (gatewayUrl) {
        const gateway = createGatewayTransport({
          gatewayUrl,
          sessionId,
          profile: profileRef.current,
          onMessage: handleMessage,
          onState: setTransportState,
          onToken: (tokenInfo) => {
            setNetworkInfo((current) => ({
              ...current,
              realmId: tokenInfo.realmId,
              mapId: tokenInfo.mapId,
              authMode: tokenInfo.authMode,
            }));
            setIceServers(Array.isArray(tokenInfo.iceServers) ? tokenInfo.iceServers : []);
          },
          onOpen: publishPresence,
          onExhausted: () => {
            if (cancelled) return;
            startLocalTransport().catch(() => {
              if (!cancelled) setTransportState('unsupported');
            });
          },
        });
        try {
          await gateway.connect();
          if (cancelled) return gateway.close();
          transportRef.current = gateway;
          publishPresence();
          return;
        } catch {
          gateway.close();
        }
      }

      try {
        await startLocalTransport();
      } catch {
        if (!cancelled) setTransportState('unsupported');
      }
    };

    start();
    const heartbeat = window.setInterval(() => {
      publishPresence();
      const expiry = Date.now() - 5000;
      let changed = false;
      for (const [id, person] of remotesRef.current) {
        if (person.seenAt < expiry) {
          remotesRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) setRemotePlayers([...remotesRef.current.values()]);
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      publish('leave');
      transportRef.current?.close();
      transportRef.current = null;
      remotesRef.current.clear();
    };
  }, [publish, publishPresence, sessionId]);

  useEffect(() => { publishPresence(); }, [profile, publishPresence, status]);

  const sendChat = useCallback((text, at) => {
    const nextText = normalizeRealmText(text);
    if (!nextText) return false;
    return publish('chat', { profile: profileRef.current, text: nextText, at });
  }, [publish]);

  const sendWhisper = useCallback((targetId, text, at) => {
    const nextText = normalizeRealmText(text);
    if (!targetId || !nextText) return false;
    return publish('whisper', { profile: profileRef.current, text: nextText, at }, targetId);
  }, [publish]);

  const sendEmote = useCallback((emoteId, targetId) => {
    const emote = realmEmote(emoteId);
    if (!emote) return false;
    return publish('emote', { profile: profileRef.current, emoteId: emote.id }, targetId);
  }, [publish]);

  const sendSignal = useCallback((targetId, signal) => {
    publish('signal', signal, targetId);
  }, [publish]);

  const sendParty = useCallback((type, targetId, payload = {}) => {
    if (!PARTY_CLIENT_MESSAGE_TYPES.includes(type)) return false;
    if (['party-invite', 'party-response', 'party-cancel-invite', 'party-kick'].includes(type) && !targetId) return false;
    return publish(type, payload, targetId);
  }, [publish]);

  const subscribeSignal = useCallback((handler) => {
    signalHandlersRef.current.add(handler);
    return () => signalHandlersRef.current.delete(handler);
  }, []);

  const subscribeParty = useCallback((handler) => {
    partyHandlersRef.current.add(handler);
    return () => partyHandlersRef.current.delete(handler);
  }, []);

  return {
    sessionId,
    remotePlayers,
    transportState,
    networkInfo,
    iceServers,
    sendChat,
    sendWhisper,
    sendEmote,
    sendSignal,
    sendParty,
    subscribeSignal,
    subscribeParty,
  };
}
