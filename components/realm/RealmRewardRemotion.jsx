'use client';

import { Player } from '@remotion/player';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import styles from './realm-world-v3.module.css';

const FPS = 30;
const DURATION = 72;
const COINS = Object.freeze(Array.from({ length: 14 }, (_, index) => ({
  angle: (Math.PI * 2 * index) / 14 + (index % 2) * .14,
  distance: 78 + (index % 5) * 18,
  delay: index % 4,
  size: 8 + (index % 3) * 3,
})));

function RewardComposition({ amount = 0, reducedMotion = false }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = reducedMotion ? 1 : spring({ frame, fps, config: { damping: 15, stiffness: 125, mass: .72 } });
  const settle = reducedMotion ? 1 : spring({ frame: Math.max(0, frame - 17), fps, config: { damping: 18, stiffness: 95 } });
  const fade = interpolate(frame, [0, 8, DURATION - 16, DURATION - 1], [0, 1, 1, 0], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringScale = .45 + reveal * .72;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: fade, overflow: 'hidden' }}>
      <div className={styles.rewardHalo} style={{ transform: `translate(-50%, -50%) scale(${ringScale})`, opacity: .2 + reveal * .6 }} />
      <div className={styles.rewardRune} style={{ transform: `translate(-50%, -50%) rotate(${frame * (reducedMotion ? 0 : .85)}deg) scale(${.7 + settle * .3})` }} />
      {COINS.map((coin, index) => {
        const progress = reducedMotion ? 1 : spring({ frame: Math.max(0, frame - coin.delay), fps, config: { damping: 13, stiffness: 105, mass: .55 } });
        const exit = interpolate(frame, [DURATION - 20, DURATION - 1], [1, .18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const x = Math.cos(coin.angle) * coin.distance * progress;
        const y = Math.sin(coin.angle) * coin.distance * .55 * progress - Math.sin(progress * Math.PI) * 24;
        return (
          <span
            className={styles.rewardSpark}
            key={index}
            style={{
              width: coin.size,
              height: coin.size,
              opacity: progress * exit,
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${frame * (index % 2 ? 9 : -11)}deg) scale(${.5 + progress * .6})`,
            }}
          />
        );
      })}
      <div className={styles.rewardAmountEcho} style={{ opacity: settle * .18, transform: `translate(-50%, -50%) scale(${1 + settle * .32})` }}>+{amount}</div>
    </AbsoluteFill>
  );
}

export default function RealmRewardRemotion({ amount, reducedMotion = false }) {
  return (
    <Player
      className={styles.rewardSequence}
      component={RewardComposition}
      durationInFrames={DURATION}
      compositionWidth={420}
      compositionHeight={220}
      fps={FPS}
      autoPlay={!reducedMotion}
      loop={false}
      controls={false}
      initiallyMuted
      numberOfSharedAudioTags={0}
      acknowledgeRemotionLicense
      inputProps={{ amount, reducedMotion }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', backgroundColor: 'transparent', pointerEvents: 'none' }}
    />
  );
}
