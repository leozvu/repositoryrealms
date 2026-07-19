'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const RETRY_DELAY_MS = 15_000;
const TRACK_SOURCE = Object.freeze({
  camera: 'camera',
  microphone: 'microphone',
  screen: 'screen_share',
  screenAudio: 'screen_share_audio',
});

function errorMessage(error) {
  return typeof error?.message === 'string' ? error.message.slice(0, 160) : 'Không thể kết nối media server';
}

export function usePartySfuMedia({
  party,
  sessionId,
  mediaRef,
  screenRef,
  mediaRevision,
}) {
  const grant = party?.media?.provider === 'livekit' ? party.media : null;
  const connectionKey = grant ? `${party.id}|${grant.url}|${grant.roomName}` : '';
  const grantRef = useRef(grant);
  const roomRef = useRef(null);
  const publishedRef = useRef(new Map());
  const [status, setStatus] = useState(grant ? 'connecting' : 'idle');
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [connectionStates, setConnectionStates] = useState({});

  useEffect(() => { grantRef.current = grant; }, [grant]);
  useEffect(() => {
    setSupported(typeof RTCPeerConnection !== 'undefined' && typeof MediaStream !== 'undefined');
  }, []);

  const desiredTracks = useCallback(() => {
    const screenTracks = (screenRef.current?.getTracks() || []).filter((track) => track.readyState === 'live');
    const cameraTracks = (mediaRef.current?.getTracks() || []).filter((track) => track.readyState === 'live');
    const hasScreenVideo = screenTracks.some((track) => track.kind === 'video');
    return [
      ...cameraTracks.filter((track) => track.kind === 'audio' || !hasScreenVideo),
      ...screenTracks,
    ];
  }, [mediaRef, screenRef]);

  const syncPublishedTracks = useCallback(async (room) => {
    if (!room || room.state !== 'connected') return;
    const desired = desiredTracks();
    const desiredIds = new Set(desired.map((track) => track.id));
    for (const [trackId, track] of publishedRef.current) {
      if (!desiredIds.has(trackId)) {
        await room.localParticipant.unpublishTrack(track, false);
        publishedRef.current.delete(trackId);
      }
    }

    const screenTrackIds = new Set(screenRef.current?.getTracks().map((track) => track.id) || []);
    for (const track of desired) {
      if (publishedRef.current.has(track.id)) continue;
      const isScreen = screenTrackIds.has(track.id);
      const source = isScreen
        ? track.kind === 'audio' ? TRACK_SOURCE.screenAudio : TRACK_SOURCE.screen
        : track.kind === 'audio' ? TRACK_SOURCE.microphone : TRACK_SOURCE.camera;
      await room.localParticipant.publishTrack(track, { source });
      publishedRef.current.set(track.id, track);
    }
  }, [desiredTracks, screenRef]);

  useEffect(() => {
    if (!connectionKey || !supported) {
      setStatus(connectionKey ? 'unsupported' : 'idle');
      setError('');
      setRemoteStreams({});
      setConnectionStates({});
      return undefined;
    }

    let disposed = false;
    let retryTimer = null;
    let currentRoom = null;

    const removeParticipant = (identity) => {
      setRemoteStreams((current) => {
        if (!current[identity]) return current;
        const next = { ...current };
        delete next[identity];
        return next;
      });
      setConnectionStates((current) => {
        if (!current[identity]) return current;
        const next = { ...current };
        delete next[identity];
        return next;
      });
    };

    const addTrack = (track, participant) => {
      if (!participant?.identity || participant.identity === sessionId || !track?.mediaStreamTrack) return;
      const identity = participant.identity;
      setRemoteStreams((current) => {
        const tracks = current[identity]?.getTracks() || [];
        const stream = new MediaStream(tracks);
        if (!stream.getTrackById(track.mediaStreamTrack.id)) stream.addTrack(track.mediaStreamTrack);
        return { ...current, [identity]: stream };
      });
      setConnectionStates((current) => ({ ...current, [identity]: 'connected' }));
    };

    const removeTrack = (track, participant) => {
      const identity = participant?.identity;
      if (!identity || !track?.mediaStreamTrack) return;
      setRemoteStreams((current) => {
        const existing = current[identity];
        if (!existing) return current;
        const remaining = existing.getTracks().filter((item) => item.id !== track.mediaStreamTrack.id);
        if (!remaining.length) {
          const next = { ...current };
          delete next[identity];
          return next;
        }
        return { ...current, [identity]: new MediaStream(remaining) };
      });
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, RETRY_DELAY_MS);
    };

    const connect = async () => {
      const currentGrant = grantRef.current;
      if (disposed || !currentGrant) return;
      if (currentRoom) {
        const previousRoom = currentRoom;
        currentRoom = null;
        roomRef.current = null;
        await previousRoom.disconnect(false).catch(() => {});
      }
      publishedRef.current.clear();
      setStatus('connecting');
      setError('');

      let room = null;
      try {
        const { Room, RoomEvent } = await import('livekit-client');
        if (disposed) return;
        room = new Room({ adaptiveStream: true, dynacast: true });
        currentRoom = room;
        roomRef.current = room;
        room
          .on(RoomEvent.TrackSubscribed, addTrack)
          .on(RoomEvent.TrackUnsubscribed, removeTrack)
          .on(RoomEvent.ParticipantConnected, (participant) => {
            if (participant.identity !== sessionId) {
              setConnectionStates((current) => ({ ...current, [participant.identity]: 'connected' }));
            }
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => removeParticipant(participant.identity))
          .on(RoomEvent.Reconnecting, () => { if (!disposed) setStatus('reconnecting'); })
          .on(RoomEvent.Reconnected, () => { if (!disposed) setStatus('connected'); })
          .on(RoomEvent.Disconnected, () => {
            if (!disposed && currentRoom === room) {
              setStatus('failed');
              setError('Media server đã ngắt kết nối; đang dùng P2P fallback');
              scheduleRetry();
            }
          });
        await room.connect(currentGrant.url, currentGrant.token, { autoSubscribe: true });
        if (disposed) {
          await room.disconnect(false);
          return;
        }
        room.remoteParticipants.forEach((participant) => {
          setConnectionStates((current) => ({ ...current, [participant.identity]: 'connected' }));
          participant.trackPublications.forEach((publication) => {
            if (publication.track) addTrack(publication.track, participant);
          });
        });
        await syncPublishedTracks(room);
        setStatus('connected');
      } catch (caught) {
        if (disposed) return;
        setStatus('failed');
        setError(errorMessage(caught));
        if (room && currentRoom === room) {
          currentRoom = null;
          roomRef.current = null;
        }
        if (room) await room.disconnect(false).catch(() => {});
        scheduleRetry();
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      publishedRef.current.clear();
      roomRef.current = null;
      if (currentRoom) void currentRoom.disconnect(false).catch(() => {});
      setRemoteStreams({});
      setConnectionStates({});
    };
  }, [connectionKey, sessionId, supported, syncPublishedTracks]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== 'connected') return;
    void syncPublishedTracks(room).catch((caught) => {
      setError(errorMessage(caught));
      setStatus('failed');
      void room.disconnect(false).catch(() => {});
    });
  }, [mediaRevision, status, syncPublishedTracks]);

  return useMemo(() => ({
    remoteStreams,
    connectionStates,
    supported,
    status,
    error,
    active: status === 'connected' || status === 'reconnecting',
  }), [connectionStates, error, remoteStreams, status, supported]);
}
