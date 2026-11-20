"use client";

import { useEffect, useState } from "react";
import { emitAstronautEvent, subscribeAstronautEvents } from "@/lib/astronaut-events";

const preferenceKey = "nebula-astronaut-motion";

export function resolveAstronautMotionPreference(saved: string | null, systemReducedMotion: boolean) {
  if (saved === "reduce") return true;
  if (saved === "full") return false;
  return systemReducedMotion;
}

export function setAstronautMotionReduced(enabled: boolean) {
  try {
    window.localStorage.setItem(preferenceKey, enabled ? "reduce" : "full");
  } catch (error) {
    console.warn("Astronaut motion preference could not be saved.", error);
  }
  emitAstronautEvent({ type: "USER_SET_MOTION_REDUCED", enabled });
}

export function useAstronautPerformanceManager() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(preferenceKey);
      } catch (error) {
        console.warn("Astronaut motion preference could not be read.", error);
      }
      setReducedMotion(resolveAstronautMotionPreference(saved, query.matches));
    };
    update();
    query.addEventListener("change", update);
    const unsubscribe = subscribeAstronautEvents((event) => {
      if (event.type === "USER_SET_MOTION_REDUCED") setReducedMotion(event.enabled);
    });
    return () => {
      query.removeEventListener("change", update);
      unsubscribe();
    };
  }, []);

  return reducedMotion;
}
