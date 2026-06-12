'use client'

import type { Transition, Variants } from 'motion/react'
import { motion } from 'motion/react'

import { createAnimatedIcon } from '#/components/icons/animated-icon'

const LIQUID_TRANSITION: Transition = {
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

const TestTubeIcon = createAnimatedIcon('TestTubeIcon', (controls, size) => (
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
    <path d="M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2" />
    <path d="M8.5 2h7" />
    <motion.path animate={controls} d="M14.5 16h-5" transition={LIQUID_TRANSITION} variants={PATH_VARIANTS} />
  </svg>
))

export { TestTubeIcon }
