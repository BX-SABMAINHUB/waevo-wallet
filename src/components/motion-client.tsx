"use client";

// Re-exportamos la API pública de Motion para que los Server Components
// puedan importar animaciones a través de este único punto de entrada.
// Usamos "motion/react" (no "motion/react-client") porque este archivo
// ya es un Client Component y así evitamos el error de módulo no encontrado.
export {
  motion,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
  LazyMotion,
  useAnimate,
  useAnimation,
  useAnimationFrame,
  useAnimationControls,
  useDragControls,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTime,
  useTransform,
  useVelocity,
} from "motion/react";
