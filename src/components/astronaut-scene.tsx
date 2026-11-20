"use client";

import { useFrame } from "@react-three/fiber";
import { Float, Stars, useAnimations, useGLTF } from "@react-three/drei";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AnimationClip, Group, MathUtils, MeshStandardMaterial, NumberKeyframeTrack } from "three";
import type { AstronautGesture, AstronautPersonality } from "@/lib/astronaut-events";
import { emitAstronautEvent } from "@/lib/astronaut-events";
import { useAstronautController } from "@/components/astronaut-controller";
import { useAstronautPerformanceManager } from "@/components/astronaut-performance-manager";

const animationNames: AstronautGesture[] = [
  "Idle_Floating", "Idle_Looking_Around", "Idle_Checking_Device", "Wave_Hand", "Thumbs_Up",
  "Point_Left", "Point_Right", "Point_Forward", "Surprise", "Celebrate", "Thinking",
  "Greeting", "Flying", "Landing", "Interaction_Respond",
];

const sectionOffsets: Record<string, [number, number]> = {
  home: [0, 0],
  universe: [-0.12, 0.06],
  marketplace: [0.18, 0.02],
  technology: [-0.18, 0.08],
  about: [0.08, 0],
  faq: [0, -0.04],
};

function PlaceholderAstronaut({ gesture, personality, hovered, section, onHover, onClick, reducedMotion }: {
  gesture: AstronautGesture;
  personality: AstronautPersonality;
  section: string;
  hovered: boolean;
  onHover: (value: boolean) => void;
  onClick: () => void;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const leftIndexFinger = useRef<Group>(null);
  const rightIndexFinger = useRef<Group>(null);
  const rightThumb = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const materials = useMemo(() => ({
    suit: new MeshStandardMaterial({ color: "#dce6eb", roughness: 0.34, metalness: 0.45 }),
    joint: new MeshStandardMaterial({ color: "#465568", roughness: 0.48, metalness: 0.55 }),
    visor: new MeshStandardMaterial({ color: "#14344a", roughness: 0.13, metalness: 0.78, emissive: "#123854", emissiveIntensity: 0.42 }),
    trim: new MeshStandardMaterial({ color: "#72d3df", roughness: 0.28, metalness: 0.58, emissive: "#317f91", emissiveIntensity: 0.55 }),
    dark: new MeshStandardMaterial({ color: "#182535", roughness: 0.55, metalness: 0.48 }),
  }), []);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const frameDelta = Math.min(delta, 1 / 20);
    const [sectionX, sectionY] = sectionOffsets[section] ?? [0, 0];
    if (root.current) {
      const personalityLift = personality === "Excited" ? Math.sin(elapsed * 3.2) * 0.03 : 0;
      const floatY = reducedMotion ? 0 : Math.sin(elapsed * 0.82) * 0.055 + Math.sin(elapsed * 0.43) * 0.018 + personalityLift;
      root.current.position.x = MathUtils.damp(root.current.position.x, 0.35 + sectionX, 2.2, frameDelta);
      root.current.position.y = MathUtils.damp(root.current.position.y, -0.25 + sectionY + floatY, 2.7, frameDelta);
      const lookY = reducedMotion ? 0 : pointer.current.x * 0.2 + sectionX * 0.18;
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, lookY, 3, frameDelta);
      root.current.rotation.x = MathUtils.damp(root.current.rotation.x, reducedMotion ? 0 : -pointer.current.y * 0.07, 2.8, frameDelta);
      root.current.rotation.z = MathUtils.damp(root.current.rotation.z, reducedMotion ? 0 : -pointer.current.x * 0.035, 2.5, frameDelta);
    }
    if (head.current) {
      const idleLook = gesture === "Idle_Looking_Around" && !reducedMotion ? Math.sin(elapsed * 0.72) * 0.16 : 0;
      const equipmentLook = gesture === "Idle_Checking_Device" || gesture === "Thinking" ? -0.17 : 0;
      head.current.rotation.y = MathUtils.damp(head.current.rotation.y, (reducedMotion ? 0 : pointer.current.x * 0.3) + idleLook, 3.6, frameDelta);
      head.current.rotation.x = MathUtils.damp(head.current.rotation.x, (reducedMotion ? 0 : -pointer.current.y * 0.17) + equipmentLook, 3.6, frameDelta);
    }
    if (torso.current) {
      const breath = reducedMotion ? 1 : 1 + Math.sin(elapsed * 1.45) * 0.012;
      torso.current.scale.y = MathUtils.damp(torso.current.scale.y, breath, 3, frameDelta);
      const curiousLean = hovered || personality === "Curious" ? -0.025 : 0;
      const thinkingLean = personality === "Thinking" ? -0.035 : 0;
      torso.current.rotation.x = MathUtils.damp(torso.current.rotation.x, (reducedMotion ? 0 : pointer.current.y * 0.035) + curiousLean + thinkingLean, 2.8, frameDelta);
    }
    const wave = gesture === "Wave_Hand" || gesture === "Greeting" || (hovered && gesture === "Interaction_Respond");
    const pointRight = gesture === "Point_Right" || gesture === "Point_Forward";
    const pointLeft = gesture === "Point_Left";
    const thumbsUp = gesture === "Thumbs_Up";
    const celebrate = gesture === "Celebrate";
    const thinking = gesture === "Thinking" || gesture === "Idle_Checking_Device";
    const surprise = gesture === "Surprise";
    const waveMotion = reducedMotion ? 0 : Math.sin(elapsed * 4.2) * 0.2;
    const rightArmX = wave ? -2.25 + waveMotion : pointRight ? -1.38 : thumbsUp ? -2.58 : celebrate ? -2.7 : thinking ? -0.25 : surprise ? -1.5 : 0.08;
    const rightArmZ = wave ? -0.68 : pointRight ? 0.62 : thumbsUp ? 0.28 : celebrate ? -0.7 : thinking ? -0.12 : surprise ? -0.7 : 0.08;
    const leftArmX = celebrate ? -2.7 : pointLeft ? -1.38 : thinking ? -1.02 : surprise ? -1.5 : 0.08;
    const leftArmZ = celebrate ? 0.7 : pointLeft ? -0.62 : thinking ? 0.42 : surprise ? 0.7 : -0.08;
    if (rightArm.current) {
      rightArm.current.rotation.x = MathUtils.damp(rightArm.current.rotation.x, rightArmX, 4.2, frameDelta);
      rightArm.current.rotation.z = MathUtils.damp(rightArm.current.rotation.z, rightArmZ, 4.2, frameDelta);
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = MathUtils.damp(leftArm.current.rotation.x, leftArmX, 4.2, frameDelta);
      leftArm.current.rotation.z = MathUtils.damp(leftArm.current.rotation.z, leftArmZ, 4.2, frameDelta);
    }
    const showRightThumb = thumbsUp ? 1 : 0.01;
    const showRightPoint = pointRight ? 1 : 0.01;
    const showLeftPoint = pointLeft ? 1 : 0.01;
    if (rightThumb.current) rightThumb.current.scale.setScalar(MathUtils.damp(rightThumb.current.scale.x, showRightThumb, 8, frameDelta));
    if (rightIndexFinger.current) rightIndexFinger.current.scale.setScalar(MathUtils.damp(rightIndexFinger.current.scale.x, showRightPoint, 8, frameDelta));
    if (leftIndexFinger.current) leftIndexFinger.current.scale.setScalar(MathUtils.damp(leftIndexFinger.current.scale.x, showLeftPoint, 8, frameDelta));
    const flying = gesture === "Flying";
    const landing = gesture === "Landing";
    const idleLegSwing = reducedMotion ? 0 : Math.sin(elapsed * 0.8) * 0.025;
    if (leftLeg.current) leftLeg.current.rotation.x = MathUtils.damp(leftLeg.current.rotation.x, flying ? -0.55 : landing ? -0.42 : idleLegSwing, 2.8, frameDelta);
    if (rightLeg.current) rightLeg.current.rotation.x = MathUtils.damp(rightLeg.current.rotation.x, flying ? -0.25 : landing ? -0.38 : -idleLegSwing, 2.8, frameDelta);
  });

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <group
      ref={root}
      position={[0.35, -0.25, 1.12]}
      scale={0.62}
      onPointerMove={(event) => {
        pointer.current.x = event.pointer.x;
        pointer.current.y = event.pointer.y;
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        if (!hovered) emitAstronautEvent({ type: "USER_HOVER_ASTRONAUT" });
        onHover(true);
      }}
      onPointerOut={() => {
        pointer.current.x = 0;
        pointer.current.y = 0;
        onHover(false);
      }}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
    >
      <Float speed={reducedMotion ? 0 : 0.85} floatIntensity={reducedMotion ? 0 : 0.12} rotationIntensity={0}>
        <group ref={torso}>
          <mesh castShadow position={[0, 0.08, 0]} material={materials.suit}><capsuleGeometry args={[0.42, 0.65, 6, 12]} /></mesh>
          <mesh castShadow position={[0, 0.47, 0.02]} material={materials.joint}><cylinderGeometry args={[0.29, 0.32, 0.11, 18]} /></mesh>
          <mesh position={[0, 0.13, 0.405]} material={materials.dark}><boxGeometry args={[0.4, 0.27, 0.055]} /></mesh>
          <mesh position={[0, 0.13, 0.44]} material={materials.trim}><boxGeometry args={[0.29, 0.035, 0.025]} /></mesh>
          <mesh position={[-0.11, 0.13, 0.45]} material={materials.suit}><boxGeometry args={[0.035, 0.16, 0.025]} /></mesh>
          <mesh position={[0.11, 0.13, 0.45]} material={materials.suit}><boxGeometry args={[0.035, 0.16, 0.025]} /></mesh>
          <group position={[0, 0.84, 0]} ref={head}>
            <mesh castShadow material={materials.suit}><sphereGeometry args={[0.47, 32, 24]} /></mesh>
            <mesh position={[0, -0.04, 0.37]} scale={[0.83, 0.66, 0.37]} material={materials.visor}><sphereGeometry args={[0.43, 32, 24]} /></mesh>
            <mesh position={[0, -0.04, 0.68]} scale={[0.62, 0.025, 0.025]} material={materials.trim}><sphereGeometry args={[0.18, 12, 8]} /></mesh>
            <mesh position={[0, -0.4, 0.02]} material={materials.joint}><torusGeometry args={[0.37, 0.055, 8, 24]} /></mesh>
          </group>
          <group position={[-0.43, 0.24, 0]} ref={leftArm}>
            <mesh position={[0, -0.29, 0]} rotation={[0.12, 0, 0.1]} material={materials.suit}><capsuleGeometry args={[0.15, 0.35, 5, 10]} /></mesh>
            <mesh position={[0, -0.55, 0.02]} material={materials.joint}><sphereGeometry args={[0.13, 14, 12]} /></mesh>
            <mesh position={[0, -0.69, 0.02]} material={materials.suit}><boxGeometry args={[0.2, 0.22, 0.2]} /></mesh>
            <group ref={leftIndexFinger} position={[0, -0.8, 0.04]} scale={0.01}>
              <mesh material={materials.suit}><capsuleGeometry args={[0.035, 0.15, 3, 6]} /></mesh>
            </group>
          </group>
          <group position={[0.43, 0.24, 0]} ref={rightArm}>
            <mesh position={[0, -0.29, 0]} rotation={[-0.12, 0, -0.1]} material={materials.suit}><capsuleGeometry args={[0.15, 0.35, 5, 10]} /></mesh>
            <mesh position={[0, -0.55, 0.02]} material={materials.joint}><sphereGeometry args={[0.13, 14, 12]} /></mesh>
            <mesh position={[0, -0.69, 0.02]} material={materials.suit}><boxGeometry args={[0.2, 0.22, 0.2]} /></mesh>
            <group ref={rightIndexFinger} position={[0, -0.8, 0.04]} scale={0.01}>
              <mesh material={materials.suit}><capsuleGeometry args={[0.035, 0.15, 3, 6]} /></mesh>
            </group>
            <group ref={rightThumb} position={[0.13, -0.64, 0.06]} rotation={[0, 0, -0.78]} scale={0.01}>
              <mesh material={materials.suit}><capsuleGeometry args={[0.045, 0.12, 3, 6]} /></mesh>
            </group>
            <mesh position={[0, -0.52, 0.14]} material={materials.trim}><boxGeometry args={[0.15, 0.035, 0.025]} /></mesh>
          </group>
          <group position={[-0.21, -0.33, 0]} ref={leftLeg}>
            <mesh position={[0, -0.36, 0]} material={materials.suit}><capsuleGeometry args={[0.18, 0.36, 5, 10]} /></mesh>
            <mesh position={[0, -0.69, 0.08]} material={materials.dark}><boxGeometry args={[0.34, 0.2, 0.45]} /></mesh>
            <mesh position={[0, -0.58, 0.04]} material={materials.trim}><boxGeometry args={[0.18, 0.045, 0.04]} /></mesh>
          </group>
          <group position={[0.21, -0.33, 0]} ref={rightLeg}>
            <mesh position={[0, -0.36, 0]} material={materials.suit}><capsuleGeometry args={[0.18, 0.36, 5, 10]} /></mesh>
            <mesh position={[0, -0.69, 0.08]} material={materials.dark}><boxGeometry args={[0.34, 0.2, 0.45]} /></mesh>
            <mesh position={[0, -0.58, 0.04]} material={materials.trim}><boxGeometry args={[0.18, 0.045, 0.04]} /></mesh>
          </group>
          <group position={[0, 0.08, -0.4]}>
            <mesh material={materials.dark}><boxGeometry args={[0.67, 0.78, 0.28]} /></mesh>
            <mesh position={[0, 0.28, -0.15]} material={materials.trim}><boxGeometry args={[0.34, 0.045, 0.03]} /></mesh>
            <mesh position={[-0.27, -0.04, -0.17]} material={materials.joint}><cylinderGeometry args={[0.08, 0.08, 0.28, 12]} /></mesh>
            <mesh position={[0.27, -0.04, -0.17]} material={materials.joint}><cylinderGeometry args={[0.08, 0.08, 0.28, 12]} /></mesh>
          </group>
        </group>
      </Float>
      {hovered && <mesh position={[0, 0.16, 0]}><sphereGeometry args={[1.17, 24, 24]} /><meshBasicMaterial color="#82d9e8" transparent opacity={0.055} /></mesh>}
    </group>
  );
}

