'use client'

import type { Variants } from 'motion/react'
import { motion } from 'motion/react'

import { createAnimatedIcon } from '#/components/icons/animated-icon'

const PATH_VARIANTS: Variants = {
  normal: {
    x: 0,
    rotate: 0,
  },
  animate: {
    x: [0, -1, 2, 0],
    rotate: [0, -10, 0, 0],
    transition: {
      duration: 1.1,
      times: [0, 0.2, 0.5, 1],
      stiffness: 110,
      damping: 13,
    },
  },
}

const PlayIcon = createAnimatedIcon('PlayIcon', (controls, size) => (
  <motion.svg
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
    <motion.polygon animate={controls} points="6 3 20 12 6 21 6 3" variants={PATH_VARIANTS} />
  </motion.svg>
))

export { PlayIcon }
