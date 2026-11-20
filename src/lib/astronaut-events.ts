export type AstronautGesture =
  | "Idle_Floating"
  | "Idle_Looking_Around"
  | "Idle_Checking_Device"
  | "Wave_Hand"
  | "Thumbs_Up"
  | "Point_Left"
  | "Point_Right"
  | "Point_Forward"
  | "Surprise"
  | "Celebrate"
  | "Thinking"
  | "Greeting"
  | "Flying"
  | "Landing"
  | "Interaction_Respond";

export type AstronautPersonality =
  | "Curious"
  | "Friendly"
  | "Excited"
  | "Thinking"
  | "Celebrating"
  | "Guiding";

export type AstronautClickInteraction = "greeting" | "wave" | "thumbs-up" | "surprise";

export type AstronautEvent =
  | { type: "USER_HOVER_ASTRONAUT" }
  | { type: "USER_CLICK_ASTRONAUT"; interaction?: AstronautClickInteraction }
  | { type: "USER_OPEN_CATALOG" }
  | { type: "USER_OPEN_PRODUCT"; productName?: string }
  | { type: "USER_OPEN_VPS" }
  | { type: "USER_OPEN_CHECKOUT" }
  | { type: "USER_OPEN_EMPTY_STATE" }
  | { type: "PAYMENT_SUCCESS" }
  | { type: "USER_ERROR"; message?: string }
  | { type: "USER_SET_MOTION_REDUCED"; enabled: boolean }
  | { type: "SECTION_CHANGED"; section: string };

export type AstronautGuideMessage = {
  text: string;
  gesture: AstronautGesture;
  actionLabel?: string;
  actionHref?: string;
};

export type AstronautReaction = {
  gesture: AstronautGesture;
  personality: AstronautPersonality;
  priority: number;
  durationMs: number;
};

const messages: Record<string, AstronautGuideMessage> = {
  USER_HOVER_ASTRONAUT: { text: "Hello there, explorer.", gesture: "Interaction_Respond" },
  USER_CLICK_ASTRONAUT: { text: "Welcome aboard, explorer! Ready to chart your next idea?", gesture: "Wave_Hand", actionLabel: "Explore products", actionHref: "#marketplace" },
  USER_OPEN_CATALOG: { text: "New discoveries ahead. Take a look around the marketplace.", gesture: "Point_Right", actionLabel: "Browse the catalog", actionHref: "#marketplace" },
  USER_OPEN_VPS: { text: "Welcome to Infrastructure Station. Find the compute that fits your mission.", gesture: "Point_Left", actionLabel: "Explore infrastructure", actionHref: "#marketplace" },
  USER_OPEN_CHECKOUT: { text: "Almost there, explorer. Let's complete your mission.", gesture: "Thinking" },
  PAYMENT_SUCCESS: { text: "Mission accomplished! Your order has been confirmed.", gesture: "Celebrate", actionLabel: "View your orders", actionHref: "/dashboard" },
  USER_ERROR: { text: "We hit a little turbulence. Your order is safe; let's check the details.", gesture: "Interaction_Respond" },
  USER_OPEN_EMPTY_STATE: { text: "Nothing in this sector yet. Try another orbit or explore the full catalog.", gesture: "Point_Right", actionLabel: "Explore products", actionHref: "#marketplace" },
  SECTION_CHANGED: { text: "Let's discover something extraordinary.", gesture: "Idle_Looking_Around" },
};

const clickMessages: Record<AstronautClickInteraction, AstronautGuideMessage> = {
  greeting: { text: "Welcome aboard, explorer! Ready to chart your next idea?", gesture: "Greeting", actionLabel: "Explore products", actionHref: "#marketplace" },
  wave: { text: "Good to see you again. Shall we explore together?", gesture: "Wave_Hand", actionLabel: "Browse the catalog", actionHref: "#marketplace" },
  "thumbs-up": { text: "You've got this, explorer. Let's make something great.", gesture: "Thumbs_Up" },
  surprise: { text: "A new discovery! What would you like to explore?", gesture: "Surprise", actionLabel: "Explore products", actionHref: "#marketplace" },
};

export function getAstronautReaction(event: AstronautEvent): AstronautReaction {
  if (event.type === "USER_HOVER_ASTRONAUT") {
    return { gesture: "Interaction_Respond", personality: "Curious", priority: 2, durationMs: 1200 };
  }
  if (event.type === "USER_CLICK_ASTRONAUT") {
    const gesture = clickMessages[event.interaction ?? "greeting"].gesture;
    return {
      gesture,
      personality: gesture === "Thumbs_Up" ? "Excited" : "Friendly",
      priority: 3,
      durationMs: 2400,
    };
  }
  if (event.type === "USER_OPEN_CATALOG" || event.type === "USER_OPEN_PRODUCT" || event.type === "USER_OPEN_VPS") {
    return {
      gesture: event.type === "USER_OPEN_VPS" ? "Point_Left" : event.type === "USER_OPEN_PRODUCT" ? "Point_Forward" : "Point_Right",
      personality: "Guiding",
      priority: 2,
      durationMs: 3000,
    };
  }
  if (event.type === "USER_OPEN_CHECKOUT") {
    return { gesture: "Thinking", personality: "Thinking", priority: 2, durationMs: 2800 };
  }
  if (event.type === "PAYMENT_SUCCESS") {
    return { gesture: "Celebrate", personality: "Celebrating", priority: 4, durationMs: 4000 };
  }
  if (event.type === "USER_OPEN_EMPTY_STATE") {
    return { gesture: "Point_Right", personality: "Friendly", priority: 2, durationMs: 2800 };
  }
  if (event.type === "USER_ERROR") {
    return { gesture: "Interaction_Respond", personality: "Friendly", priority: 2, durationMs: 2200 };
  }
  if (event.type === "SECTION_CHANGED") {
    const guidingSection = event.section === "marketplace" || event.section === "technology";
    return {
      gesture: event.section === "marketplace" ? "Point_Right" : event.section === "technology" ? "Point_Left" : "Idle_Looking_Around",
      personality: guidingSection ? "Guiding" : "Curious",
      priority: 2,
      durationMs: 2600,
    };
  }
  return { gesture: "Idle_Floating", personality: "Curious", priority: 1, durationMs: 0 };
}

export function getAstronautGuideMessage(event: AstronautEvent): AstronautGuideMessage {
  if (event.type === "USER_CLICK_ASTRONAUT") {
    return clickMessages[event.interaction ?? "greeting"];
  }
  if (event.type === "USER_OPEN_PRODUCT") {
    const product = event.productName?.trim();
    return {
      text: product
        ? `Looks like you've discovered ${product}. Want to take a closer look?`
        : "Looks like you've discovered something interesting!",
      gesture: "Point_Forward",
    };
  }
  if (event.type === "SECTION_CHANGED") {
    if (event.section === "marketplace") return messages.USER_OPEN_CATALOG;
    if (event.section === "technology") return messages.USER_OPEN_VPS;
    return messages.SECTION_CHANGED;
  }
  return messages[event.type] ?? messages.SECTION_CHANGED;
}

const eventName = "nebula:astronaut";

export function emitAstronautEvent(event: AstronautEvent) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AstronautEvent>(eventName, { detail: event }));
  }
}

export function subscribeAstronautEvents(listener: (event: AstronautEvent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<AstronautEvent>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
