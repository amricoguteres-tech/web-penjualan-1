"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Group, Mesh } from "three";
import { useThree } from "@react-three/fiber";
import AstronautScene, { AstronautEnvironment } from "@/components/astronaut-scene";
import type { AstronautCharacterState } from "@/components/astronaut-scene";
import PlanetFallback from "@/components/planet-fallback";

function subscribeToDeviceQuality(callback: () => void) {
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  coarsePointer.addEventListener("change", callback);
  return () => coarsePointer.removeEventListener("change", callback);
}

function getDeviceQuality() {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.hardwareConcurrency <= 4 ||
    (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 4)
  );
}

function getServerDeviceQuality() {
  return false;
}

function Planet({ reducedMotion }: { reducedMotion: boolean }) {
  const system = useRef<Group>(null);
  const planet = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (!reducedMotion && system.current) {
      system.current.rotation.y += (state.pointer.x * 0.12 - system.current.rotation.y) * 0.018;
      system.current.rotation.x += (-state.pointer.y * 0.07 - system.current.rotation.x) * 0.018;
    }
    if (!reducedMotion && planet.current) {
      planet.current.rotation.y += delta * 0.13;
      planet.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.06;
    }
    if (!reducedMotion && ring.current) ring.current.rotation.z -= delta * 0.035;
  });

  return (
    <group ref={system}>
      <Float speed={reducedMotion ? 0 : 0.55} rotationIntensity={reducedMotion ? 0 : 0.05} floatIntensity={reducedMotion ? 0 : 0.12}>
        <mesh ref={planet}>
          <sphereGeometry args={[1.32, 48, 48]} />
          <meshStandardMaterial
            color="#242754"
            roughness={0.76}
            metalness={0.2}
            emissive="#171b61"
            emissiveIntensity={0.34}
          />
        </mesh>
        <mesh scale={1.045}>
          <sphereGeometry args={[1.32, 40, 40]} />
          <meshBasicMaterial color="#8877ff" transparent opacity={0.09} side={2} />
        </mesh>
        <mesh ref={ring} rotation={[1.05, 0.22, -0.3]}>
          <torusGeometry args={[1.94, 0.012, 6, 128]} />
          <meshBasicMaterial color="#a18bff" transparent opacity={0.54} />
        </mesh>
        <mesh rotation={[1.05, 0.22, -0.3]}>
          <torusGeometry args={[2.17, 0.006, 6, 128]} />
          <meshBasicMaterial color="#56d9ff" transparent opacity={0.34} />
        </mesh>
        <mesh rotation={[0.2, 0.35, 0.8]}>
          <torusGeometry args={[1.68, 0.008, 6, 128]} />
          <meshBasicMaterial color="#b99bff" transparent opacity={0.25} />
        </mesh>
        <mesh position={[-0.48, 0.71, 0.88]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#b4a3ff" />
        </mesh>
      </Float>
    </group>
  );
}

function SpaceStation({ reducedMotion }: { reducedMotion: boolean }) {
  const station = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!reducedMotion && station.current) station.current.rotation.y += delta * 0.035;
  });
  return (
    <group ref={station} position={[-2.25, 0.82, -0.8]} scale={0.37} rotation={[0.24, 0.18, -0.15]}>
      <mesh>
        <cylinderGeometry args={[0.23, 0.23, 1.15, 12]} />
        <meshStandardMaterial color="#b9c9d1" roughness={0.42} metalness={0.58} />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.28, 12]} />
        <meshStandardMaterial color="#8ba9b8" roughness={0.48} metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.67, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 0.25, 12]} />
        <meshStandardMaterial color="#617e91" roughness={0.52} metalness={0.36} />
      </mesh>
      <mesh position={[-0.77, 0, 0]}>
        <boxGeometry args={[1.1, 0.05, 0.38]} />
        <meshStandardMaterial color="#42657f" emissive="#173347" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0.77, 0, 0]}>
        <boxGeometry args={[1.1, 0.05, 0.38]} />
        <meshStandardMaterial color="#42657f" emissive="#173347" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[-0.77, 0.05, 0.2]}>
        <boxGeometry args={[0.83, 0.012, 0.012]} />
        <meshStandardMaterial color="#7aaebd" emissive="#28505a" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0.77, 0.05, 0.2]}>
        <boxGeometry args={[0.83, 0.012, 0.012]} />
        <meshStandardMaterial color="#7aaebd" emissive="#28505a" emissiveIntensity={0.22} />
      </mesh>
    </group>
  );
}