function RiggedAstronaut({ url, gesture, reducedMotion, onHover, onClick }: {
  url: string;
  gesture: AstronautGesture;
  reducedMotion: boolean;
  onHover: (value: boolean) => void;
  onClick: () => void;
}) {
  const group = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { scene, animations } = useGLTF(url);
  const fallbackClip = useMemo(() => {
    const rotation = new NumberKeyframeTrack(".rotation[y]", [0, 1.5, 3], [0, 0.06, 0]);
    return new AnimationClip("Idle_Floating", 3, [rotation]);
  }, []);
  const clipList = animations.length ? animations : [fallbackClip];
  const { actions } = useAnimations(clipList, group);
  const fallbackGesture = !animations.some((animation) => animation.name === gesture);
  useEffect(() => {
      const clipName = animationNames.includes(gesture) ? gesture : "Idle_Floating";
      const action = actions[clipName] ?? actions.Idle_Floating ?? Object.values(actions)[0];
    if (!action) return;
    action.reset().fadeIn(0.35).play();
    return () => { action.fadeOut(0.25); };
  }, [actions, gesture]);
  useFrame((state, delta) => {
    if (!group.current) return;
    const frameDelta = Math.min(delta, 1 / 20);
    const elapsed = state.clock.elapsedTime;
    group.current.position.y = -0.25 + (reducedMotion ? 0 : Math.sin(elapsed * 0.82) * 0.055);
    if (!fallbackGesture) return;
    const targetX = gesture === "Point_Left" || gesture === "Point_Right" || gesture === "Thinking" ? -0.08 : reducedMotion ? 0 : -pointer.current.y * 0.06;
    const targetY = gesture === "Point_Left" ? -0.2 : gesture === "Point_Right" ? 0.2 : reducedMotion ? 0 : pointer.current.x * 0.2;
    const targetZ = gesture === "Celebrate" || gesture === "Thumbs_Up" ? -0.08 : 0;
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, targetX, 3.5, frameDelta);
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, targetY, 3.5, frameDelta);
    group.current.rotation.z = MathUtils.damp(group.current.rotation.z, targetZ, 3.5, frameDelta);
  });
  return (
    <group
      ref={group}
      position={[0.35, -0.25, 1.12]}
      scale={0.62}
      onPointerMove={(event) => {
        pointer.current.x = event.pointer.x;
        pointer.current.y = event.pointer.y;
      }}
      onPointerOver={(event) => { event.stopPropagation(); onHover(true); emitAstronautEvent({ type: "USER_HOVER_ASTRONAUT" }); }}
      onPointerOut={() => {
        pointer.current.x = 0;
        pointer.current.y = 0;
        onHover(false);
      }}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
    >
      <primitive object={scene} />
    </group>
  );
}

class AstronautModelBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Configured NEBULA X astronaut model failed to load; using the procedural placeholder.", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export type AstronautCharacterState = {
  gesture: AstronautGesture;
  personality: AstronautPersonality;
  section: string;
};

function AstronautActor({
  modelUrl,
  reducedMotion,
  onCharacterStateChange,
}: {
  modelUrl?: string;
  reducedMotion: boolean;
  onCharacterStateChange: (state: AstronautCharacterState) => void;
}) {
  const { gesture, personality, section, hovered, setHovered, onClick } = useAstronautController(reducedMotion);

  useEffect(() => onCharacterStateChange({ gesture, personality, section }), [gesture, personality, section, onCharacterStateChange]);

  const placeholder = (
    <PlaceholderAstronaut
      gesture={gesture}
      personality={personality}
      section={section}
      hovered={hovered}
      onHover={setHovered}
      onClick={onClick}
      reducedMotion={reducedMotion}
    />
  );

  if (!modelUrl) return placeholder;

  return (
    <AstronautModelBoundary fallback={placeholder}>
      <RiggedAstronaut
        url={modelUrl}
        gesture={gesture}
        reducedMotion={reducedMotion}
        onHover={setHovered}
        onClick={onClick}
      />
    </AstronautModelBoundary>
  );
}

export default function AstronautScene({ onCharacterStateChange }: {
  onCharacterStateChange: (state: AstronautCharacterState) => void;
}) {
  const reducedMotion = useAstronautPerformanceManager();
  const modelUrl = process.env.NEXT_PUBLIC_ASTRONAUT_MODEL_URL;

  return (
    <group>
      <AstronautActor modelUrl={modelUrl} reducedMotion={reducedMotion} onCharacterStateChange={onCharacterStateChange} />
    </group>
  );
}

export function AstronautEnvironment({
  reducedMotion: requestedReducedMotion,
  lowQuality = false,
}: {
  reducedMotion?: boolean;
  lowQuality?: boolean;
}) {
  const reducedMotion = useAstronautPerformanceManager();
  const reduce = requestedReducedMotion ?? reducedMotion;
  const count = reduce ? 250 : lowQuality ? 350 : 700;
  return <Stars radius={48} depth={34} count={count} factor={3} saturation={0.08} fade speed={reduce ? 0 : lowQuality ? 0.04 : 0.1} />;
}
