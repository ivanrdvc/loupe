'use client'

import type { Transition, Variants } from 'motion/react'
import { motion } from 'motion/react'

import { createAnimatedIcon } from '#/components/icons/animated-icon'

const DEFAULT_TRANSITION: Transition = {
  duration: 0.8,
  ease: 'easeInOut',
}

const SVG_VARIANTS: Variants = {
  normal: {
    rotate: 0,
  },
  animate: {
    rotate: [0, -10, 0],
  },
}

const MegaphoneIcon = createAnimatedIcon('MegaphoneIcon', (controls, size) => (
  <motion.svg
    animate={controls}
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    style={{ transformOrigin: 'bottom left' }}
    transition={DEFAULT_TRANSITION}
    variants={SVG_VARIANTS}
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </motion.svg>
))

export { MegaphoneIcon }
