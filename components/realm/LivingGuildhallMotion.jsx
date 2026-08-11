'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export default function LivingGuildhallMotion({ scopeRef, mode }) {
  useGSAP(() => {
    if (!scopeRef?.current) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const worldElements = gsap.utils.toArray('[data-living-motion]', scopeRef.current);
    const ledgerSections = gsap.utils.toArray('[data-realm-ledger-section]', scopeRef.current);

    if (reducedMotion) {
      gsap.set([...worldElements, ...ledgerSections], { clearProps: 'all' });
      return undefined;
    }

    if (mode === 'world') {
      gsap.fromTo(
        worldElements,
        { autoAlpha: 0, y: 18, scale: 0.992 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.72, stagger: 0.08, ease: 'power3.out' },
      );
    }

    if (mode === 'ledger') {
      ledgerSections.forEach((section, index) => {
        gsap.fromTo(
          section,
          { autoAlpha: 0, y: 30, rotateX: 1.5 },
          {
            autoAlpha: 1,
            y: 0,
            rotateX: 0,
            duration: 0.66,
            delay: Math.min(index * 0.035, 0.16),
            ease: 'power3.out',
            scrollTrigger: {
              trigger: section,
              start: 'top 91%',
              once: true,
            },
          },
        );
      });

      const tabs = scopeRef.current.querySelector('[data-realm-ledger-tabs]');
      if (tabs && window.matchMedia('(min-width: 901px)').matches) {
        ScrollTrigger.create({
          trigger: tabs,
          start: 'top 88px',
          endTrigger: scopeRef.current.querySelector('[data-realm-ledger-root]'),
          end: 'bottom bottom',
          pin: true,
          pinSpacing: false,
          invalidateOnRefresh: true,
        });
      }
    }

    return () => ScrollTrigger.getAll().forEach((trigger) => {
      if (scopeRef.current?.contains(trigger.trigger)) trigger.kill();
    });
  }, { scope: scopeRef, dependencies: [mode], revertOnUpdate: true });

  return null;
}
