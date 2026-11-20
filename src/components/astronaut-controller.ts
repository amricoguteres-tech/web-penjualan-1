"use client";

import { useEffect, useRef, useState } from "react";
import {
  emitAstronautEvent,
  getAstronautReaction,
  subscribeAstronautEvents,
  type AstronautClickInteraction,
  type AstronautEvent,
  type AstronautGesture,
  type AstronautPersonality,
} from "@/lib/astronaut-events";

const idleSequence: Array<{ gesture: AstronautGesture; personality: AstronautPersonality }> = [
  { gesture: "Idle_Floating", personality: "Curious" },
  { gesture: "Idle_Looking_Around", personality: "Curious" },
  { gesture: "Idle_Checking_Device", personality: "Thinking" },
  { gesture: "Idle_Floating", personality: "Friendly" },
];

const clickSequence: AstronautClickInteraction[] = ["greeting", "wave", "thumbs-up", "surprise"];

type ActiveReaction = {
  priority: number;
  until: number;
};

export function useAstronautController(reducedMotion: boolean) {
  const [gesture, setGesture] = useState<AstronautGesture>("Idle_Floating");
  const [personality, setPersonality] = useState<AstronautPersonality>("Curious");
  const [section, setSection] = useState("home");
  const [hovered, setHovered] = useState(false);
  const active = useRef<ActiveReaction>({ priority: 1, until: 0 });
  const clickIndex = useRef(0);

  useEffect(() => subscribeAstronautEvents((event: AstronautEvent) => {
    if (event.type === "SECTION_CHANGED") setSection(event.section);
    if (event.type === "USER_SET_MOTION_REDUCED") return;

    const reaction = getAstronautReaction(event);
    if (performance.now() < active.current.until && active.current.priority > reaction.priority) return;

    active.current = {
      priority: reaction.priority,
      until: performance.now() + reaction.durationMs,
    };
    setGesture(reaction.gesture);
    setPersonality(reaction.personality);
  }), []);

  useEffect(() => {
    if (reducedMotion) return;

    let sequenceIndex = 0;
    let timer = 0;
    const scheduleIdle = () => {
      timer = window.setTimeout(() => {
        if (performance.now() >= active.current.until) {
          const next = idleSequence[sequenceIndex % idleSequence.length];
          if (next) {
            active.current = { priority: 1, until: performance.now() + 5200 };
            setGesture(next.gesture);
            setPersonality(next.personality);
            sequenceIndex += 1;
          }
        }
        scheduleIdle();
      }, 5200);
    };

    scheduleIdle();
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return {
    gesture,
    personality,
    section,
    hovered,
    setHovered,
    onClick: () => {
      const interaction = clickSequence[clickIndex.current % clickSequence.length] ?? "greeting";
      clickIndex.current += 1;
      emitAstronautEvent({ type: "USER_CLICK_ASTRONAUT", interaction });
    },
  };
}
