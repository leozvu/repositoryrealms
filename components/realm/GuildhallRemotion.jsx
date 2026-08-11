'use client';

import { Player } from '@remotion/player';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import scene from './guildhall-shell.module.css';

const ENVIRONMENT_FRAMES = 360;
const ACTOR_FRAMES = 120;
const INTERACTION_FRAMES = 120;

const DUST_MOTES = Object.freeze([
  { x: 9, y: 70, size: 3, drift: 18, delay: 7, opacity: 0.32 },
  { x: 18, y: 55, size: 2, drift: 24, delay: 61, opacity: 0.2 },
  { x: 29, y: 77, size: 4, drift: 17, delay: 113, opacity: 0.3 },
  { x: 38, y: 48, size: 2, drift: 21, delay: 149, opacity: 0.26 },
  { x: 47, y: 70, size: 3, drift: 28, delay: 193, opacity: 0.22 },
  { x: 55, y: 43, size: 2, drift: 18, delay: 227, opacity: 0.3 },
  { x: 64, y: 74, size: 4, drift: 25, delay: 269, opacity: 0.2 },
  { x: 74, y: 55, size: 2, drift: 22, delay: 311, opacity: 0.29 },
  { x: 83, y: 66, size: 3, drift: 16, delay: 37, opacity: 0.24 },
  { x: 91, y: 42, size: 2, drift: 20, delay: 89, opacity: 0.18 },
  { x: 34, y: 31, size: 3, drift: 15, delay: 173, opacity: 0.2 },
  { x: 68, y: 29, size: 3, drift: 19, delay: 251, opacity: 0.22 },
]);

const TORCH_LIGHTS = Object.freeze([
  { x: 44.5, y: 21.5, size: 190, delay: 0 },
  { x: 55.4, y: 13.4, size: 100, delay: 13 },
  { x: 80.2, y: 31.2, size: 115, delay: 29 },
  { x: 24.9, y: 60.2, size: 95, delay: 47 },
  { x: 64.7, y: 75.6, size: 86, delay: 71 },
]);

