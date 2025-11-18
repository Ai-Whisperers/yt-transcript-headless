/**
 * Scroll Effects Hook
 * Manages scroll-based animations and effects
 * Follows Clean Architecture: Infrastructure layer hook
 */

import { useEffect, useRef, useState } from 'react';

interface ScrollEffectsOptions {
  enableReveal?: boolean;
  enableParallax?: boolean;
  enableProgressBar?: boolean;
  enableStickyHeader?: boolean;
  threshold?: number;
}

export function useScrollEffects(options: ScrollEffectsOptions = {}) {
  const {
    enableReveal = true,
    enableParallax = true,
    enableProgressBar = true,
    enableStickyHeader = true,
    threshold = 0.1
  } = options;

  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (scrollTop / docHeight) * 100;

      if (enableProgressBar) {
        setScrollProgress(progress);
      }

      if (enableStickyHeader) {
        setIsScrolled(scrollTop > 50);
      }

      if (enableParallax) {
        const parallaxElements = document.querySelectorAll('[data-parallax]');
        parallaxElements.forEach((element) => {
          const speed = parseFloat(element.getAttribute('data-parallax') || '0.5');
          const yPos = -(scrollTop * speed);
          (element as HTMLElement).style.transform = `translateY(${yPos}px)`;
        });
      }
    };

    if (enableReveal) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            }
          });
        },
        { threshold }
      );

      const revealElements = document.querySelectorAll('.scroll-reveal, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-scale');
      revealElements.forEach((el) => observerRef.current?.observe(el));
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enableReveal, enableParallax, enableProgressBar, enableStickyHeader, threshold]);

  return {
    scrollProgress,
    isScrolled
  };
}

export function useScrollVelocity() {
  const [isScrollingFast, setIsScrollingFast] = useState(false);
  const lastScrollTop = useRef(0);
  const timeoutRef = useRef<number>();

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const velocity = Math.abs(scrollTop - lastScrollTop.current);

      if (velocity > 50) {
        setIsScrollingFast(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
          setIsScrollingFast(false);
        }, 150);
      }

      lastScrollTop.current = scrollTop;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return isScrollingFast;
}