function ScoutCraft({ reducedMotion }: { reducedMotion: boolean }) {
  const craft = useRef<Group>(null);
  useFrame((state, delta) => {
    if (!craft.current || reducedMotion) return;
    craft.current.rotation.y += delta * 0.12;
    craft.current.position.y = 1.46 + Math.sin(state.clock.elapsedTime * 0.7) * 0.045;
  });
  return (
    <group ref={craft} position={[2.48, 1.46, -1.05]} scale={0.17} rotation={[0.16, 0.3, -0.12]}>
      <mesh>
        <coneGeometry args={[0.34, 1.1, 8]} />
        <meshStandardMaterial color="#d0dbe0" metalness={0.68} roughness={0.25} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 1.2, 8]} />
        <meshStandardMaterial color="#657d92" roughness={0.5} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color="#78d3e2" emissive="#41b9d1" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function WebGLDiagnostics({ onContextLost, onContextRestored }: {
  onContextLost: () => void;
  onContextRestored: () => void;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.error("NEBULA X WebGL context was lost; showing the astronaut fallback.");
      onContextLost();
    };
    const handleContextRestored = () => {
      onContextRestored();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl, onContextLost, onContextRestored]);

  return null;
}

export default function PlanetScene() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [webglStatus, setWebglStatus] = useState<"loading" | "ready" | "lost">("loading");
  const lowQuality = useSyncExternalStore(
    subscribeToDeviceQuality,
    getDeviceQuality,
    getServerDeviceQuality,
  );
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const markContextLost = useCallback(() => {
    setContextLost(true);
    setWebglStatus("lost");
  }, []);
  const markContextRestored = useCallback(() => {
    setContextLost(false);
    setWebglStatus("ready");
  }, []);
  const reportCharacterState = useCallback((characterState: AstronautCharacterState) => {
    if (!hostRef.current) return;
    hostRef.current.dataset.astronautGesture = characterState.gesture;
    hostRef.current.dataset.astronautPersonality = characterState.personality;
    hostRef.current.dataset.astronautSection = characterState.section;
  }, []);

  return (
    <div ref={hostRef} className="planet-canvas" aria-label="Interactive NEBULA X planet and astronaut scene" data-webgl-status={webglStatus}>
      <Canvas
        dpr={lowQuality ? [0.7, 1] : [1, 1.1]}
        camera={{ position: [0, 0, 5.4], fov: 42 }}
        gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
        onCreated={({ gl }) => setWebglStatus(gl.domElement ? "ready" : "loading")}
        fallback={<PlanetFallback />}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.72} />
          <pointLight position={[3, 2, 4]} intensity={2.6} color="#8c7bff" />
          <pointLight position={[-4, -1, 2]} intensity={1.5} color="#3ad8ff" />
          <WebGLDiagnostics
            onContextLost={markContextLost}
            onContextRestored={markContextRestored}
          />
          <Planet reducedMotion={reducedMotion} />
          <SpaceStation reducedMotion={reducedMotion} />
          <ScoutCraft reducedMotion={reducedMotion} />
          <AstronautEnvironment reducedMotion={reducedMotion} lowQuality={lowQuality} />
          <AstronautScene onCharacterStateChange={reportCharacterState} />
        </Suspense>
      </Canvas>
      {contextLost && <div className="planet-context-fallback"><PlanetFallback /></div>}
    </div>
  );
}
