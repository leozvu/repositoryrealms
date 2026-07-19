'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useProximityMedia({
  sessionId,
  nearbyPlayers,
  mediaRef,
  screenRef,
  mediaRevision,
  iceServers = [],
  sendSignal,
  subscribeSignal,
}) {
  const peersRef = useRef(new Map());
  const allowedRef = useRef(new Set());
  const pendingSignalsRef = useRef(new Map());
  const iceKey = useMemo(() => JSON.stringify(iceServers), [iceServers]);
  const iceKeyRef = useRef(iceKey);
  const rtcConfiguration = useMemo(() => ({ iceServers }), [iceKey]);
  const [supported, setSupported] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [connectionStates, setConnectionStates] = useState({});
  const remoteIds = useMemo(
    () => nearbyPlayers.filter((person) => person.isRemote).map((person) => person.id).sort(),
    [nearbyPlayers],
  );
  const remoteKey = remoteIds.join('|');

  const updateConnectionState = useCallback((id, state) => {
    setConnectionStates((current) => current[id] === state ? current : { ...current, [id]: state });
  }, []);

  const closePeer = useCallback((id) => {
    const record = peersRef.current.get(id);
    if (!record) return;
    record.pc.ontrack = null;
    record.pc.onicecandidate = null;
    record.pc.oniceconnectionstatechange = null;
    record.pc.onnegotiationneeded = null;
    record.pc.close();
    peersRef.current.delete(id);
    setRemoteStreams((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setConnectionStates((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const outboundTracks = useCallback(() => {
    const audio = mediaRef.current?.getAudioTracks() || [];
    const screenVideo = screenRef.current?.getVideoTracks().filter((track) => track.readyState === 'live') || [];
    const cameraVideo = mediaRef.current?.getVideoTracks() || [];
    return [...audio, ...(screenVideo.length ? screenVideo : cameraVideo)];
  }, [mediaRef, screenRef]);

  const syncTracks = useCallback((record) => {
    const desired = outboundTracks();
    const desiredIds = new Set(desired.map((track) => track.id));
    for (const sender of record.pc.getSenders()) {
      if (sender.track && !desiredIds.has(sender.track.id)) record.pc.removeTrack(sender);
    }
    const existingIds = new Set(record.pc.getSenders().map((sender) => sender.track?.id).filter(Boolean));
    for (const track of desired) {
      if (!existingIds.has(track.id)) {
        const stream = track.kind === 'video' && screenRef.current?.getTrackById(track.id)
          ? screenRef.current
          : mediaRef.current;
        record.pc.addTrack(track, stream || new MediaStream([track]));
      }
    }
  }, [mediaRef, outboundTracks, screenRef]);

  const ensurePeer = useCallback((remoteId) => {
    if (peersRef.current.has(remoteId)) return peersRef.current.get(remoteId);
    if (typeof RTCPeerConnection === 'undefined') return null;

    let pc;
    try {
      pc = new RTCPeerConnection(rtcConfiguration);
    } catch {
      updateConnectionState(remoteId, 'failed');
      return null;
    }
    const record = {
      pc,
      polite: sessionId.localeCompare(remoteId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      keepAliveChannel: null,
      pendingCandidates: [],
    };
    peersRef.current.set(remoteId, record);
    updateConnectionState(remoteId, 'connecting');

    const bindKeepAlive = (channel) => {
      record.keepAliveChannel = channel;
      channel.onopen = () => updateConnectionState(remoteId, 'connected');
      channel.onclose = () => updateConnectionState(remoteId, 'disconnected');
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(remoteId, { candidate: candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const nextStream = stream || new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [remoteId]: nextStream }));
    };
    pc.onconnectionstatechange = () => {
      updateConnectionState(remoteId, pc.connectionState);
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(remoteId);
    };
    pc.oniceconnectionstatechange = () => {
      if (['connected', 'completed'].includes(pc.iceConnectionState)) updateConnectionState(remoteId, 'connected');
      if (['failed', 'disconnected'].includes(pc.iceConnectionState)) updateConnectionState(remoteId, pc.iceConnectionState);
    };
    pc.ondatachannel = (event) => {
      bindKeepAlive(event.channel);
    };
    pc.onnegotiationneeded = async () => {
      try {
        record.makingOffer = true;
        await pc.setLocalDescription();
        sendSignal(remoteId, {
          description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
        });
      } catch {
        updateConnectionState(remoteId, 'failed');
      } finally {
        record.makingOffer = false;
      }
    };
    if (sessionId.localeCompare(remoteId) < 0) {
      bindKeepAlive(pc.createDataChannel('realm-proximity'));
    }
    syncTracks(record);
    return record;
  }, [closePeer, rtcConfiguration, sendSignal, sessionId, syncTracks, updateConnectionState]);

  const handleSignal = useCallback(async ({ from, signal }) => {
    if (!signal) return;
    if (!allowedRef.current.has(from)) {
      const pending = pendingSignalsRef.current.get(from) || [];
      pending.push(signal);
      pendingSignalsRef.current.set(from, pending.slice(-16));
      return;
    }
    const record = ensurePeer(from);
    if (!record) return;
    const { pc } = record;

    try {
      if (signal.description) {
        const readyForOffer = !record.makingOffer
          && (pc.signalingState === 'stable' || record.isSettingRemoteAnswerPending);
        const offerCollision = signal.description.type === 'offer' && !readyForOffer;
        record.ignoreOffer = !record.polite && offerCollision;
        if (record.ignoreOffer) return;

        record.isSettingRemoteAnswerPending = signal.description.type === 'answer';
        await pc.setRemoteDescription(signal.description);
        record.isSettingRemoteAnswerPending = false;
        for (const candidate of record.pendingCandidates.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
        if (signal.description.type === 'offer') {
          syncTracks(record);
          await pc.setLocalDescription();
          sendSignal(from, {
            description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
          });
        }
      } else if (signal.candidate && !pc.remoteDescription) {
        record.pendingCandidates.push(signal.candidate);
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (error) {
          if (!record.ignoreOffer) throw error;
        }
      }
    } catch {
      updateConnectionState(from, 'failed');
    }
  }, [ensurePeer, sendSignal, syncTracks, updateConnectionState]);

  useEffect(() => subscribeSignal(handleSignal), [handleSignal, subscribeSignal]);

  useEffect(() => {
    const allowed = new Set(remoteIds);
    allowedRef.current = allowed;
    for (const id of peersRef.current.keys()) {
      if (!allowed.has(id)) {
        pendingSignalsRef.current.delete(id);
        closePeer(id);
      }
    }
    for (const id of allowed) {
      ensurePeer(id);
      const pending = pendingSignalsRef.current.get(id) || [];
      pendingSignalsRef.current.delete(id);
      for (const signal of pending) handleSignal({ from: id, signal });
    }
  }, [closePeer, ensurePeer, handleSignal, remoteKey]);

  useEffect(() => {
    if (iceKeyRef.current === iceKey) return;
    iceKeyRef.current = iceKey;
    for (const id of [...peersRef.current.keys()]) closePeer(id);
    for (const id of allowedRef.current) ensurePeer(id);
  }, [closePeer, ensurePeer, iceKey]);

  useEffect(() => {
    for (const record of peersRef.current.values()) syncTracks(record);
  }, [mediaRevision, syncTracks]);

  useEffect(() => () => {
    for (const record of peersRef.current.values()) record.pc.close();
    peersRef.current.clear();
    pendingSignalsRef.current.clear();
  }, []);

  useEffect(() => {
    setSupported(typeof RTCPeerConnection !== 'undefined');
  }, []);

  return {
    remoteStreams,
    connectionStates,
    supported,
  };
}
