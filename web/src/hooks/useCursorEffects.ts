/**
 * Cursor Effects Hook
 * Manages custom cursor, glow trails, and interactive effects
 * Follows Clean Architecture: Infrastructure layer hook
 */

import { useEffect, useRef, useState } from 'react';

interface CursorPosition {
  x: number;
  y: number;
}

interface CursorEffectsOptions {
  enableCustomCursor?: boolean;
  enableGlow?: boolean;
  enableRipple?: boolean;
  enableMagnetic?: boolean;
  enableParticles?: boolean;
  magneticStrength?: number;
}

export function useCursorEffects(options: CursorEffectsOptions = {}) {
  const {
    enableCustomCursor = true,
    enableGlow = true,
    enableRipple = true,
    enableMagnetic = false,
    enableParticles = false,
    magneticStrength = 0.3
  } = options;

  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const cursorDotRef = useRef<HTMLDivElement | null>(null);
  const cursorRingRef = useRef<HTMLDivElement | null>(null);
  const cursorGlowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPosition({ x: e.clientX, y: e.clientY });

      if (cursorDotRef.current) {
        cursorDotRef.current.style.left = `${e.clientX}px`;
        cursorDotRef.current.style.top = `${e.clientY}px`;
      }

      if (cursorRingRef.current) {
        cursorRingRef.current.style.left = `${e.clientX}px`;
        cursorRingRef.current.style.top = `${e.clientY}px`;
      }

      if (enableGlow && cursorGlowRef.current) {
        cursorGlowRef.current.style.left = `${e.clientX}px`;
        cursorGlowRef.current.style.top = `${e.clientY}px`;
      }

      if (enableParticles && Math.random() > 0.9) {
        createParticle(e.clientX, e.clientY);
      }

      if (enableMagnetic) {
        handleMagneticEffect(e);
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('cursor-interactive') ||
          target.closest('.cursor-interactive') ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'A') {
        setIsHovering(true);
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('cursor-interactive') ||
          target.closest('.cursor-interactive') ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'A') {
        setIsHovering(false);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (enableRipple) {
        const target = e.target as HTMLElement;
        const rippleElement = target.closest('.ripple');
        if (rippleElement) {
          createRipple(e, rippleElement as HTMLElement);
        }
      }
    };

    if (enableCustomCursor) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseover', handleMouseEnter);
      document.addEventListener('mouseout', handleMouseLeave);
      document.addEventListener('click', handleClick);

      document.body.style.cursor = 'none';
    }

    return () => {
      if (enableCustomCursor) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseover', handleMouseEnter);
        document.removeEventListener('mouseout', handleMouseLeave);
        document.removeEventListener('click', handleClick);

        document.body.style.cursor = 'auto';
      }
    };
  }, [enableCustomCursor, enableGlow, enableRipple, enableMagnetic, enableParticles]);

  const createRipple = (e: MouseEvent, element: HTMLElement) => {
    const ripple = document.createElement('span');
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.className = 'ripple-effect';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  };

  const createParticle = (x: number, y: number) => {
    const particle = document.createElement('div');
    particle.className = 'cursor-particle';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;

    document.body.appendChild(particle);

    setTimeout(() => {
      particle.remove();
    }, 800);
  };

  const handleMagneticEffect = (e: MouseEvent) => {
    const magneticElements = document.querySelectorAll('.magnetic');
    magneticElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;
      const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

      if (distance < 100) {
        const moveX = distanceX * magneticStrength;
        const moveY = distanceY * magneticStrength;
        (element as HTMLElement).style.setProperty('--tx', `${moveX}px`);
        (element as HTMLElement).style.setProperty('--ty', `${moveY}px`);
        element.classList.add('is-attracted');
      } else {
        (element as HTMLElement).style.setProperty('--tx', '0px');
        (element as HTMLElement).style.setProperty('--ty', '0px');
        element.classList.remove('is-attracted');
      }
    });
  };

  return {
    cursorPosition,
    isHovering,
    isClicking,
    cursorDotRef,
    cursorRingRef,
    cursorGlowRef
  };
}

export function useSpotlight() {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (spotlightRef.current) {
        spotlightRef.current.style.left = `${e.clientX}px`;
        spotlightRef.current.style.top = `${e.clientY}px`;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return spotlightRef;
}
