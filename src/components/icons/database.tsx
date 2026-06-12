'use client'

import type { Transition, Variants } from 'motion/react'
import { motion } from 'motion/react'

import { createAnimatedIcon } from '#/components/icons/animated-icon'

const MIDDLE_TRANSITION: Transition = {
  duration: 0.7,
  opacity: { duration: 0.25 },
}

const PATH_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
  },
}

const DatabaseIcon = createAnimatedIcon('DatabaseIcon', (controls, size) => (
  <svg
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <motion.path animate={controls} d="M3 12a9 3 0 0 0 18 0" transition={MIDDLE_TRANSITION} variants={PATH_VARIANTS} />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
  </svg>
))

export { DatabaseIcon }