function LivingEnvironmentComposition({ imageUrl, imageAlt, reducedMotion }) {
  const frame = useCurrentFrame();
  const motionFrame = reducedMotion ? 0 : frame;
  const lightDrift = Math.sin(motionFrame / 62) * 14;
  const moonOpacity = reducedMotion ? 0.18 : 0.16 + Math.sin(motionFrame / 48) * 0.035;

  return (
    <AbsoluteFill className={scene.remotionEnvironment}>
      <img
        className={scene.remotionEnvironmentImage}
        src={imageUrl}
        alt={imageAlt}
        draggable="false"
      />
      <AbsoluteFill className={scene.remotionMoonWash} style={{ opacity: moonOpacity }} />
      <span
        className={scene.remotionLightShaft}
        style={{ transform: `translate3d(${lightDrift}px, 0, 0) rotate(-8deg)`, opacity: 0.11 + Math.sin(motionFrame / 57) * 0.025 }}
      />
      {TORCH_LIGHTS.map((light) => {
        const flicker = reducedMotion
          ? 0.72
          : 0.68 + Math.sin((motionFrame + light.delay) * 0.31) * 0.09 + Math.sin((motionFrame + light.delay) * 0.73) * 0.04;
        const pulse = reducedMotion ? 1 : 1 + Math.sin((motionFrame + light.delay) * 0.23) * 0.06;
        return (
          <span
            key={`${light.x}-${light.y}`}
            className={scene.remotionTorchGlow}
            style={{
              left: `${light.x}%`,
              top: `${light.y}%`,
              width: light.size,
              height: light.size,
              opacity: flicker,
              transform: `translate(-50%, -50%) scale(${pulse})`,
            }}
          />
        );
      })}
      <AbsoluteFill className={scene.remotionDustField} aria-hidden="true">
        {DUST_MOTES.map((mote, index) => {
          const progress = ((motionFrame + mote.delay) % ENVIRONMENT_FRAMES) / ENVIRONMENT_FRAMES;
          const y = interpolate(progress, [0, 1], [mote.y, mote.y - mote.drift], { easing: Easing.inOut(Easing.quad) });
          const x = mote.x + Math.sin((motionFrame + mote.delay) / 37) * 1.6;
          const fade = Math.sin(progress * Math.PI) * mote.opacity;
          return (
            <span
              key={`${mote.x}-${mote.delay}-${index}`}
              style={{ left: `${x}%`, top: `${y}%`, width: mote.size, height: mote.size, opacity: reducedMotion ? mote.opacity * 0.35 : fade }}
            />
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill className={scene.remotionVignette} />
    </AbsoluteFill>
  );
}

function actorActionPose(action, frame, reducedMotion) {
  if (!action || reducedMotion) return { x: 0, y: 0, rotation: 0, scale: 1 };
  const wave = Math.sin(frame * 0.42);
  const slowWave = Math.sin(frame * 0.16);
  if (action === 'craft') {
    const strike = (frame % 20) / 20;
    return { x: wave * 1.2, y: strike < 0.2 ? 3 : -Math.sin(strike * Math.PI) * 2, rotation: strike < 0.2 ? 4 : -5, scale: 1 };
  }
  if (action === 'portal') return { x: slowWave * 1.5, y: -5 - Math.abs(slowWave) * 3, rotation: wave * 1.1, scale: 1.025 };
  if (action === 'signal') return { x: wave * 1.5, y: -Math.abs(wave) * 3, rotation: wave * 2.4, scale: 1 };
  if (action === 'salute') return { x: 0, y: -Math.abs(wave) * 1.2, rotation: wave * 0.35, scale: 1.02 };
  if (action === 'count') return { x: wave * 0.7, y: Math.abs(wave) * 1.8, rotation: wave * 1.3, scale: 0.99 };
  return { x: slowWave * 0.5, y: Math.abs(wave) * 1.2, rotation: wave * 0.7, scale: 0.995 };
}

function ActorComposition({ spriteUrl, moving, facing, player, accent, action, actionPhase, reducedMotion }) {
  const frame = useCurrentFrame();
  const motionFrame = reducedMotion ? 0 : frame;
  const activeAction = actionPhase === 'interacting' ? action : null;
  const pose = actorActionPose(activeAction, motionFrame, reducedMotion);
  const idle = Math.sin(motionFrame / 15);
  const stride = moving && !activeAction ? Math.sin(motionFrame * 0.72) : idle * 0.16;
  const bob = reducedMotion ? 0 : moving && !activeAction ? Math.abs(stride) * -7 : idle * -1.2;
  const leanDirection = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
  const lean = reducedMotion ? 0 : moving && !activeAction ? leanDirection * 2.4 + stride * 0.8 : idle * 0.25;
  const shadowScale = reducedMotion ? 1 : 1 - Math.abs(bob) * 0.018;
  const ringPulse = reducedMotion ? 1 : 0.96 + Math.sin(motionFrame / 8) * 0.035;
  const footstep = ((motionFrame % 18) / 18);
  const effectPulse = reducedMotion ? 0.7 : 0.5 + Math.sin(motionFrame * 0.32) * 0.25;

  return (
    <AbsoluteFill className={scene.actorCanvas}>
      {player && <span className={scene.actorPlayerRing} style={{ borderColor: accent, transform: `translateX(-50%) rotateX(68deg) scale(${ringPulse})` }} />}
      {moving && !activeAction && !reducedMotion && (
        <span className={scene.actorFootstep} style={{ opacity: (1 - footstep) * 0.24, transform: `translateX(-50%) rotateX(68deg) scale(${0.5 + footstep * 0.8})` }} />
      )}
      <span className={scene.actorContactShadow} style={{ transform: `translateX(-50%) scaleX(${shadowScale})`, opacity: 0.64 - Math.abs(bob) * 0.025 }} />
      {activeAction && (
        <span className={scene.actorActionEffect} data-action={activeAction} style={{ '--action-accent': accent, opacity: effectPulse }}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <span className={scene.actorBody} style={{ transform: `translate3d(calc(-50% + ${pose.x}px), ${bob + pose.y}px, 0) rotate(${lean + pose.rotation}deg) scale(${pose.scale})` }}>
        <span className={scene.actorRim} style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 36%, transparent), transparent 54%)` }} />
        <img src={spriteUrl} alt="" aria-hidden="true" draggable="false" />
      </span>
    </AbsoluteFill>
  );
}

function ObjectInteractionComposition({ accent, action, phase, reducedMotion }) {
  const frame = useCurrentFrame();
  const motionFrame = reducedMotion ? 0 : frame;
  const traveling = phase === 'traveling';
  const pulse = reducedMotion ? 1 : 0.9 + Math.sin(motionFrame * 0.24) * 0.1;
  const rotation = reducedMotion ? 0 : motionFrame * (traveling ? 0.55 : 1.15);
  const sparkProgress = (motionFrame % 36) / 36;
  return (
    <AbsoluteFill className={scene.objectInteractionCanvas} style={{ '--interaction-accent': accent }} data-action={action} data-phase={phase}>
      <span className={scene.objectInteractionGround} style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${pulse})` }} />
      <span className={scene.objectInteractionOrbit} style={{ transform: `translate(-50%, -50%) rotate(${-rotation * 0.72}deg) scale(${1.05 + (pulse - 1) * 0.7})` }} />
      <span className={scene.objectInteractionCore} style={{ opacity: traveling ? 0.5 : 0.8, transform: `translate(-50%, -50%) scale(${pulse})` }} />
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const angle = index / 6 * Math.PI * 2 + motionFrame * 0.018;
        const radius = 28 + sparkProgress * 24;
        return (
          <i
            key={index}
            className={scene.objectInteractionSpark}
            style={{
              left: `${50 + Math.cos(angle) * radius}%`,
              top: `${50 + Math.sin(angle) * radius * 0.48}%`,
              opacity: reducedMotion ? 0.42 : (1 - sparkProgress) * (traveling ? 0.34 : 0.72),
              transform: `translate(-50%, -50%) scale(${0.65 + sparkProgress})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

export function GuildhallAtmosphere({ imageUrl, imageAlt, reducedMotion }) {
  return (
    <Player
      className={scene.environmentPlayer}
      component={LivingEnvironmentComposition}
      durationInFrames={ENVIRONMENT_FRAMES}
      compositionWidth={1915}
      compositionHeight={821}
      fps={30}
      autoPlay={!reducedMotion}
      loop
      controls={false}
      numberOfSharedAudioTags={0}
      inputProps={{ imageUrl, imageAlt, reducedMotion }}
      style={{ width: '100%', height: '100%', backgroundColor: '#070b0a' }}
    />
  );
}

export function RealmActorMotion({ spriteUrl, moving, facing, player, accent, action = null, actionPhase = null, reducedMotion }) {
  return (
    <Player
      className={scene.actorPlayer}
      component={ActorComposition}
      durationInFrames={ACTOR_FRAMES}
      compositionWidth={160}
      compositionHeight={220}
      fps={30}
      autoPlay={!reducedMotion}
      loop
      controls={false}
      numberOfSharedAudioTags={0}
      inputProps={{ spriteUrl, moving, facing, player, accent, action, actionPhase, reducedMotion }}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
    />
  );
}

export function RealmObjectInteractionMotion({ accent, action, phase, reducedMotion }) {
  return (
    <Player
      className={scene.objectInteractionPlayer}
      component={ObjectInteractionComposition}
      durationInFrames={INTERACTION_FRAMES}
      compositionWidth={180}
      compositionHeight={180}
      fps={30}
      autoPlay={!reducedMotion}
      loop
      controls={false}
      numberOfSharedAudioTags={0}
      inputProps={{ accent, action, phase, reducedMotion }}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
    />
  );
}
