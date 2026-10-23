"use client";

import { Environment, Float, Lightformer, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { tokens } from "@/lib/tokens";
import { Avatar } from "./Avatar";
import { DEPTH_URL, PORTRAIT_URL, Portrait3D } from "./Portrait3D";

const GLB_URL = "/models/head.glb";

type Mode = "portrait" | "glb" | "avatar";

async function exists(url: string, type: string) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").includes(type);
  } catch {
    return false;
  }
}

/**
 * The receptionist in the hero.
 *
 * Prefers the photoreal portrait + depth map (rendered as a 3D relief), then a generated
 * GLB, then the procedural avatar — so the hero never depends on the generation step.
 * `level` (0..1) is the live voice amplitude.
 */
export function HeadScene({ level = 0, onReady }: { level?: number; onReady?: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    (async () => {
      if ((await exists(PORTRAIT_URL, "image")) && (await exists(DEPTH_URL, "image"))) setMode("portrait");
      else if (await exists(GLB_URL, "model")) setMode("glb");
      else setMode("avatar");
    })();
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.1, 5.2], fov: 30 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      frameloop={reduced ? "demand" : "always"}
      aria-hidden
    >
      <Suspense fallback={null}>
        {mode === "portrait" ? (
          <Rig reduced={reduced} amount={0.32}>
            <Portrait3D level={level} />
          </Rig>
        ) : (
          <Rig reduced={reduced}>
            <Float speed={reduced ? 0 : 1.4} rotationIntensity={0.15} floatIntensity={0.35}>
              {mode === "glb" ? <GeneratedHead level={level} /> : mode === "avatar" ? <Avatar level={level} /> : null}
            </Float>
          </Rig>
        )}
        <ChromeEnvironment />
        {mode !== null && <Mounted onReady={onReady} />}
      </Suspense>
    </Canvas>
  );
}

/** Fires once the Suspense boundary has resolved, i.e. the portrait/GLB textures are in. */
function Mounted({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onReady?.();
  }, [onReady]);
  return null;
}

/** Turns the head toward the cursor with a damped follow; idle sway when the cursor is still. */
function Rig({ children, reduced, amount = 1 }: { children: React.ReactNode; reduced: boolean; amount?: number }) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g || reduced) return;
    const t = state.clock.elapsedTime;
    const targetY = (pointer.current.x * 0.45 + Math.sin(t * 0.3) * 0.08) * amount;
    const targetX = pointer.current.y * 0.18 * amount;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, targetY, 3, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, targetX, 3, dt);
  });

  return <group ref={group}>{children}</group>;
}

function useChromeMaterial(level: number) {
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(tokens.chrome.base),
        metalness: 1,
        roughness: 0.2,
        iridescence: 1,
        iridescenceIOR: 1.7,
        iridescenceThicknessRange: [180, 900],
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: new THREE.Color(tokens.color.accent),
        emissiveIntensity: 0,
        envMapIntensity: 1.9,
      }),
    [],
  );
  useFrame((_, dt) => {
    mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, level * 0.55, 8, dt);
  });
  return mat;
}

function GeneratedHead({ level }: { level: number }) {
  const { scene } = useGLTF(GLB_URL, true);
  const model = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z));
    return root;
  }, [scene]);
  return <Breathing level={level}><primitive object={model} /></Breathing>;
}

function Breathing({ level, children }: { level: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const s = 1 + level * 0.035;
    ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, s, 10, dt));
  });
  return <group ref={ref}>{children}</group>;
}

/* ---------- procedural head ------------------------------------------------------------------ */

const g = (v: number, s: number) => Math.exp(-((v / s) ** 2));

