'use client'

import type { Variants } from 'motion/react'
import { motion } from 'motion/react'

import { createAnimatedIcon } from '#/components/icons/animated-icon'

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    transition: {
      duration: 0.7,
      opacity: { duration: 0.25 },
    },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    transition: {
      duration: 0.9,
      opacity: { duration: 0.25 },
    },
  },
}

const BoxIcon = createAnimatedIcon('BoxIcon', (controls, size) => (
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
    <motion.path
      animate={controls}
      d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
      initial="normal"
      variants={PATH_VARIANTS}
    />
    <motion.path animate={controls} d="m3.3 7 8.7 5 8.7-5" initial="normal" variants={PATH_VARIANTS} />
    <motion.path animate={controls} d="M12 22V12" initial="normal" variants={PATH_VARIANTS} />
  </svg>
))

export { BoxIcon }
