import { Easing } from 'react-native-reanimated';

/** Shared motion values so every animation in the app moves the same way. */
export const motion = {
  /** Decelerating curve for things entering or settling. */
  ease: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** Accelerating curve for things leaving. */
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  fast: 160,
  base: 260,
  slow: 380,
  /** Snappy, no visible wobble: sheets, rows snapping into place. */
  spring: { damping: 26, stiffness: 260, mass: 0.9 },
  /** A touch of life: success marks, highlights. */
  bouncy: { damping: 14, stiffness: 180, mass: 0.8 },
} as const;
