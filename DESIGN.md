# NEBULA X Visual & Interaction System

## Brand premise

NEBULA X is a digital frontier explored with a calm, capable mission guide. Space is the setting; technology and products remain the reason to visit. The astronaut is the recognizable host, not a substitute for clear catalog information or an obstacle to checkout.

The interface should feel authored, precise, and quietly cinematic. Avoid generic sci-fi panels, decorative HUD clutter, excessive glow, and repeated card grids. Use atmospheric space in large visual areas and reserve luminous accents for meaningful actions, state changes, or system signals.

## Visual language

### Color tokens

| Token | Value | Use |
|---|---|---|
| Deep space | `#07080D` | Main canvas and full-screen scenes |
| Midnight panel | `#0C0E16` | Navigation, drawers, and dashboard surfaces |
| Slate panel | `#111722` | Character details and secondary surfaces |
| Soft white | `#F0EFF5` | Primary text |
| Muted text | `#898DA1` | Supporting copy |
| Cosmic blue | `#42647D` | Environmental light and depth |
| Electric cyan | `#76D9E8` | Focus, astronaut suit telemetry, live status |
| Violet accent | `#AD9AFF` | Brand accent, used sparingly |
| Success | `#89DEC3` | Verified/complete states |
| Caution | `#E7C77F` | Pending/attention states |
| Error | `#E99AA7` | Actionable failure states |

Use the existing CSS custom properties in `src/app/globals.css` as the implementation source of truth. Gradients should describe light falloff or a material surface, not decorate every control. Text contrast and state must never rely on color alone.

### Typography

- **Space Grotesk**: brand, hero, section headings, and short display text.
- **DM Sans**: product descriptions, prices, forms, and general interface copy.
- **Monospace**: short system labels, IDs, timings, and coordinates only.
- Keep marketplace body copy comfortable to read; avoid tiny uppercase labels for essential product or payment information.

### Layout and materials

- Use strong editorial alignment and varied section compositions rather than repeating equal-width cards.
- Product surfaces are functional first: name, description, price, availability, and action are visible without hover.
- Glass/blur is reserved for floating navigation and overlays. Content panels use restrained, legible opaque surfaces.
- Holographic visual detail belongs around the character and scene—not behind dense paragraphs.
- The astronaut sits beside, never in front of, the hero copy or primary actions. On narrow screens the character may move behind the copy, but controls remain clickable and readable.

## Astronaut identity

### Current implementation status

The repository does not contain a GLB/GLTF astronaut asset. The current character is an **original procedural placeholder** built from Three.js geometry: pressure suit, reflective visor, chest insignia, life-support pack, gloves, boots, joints, and emissive suit details. It is not a final production character model and does not claim facial animation or a production skeletal rig.

The placeholder is replaceable with a rigged `.glb` by setting `NEXT_PUBLIC_ASTRONAUT_MODEL_URL` to a same-origin public asset URL. The rigged adapter uses named clips through Drei's `useAnimations`/Three.js `AnimationMixer`; missing clips use a restrained root-pose fallback. Keep a final asset optimized, licensed for this project, and hosted with appropriate caching before enabling that variable.

### Character behavior

- Idle float and torso/head movement are subtle and stop/reduce under `prefers-reduced-motion`.
- The helmet/head tracks the normalized pointer with damped interpolation; the torso follows less strongly.
- Pointer hover, click, catalog/category navigation, product discovery, checkout, payment completion, errors, and section changes are explicit events.
- The procedural fallback animates a single prioritized gesture at a time. Priority order is critical success, direct user gesture, contextual reaction, then ambient idle.
- Available semantic clips: `Idle_Floating`, `Idle_Looking_Around`, `Idle_Checking_Device`, `Wave_Hand`, `Thumbs_Up`, `Point_Left`, `Point_Right`, `Point_Forward`, `Surprise`, `Celebrate`, `Thinking`, `Greeting`, `Flying`, `Landing`, `Interaction_Respond`.
- The `AstronautGuide` uses scripted context messages. It is not an AI assistant and does not call a language model.