function sculptHead(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 160, 160);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let { x, y, z } = v;
    // skull proportions: narrower than tall, slightly deep
    x *= 0.74;
    z *= 0.86;
    y *= 1.04;
    // taper the lower half into a jaw and chin
    if (y < 0) {
      const t = Math.min(1, -y / 1.04);
      const taper = 1 - 0.42 * t ** 1.6;
      x *= taper;
      z *= 1 - 0.22 * t ** 2;
    }
    // back of the skull a little fuller
    if (z < 0) z *= 1.06;

    if (z > 0) {
      const front = Math.min(1, z / 0.6);
      const ax = Math.abs(x);
      // flatten the face plane
      z -= 0.07 * front * g(y + 0.05, 0.6);
      // brow ridge
      z += 0.05 * front * g(ax - 0.24, 0.2) * g(y - 0.28, 0.06);
      // eye sockets
      z -= 0.085 * front * g(ax - 0.25, 0.11) * g(y - 0.13, 0.075);
      // eyeballs/lids (closed, serene)
      z += 0.035 * front * g(ax - 0.25, 0.08) * g(y - 0.12, 0.035);
      // nose bridge + tip
      z += 0.19 * front * g(x, 0.075 + 0.04 * Math.max(0, -y)) * g(y + 0.06, 0.2);
      z += 0.05 * front * g(x, 0.11) * g(y + 0.24, 0.05);
      // cheekbones
      z += 0.035 * front * g(ax - 0.3, 0.12) * g(y + 0.08, 0.12);
      // philtrum dip and lips
      z -= 0.02 * front * g(x, 0.05) * g(y + 0.33, 0.03);
      z += 0.05 * front * g(x, 0.17) * g(y + 0.4, 0.035);
      z += 0.045 * front * g(x, 0.14) * g(y + 0.49, 0.04);
      z -= 0.03 * front * g(x, 0.16) * g(y + 0.445, 0.01);
      // chin
      z += 0.06 * front * g(x, 0.16) * g(y + 0.78, 0.1);
      // temples pinch
      x -= Math.sign(x) * 0.03 * g(ax - 0.62, 0.15) * g(y - 0.25, 0.2);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function neckCables(): THREE.TubeGeometry[] {
  const cables: THREE.TubeGeometry[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 0.17 + (i % 3) * 0.03;
    const pts = [
      new THREE.Vector3(Math.cos(a) * r * 0.9, -0.62, Math.sin(a) * r * 0.8 - 0.05),
      new THREE.Vector3(Math.cos(a) * r, -1.0, Math.sin(a) * r * 0.9 - 0.05),
      new THREE.Vector3(Math.cos(a) * (r + 0.08), -1.35, Math.sin(a) * (r + 0.05) - 0.08),
      new THREE.Vector3(Math.cos(a + 0.4) * (r + 0.35), -1.75, Math.sin(a + 0.4) * (r + 0.2) - 0.1),
    ];
    cables.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.022 + (i % 2) * 0.01, 10, false));
  }
  return cables;
}

function SculptedHead({ level }: { level: number }) {
  const mat = useChromeMaterial(level);
  const dark = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#16161c", metalness: 0.9, roughness: 0.32, clearcoat: 0.6, iridescence: 0.6 }),
    [],
  );
  const head = useMemo(sculptHead, []);
  const cables = useMemo(neckCables, []);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ring.current) ring.current.rotation.z = state.clock.elapsedTime * 0.4;
  });

  return (
    <Breathing level={level}>
      <group position={[0, 0.32, 0]} scale={0.98}>
        <mesh geometry={head} material={mat} />
        {/* ear pods, echoing the reference's headphone-like modules */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.73, 0.02, -0.04]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <mesh material={mat}>
              <cylinderGeometry args={[0.2, 0.22, 0.12, 48]} />
            </mesh>
            <mesh ref={s === 1 ? ring : undefined} position={[0, 0, 0.07]} material={dark}>
              <torusGeometry args={[0.13, 0.025, 16, 48]} />
            </mesh>
          </group>
        ))}
        {/* neck column + collar */}
        <mesh position={[0, -0.92, -0.06]} material={dark}>
          <cylinderGeometry args={[0.2, 0.26, 0.7, 40, 1, true]} />
        </mesh>
        <mesh position={[0, -1.22, -0.06]} material={mat}>
          <torusGeometry args={[0.3, 0.05, 20, 64]} />
        </mesh>
        {cables.map((c, i) => (
          <mesh key={i} geometry={c} material={i % 3 === 0 ? mat : dark} />
        ))}
      </group>
    </Breathing>
  );
}

/** Studio of coloured light panels — this is what paints the magenta/cyan/violet reflections. */
function ChromeEnvironment() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} color="#fff4ea" />
      <directionalLight position={[-3, 1, 2]} intensity={0.7} color="#d8c8ff" />
      <pointLight position={[-2.5, 0.5, -1.5]} intensity={6} color={tokens.chrome.magenta} distance={8} />
      <pointLight position={[2.6, 0.2, -1.5]} intensity={6} color={tokens.chrome.cyan} distance={8} />
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#2a2638"]} />
      <Lightformer form="rect" intensity={2.4} color="#fff1e6" position={[0, 1, 5]} scale={[6, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={3} color={tokens.chrome.magenta} position={[-3.5, 1, 1]} scale={[2, 5, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={3} color={tokens.chrome.cyan} position={[3.5, 0, 1]} scale={[2, 5, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2} color={tokens.chrome.violet} position={[0, 4, -1]} scale={[8, 2, 1]} target={[0, 0, 0]} />
    </Environment>
    </>
  );
}
