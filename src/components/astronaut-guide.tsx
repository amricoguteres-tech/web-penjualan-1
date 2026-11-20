"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Accessibility, ChevronDown, MessageCircle, X } from "lucide-react";
import {
  emitAstronautEvent,
  getAstronautGuideMessage,
  subscribeAstronautEvents,
  type AstronautEvent,
  type AstronautGuideMessage,
} from "@/lib/astronaut-events";
import { setAstronautMotionReduced, useAstronautPerformanceManager } from "@/components/astronaut-performance-manager";

export default function AstronautGuide({
  compact = false,
  initialEvent,
}: {
  compact?: boolean;
  initialEvent?: AstronautEvent;
}) {
  const [message, setMessage] = useState<AstronautGuideMessage>(
    getAstronautGuideMessage({ type: "SECTION_CHANGED", section: "home" }),
  );
  const [open, setOpen] = useState(!compact);
  const [hasContext, setHasContext] = useState(false);
  const reducedMotion = useAstronautPerformanceManager();

  useEffect(() => subscribeAstronautEvents((event: AstronautEvent) => {
    setMessage(getAstronautGuideMessage(event));
    setOpen(true);
    setHasContext(true);
  }), []);

  useEffect(() => {
    if (initialEvent) emitAstronautEvent(initialEvent);
  }, [initialEvent]);

  return (
    <aside className={`astronaut-guide ${compact ? "astronaut-guide-compact" : ""} ${open ? "guide-open" : ""}`} aria-label="NEBULA X astronaut guide">
      {open && (
        <div className="astronaut-dialogue" role="status" aria-live="polite">
          <div className="astronaut-dialogue-top">
            <span>MISSION GUIDE <i /></span>
            <span className="astronaut-guide-controls">
              <button type="button" aria-label={`${reducedMotion ? "Enable" : "Reduce"} astronaut motion`} aria-pressed={reducedMotion} onClick={() => setAstronautMotionReduced(!reducedMotion)}><Accessibility size={13} />{reducedMotion ? "MOTION LOW" : "REDUCE MOTION"}</button>
              <button type="button" aria-label="Close guide dialogue" onClick={() => setOpen(false)}><X size={13} /></button>
            </span>
          </div>
          <p>{hasContext ? message.text : "Welcome aboard, explorer! Ready to explore the NEBULA X universe?"}</p>
          {message.actionHref && <Link href={message.actionHref}>{message.actionLabel}<span>↗</span></Link>}
        </div>
      )}
      {!compact && (
        <button className="astronaut-guide-toggle" type="button" onClick={() => {
          if (!open) emitAstronautEvent({ type: "USER_CLICK_ASTRONAUT" });
          setOpen(!open);
        }} aria-expanded={open} aria-label={open ? "Close astronaut guide" : "Open astronaut guide"}>
          <span className="guide-helmet"><i /><b /></span>
          <span>{open ? "EXPLORER GUIDE" : "TALK TO YOUR GUIDE"}</span>
          <ChevronDown size={12} />
        </button>
      )}
      {compact && !open && (
        <button className="astronaut-guide-compact-button" type="button" onClick={() => { setOpen(true); emitAstronautEvent({ type: "USER_CLICK_ASTRONAUT" }); }} aria-label="Open astronaut guide">
          <span className="guide-helmet"><i /><b /></span><MessageCircle size={13} />
        </button>
      )}
    </aside>
  );
}