### Event contract

`src/lib/astronaut-events.ts` defines the typed event names and scripted dialogue mapping. `emitAstronautEvent` broadcasts scene-independent user/context events; `AstronautController` maps them to a priority gesture and `AstronautGuide` maps them to dialogue. Add a new event once in this contract, then connect it to UI behavior—do not couple product or payment components directly to Three.js refs.

| Event | Intended reaction |
|---|---|
| `USER_HOVER_ASTRONAUT` | Visor attention / brief acknowledgment |
| `USER_CLICK_ASTRONAUT` | Greeting wave and guide dialogue |
| `USER_OPEN_CATALOG` | Point toward discovery/catalog |
| `USER_OPEN_PRODUCT` | Point forward and name the product |
| `USER_OPEN_VPS` | Introduce Infrastructure Station |
| `USER_OPEN_CHECKOUT` | Thinking / mission-check dialogue |
| `PAYMENT_SUCCESS` | Celebration after the server reports settlement |
| `USER_ERROR` | Calm response and next-step guidance |
| `SECTION_CHANGED` | Section-specific scene gesture |

Do not dispatch payment success from a browser button or Snap callback. Use only a server-verified payment record.

## Motion system

- Use damped pointer following and short gesture transitions; never snap the head or body to targets.
- Use GSAP for page/intro storytelling, and the Three.js frame loop only for lightweight local pose animation.
- Ambient animation must not capture focus, block scrolling, or delay access to marketplace content.
- The introductory overlay is brief, session-scoped, has a visible Skip control, and exits immediately for reduced-motion users.
- Do not add scroll hijacking. ScrollTrigger may reveal or transform scene elements while native document scrolling remains intact.

## Interaction, accessibility, and responsive behavior

- The guide has real buttons and links, an accessible name, a live dialogue region, and a close action. It supplements—not replaces—keyboard-operable page navigation.
- Product and payment details remain ordinary semantic HTML outside the canvas.
- Provide visible focus styles for guide, Skip, CTA, and catalog controls. Canvas pointer interaction is an enhancement; users can also open the guide through its HTML control.
- Honor `prefers-reduced-motion`; the fallback scene remains visible without idle float or star drift.
- Canvas resolution is capped to reduce GPU cost. Keep particle counts conservative and use the existing CSS planet fallback if WebGL is unavailable.
- Avoid autoplay sound, forced waits, flashing, and movement that could obscure content.

## Performance and asset policy

- Lazy-load the Three.js scene using the existing dynamic import boundary.
- Keep scene geometry low-complexity and share materials; dispose manually allocated materials on unmount.
- Limit canvas DPR, avoid large uncompressed textures, and use compressed GLB textures/meshopt for any final model.
- Do not preload a GLB on every page. Load it only on scene-bearing pages and preserve a WebGL/CSS fallback.
- Test pointer gestures, idle state, mobile layout, and WebGL loss on real target browsers before increasing quality.

## Product and dashboard application

- Landing page: astronaut is the scene focal character with a contextual guide; product discovery and purchase controls remain prominent.
- Product detail and payment pages: use the compact guide to retain the same voice without adding another heavyweight canvas.
- Mission Control: show a compact guide beside workspace navigation; keep the data tables, account actions, and status legible.
- Admin Control Room: retain a restrained operational layout. The astronaut is not allowed to obscure admin tasks or imply a live service health state.
- QRIS, order, stock, and account state are displayed from the existing server-backed data. Do not invent transaction, stock, or platform metrics for visual storytelling.

## Review checklist

- Is the astronaut clearly identifiable at desktop and mobile sizes?
- Does each gesture/dialogue correspond to a real user event?
- Can users complete product discovery and checkout with motion disabled?
- Are prices, stock, order state, and admin metrics real and readable?
- Does the scene degrade gracefully with WebGL unavailable or on a low-power device?
- Is the current placeholder still clearly documented until an approved final rigged model is supplied?
