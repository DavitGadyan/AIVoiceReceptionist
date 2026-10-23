"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/lib/tokens";

/**
 * "Ava" — a stylised 3D receptionist: young woman, blonde, big blue eyes, wearing a headset.
 * Everything is procedural (no assets). She blinks, her eyes follow the cursor and her mouth
 * opens with `level` (live voice amplitude), so the browser demo call visibly talks back.
 */

const SKIN = "#F3CBB6";
const HAIR = "#EBCB7D";
const HAIR_DEEP = "#C9A25A";
const IRIS = "#4F8FD6";
const LIPS = "#E4878D";
const BROW = "#B8935E";

const g = (v: number, s: number) => Math.exp(-((v / s) ** 2));

function sculptFace(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 160, 160);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let { x, y, z } = v;
    x *= 0.8;
    z *= 0.86;
    // soft, rounded jaw and a small chin
    if (y < 0) {
      const t = Math.min(1, -y);
      x *= 1 - 0.36 * t ** 1.8;
      z *= 1 - 0.12 * t ** 2;
    }
    if (z > 0) {
      const f = Math.min(1, z / 0.55);
      const ax = Math.abs(x);
      // full cheeks
      z += 0.05 * f * g(ax - 0.36, 0.16) * g(y + 0.18, 0.16);
      // very shallow eye beds so the big eyeballs sit in the face
      z -= 0.05 * f * g(ax - 0.27, 0.13) * g(y - 0.06, 0.1);
      // small button nose
      z += 0.075 * f * g(x, 0.07) * g(y + 0.17, 0.11);
      z += 0.03 * f * g(x, 0.1) * g(y + 0.26, 0.04);
      // chin
      z += 0.03 * f * g(x, 0.14) * g(y + 0.76, 0.1);
    }
    y *= 1.02;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function irisTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const grd = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, "#0b1530");
  grd.addColorStop(0.32, "#0b1530");
  grd.addColorStop(0.36, "#2d6cc0");
  grd.addColorStop(0.7, IRIS);
  grd.addColorStop(0.92, "#2a4f8f");
  grd.addColorStop(1, "#1a2b4f");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  // fibres
  ctx.strokeStyle = "rgba(190,225,255,.25)";
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 46, 128 + Math.sin(a) * 46);
    ctx.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function strand(points: [number, number, number][], radius: number, taper = true) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 64, radius, 14, false);
  if (taper) {
    // taper the tip so locks end softly
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const segs = 65;
    const ring = 15;
    for (let s = 0; s < segs; s++) {
      const t = s / (segs - 1);
      const k = 1 - 0.75 * t ** 2;
      const center = curve.getPoint(t);
      for (let r = 0; r < ring; r++) {
        const idx = s * ring + r;
        if (idx >= pos.count) break;
        const vx = pos.getX(idx) - center.x;
        const vy = pos.getY(idx) - center.y;
        const vz = pos.getZ(idx) - center.z;
        pos.setXYZ(idx, center.x + vx * k, center.y + vy * k, center.z + vz * k);
      }
    }
    geo.computeVertexNormals();
  }
  return geo;
}

function Eye({ side, look, blink }: { side: 1 | -1; look: React.RefObject<THREE.Vector2>; blink: React.RefObject<number> }) {
  const eye = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Mesh>(null);
  const iris = useMemo(irisTexture, []);
  const skin = useMemo(() => new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#ffd2c6") }), []);

  useFrame((_, dt) => {
    if (eye.current && look.current) {
      eye.current.rotation.y = THREE.MathUtils.damp(eye.current.rotation.y, look.current.x * 0.35, 8, dt);
      eye.current.rotation.x = THREE.MathUtils.damp(eye.current.rotation.x, look.current.y * 0.25, 8, dt);
    }
    if (lid.current) {
      // upper lid rotates down over the eye: 0 = open, 1 = closed
      lid.current.rotation.x = -1.85 + (blink.current ?? 0) * 3.3;
    }
  });

  const r = 0.172;
  return (
    <group position={[side * 0.275, 0.05, 0.7]}>
      <group ref={eye}>
        <mesh>
          <sphereGeometry args={[r, 48, 48]} />
          <meshPhysicalMaterial color="#fbfbff" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} />
        </mesh>
        <mesh position={[0, 0, r * 0.93]} scale={[1, 1, 0.35]}>
          <sphereGeometry args={[r * 0.62, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial map={iris} roughness={0.15} clearcoat={1} />
        </mesh>
        {/* catchlights */}
        <mesh position={[r * 0.28, r * 0.3, r * 1.02]}>
          <sphereGeometry args={[r * 0.13, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-r * 0.22, -r * 0.22, r * 1.0]}>
          <sphereGeometry args={[r * 0.06, 12, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {/* upper eyelid shell */}
      <mesh ref={lid} material={skin} rotation={[-1.85, 0, 0]}>
        <sphereGeometry args={[r * 1.05, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* lash line */}
      <mesh position={[0, r * 0.32, r * 0.8]} rotation={[0.45, 0, Math.PI * 0.05 + side * 0.06]}>
        <torusGeometry args={[r * 0.95, r * 0.075, 8, 40, Math.PI * 0.9]} />
        <meshStandardMaterial color="#2a1e1a" roughness={0.6} />
      </mesh>
      {/* outer flick */}
      <mesh position={[side * r * 0.98, r * 0.5, r * 0.55]} rotation={[0, 0, side * -0.6]}>
        <capsuleGeometry args={[r * 0.05, r * 0.35, 4, 8]} />
        <meshStandardMaterial color="#2a1e1a" />
      </mesh>
    </group>
  );
}

function Mouth({ level }: { level: React.RefObject<number> }) {
  const open = useRef<THREE.Mesh>(null);
  const lower = useRef<THREE.Mesh>(null);
  const t0 = useRef(0);
  useFrame((state, dt) => {
    const lv = level.current ?? 0;
    // add a little syllable flutter while speaking
    t0.current += dt;
    const flutter = lv > 0.04 ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 18) : 0;
    const target = Math.min(1, lv * 1.6) * (0.6 + 0.4 * flutter);
    if (open.current) {
      const s = THREE.MathUtils.damp(open.current.scale.y, 0.15 + target * 1.1, 18, dt);
      open.current.scale.y = s;
    }
    if (lower.current) lower.current.position.y = THREE.MathUtils.damp(lower.current.position.y, -0.035 - target * 0.05, 18, dt);
  });
  return (
    <group position={[0, -0.43, 0.745]}>
      <mesh ref={open} scale={[1, 0.15, 0.6]}>
        <sphereGeometry args={[0.085, 32, 16]} />
        <meshStandardMaterial color="#5a1f28" roughness={0.8} />
      </mesh>
      {/* upper lip (cupid's bow approximated with two lobes) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.04, 0.02, 0.02]} rotation={[0, 0, s * -0.25]} scale={[1, 0.42, 0.55]}>
          <sphereGeometry args={[0.065, 24, 16]} />
          <meshPhysicalMaterial color={LIPS} roughness={0.35} clearcoat={0.6} />
        </mesh>
      ))}
      <mesh ref={lower} position={[0, -0.035, 0.02]} scale={[1.6, 0.48, 0.6]}>
        <sphereGeometry args={[0.07, 24, 16]} />
        <meshPhysicalMaterial color={LIPS} roughness={0.3} clearcoat={0.7} />
      </mesh>
      {/* smile: a soft upturned crease under the lower lip and lifted corners */}
      <mesh>
        <tubeGeometry
          args={[
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.17, 0.035, -0.02),
              new THREE.Vector3(-0.12, -0.035, 0.03),
              new THREE.Vector3(0, -0.085, 0.05),
              new THREE.Vector3(0.12, -0.035, 0.03),
              new THREE.Vector3(0.17, 0.035, -0.02),
            ]),
            40, 0.006, 8, false,
          ]}
        />
        <meshStandardMaterial color="#b85f6a" />
      </mesh>
    </group>
  );
}

export function Avatar({ level = 0 }: { level?: number }) {
  const levelRef = useRef(level);
  levelRef.current = level;
  const look = useRef(new THREE.Vector2());
  const blink = useRef(0);
  const nextBlink = useRef(2);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      look.current.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t > nextBlink.current) {
      const p = (t - nextBlink.current) / 0.16; // 160ms blink
      blink.current = p < 1 ? Math.sin(p * Math.PI) : 0;
      if (p >= 1) nextBlink.current = t + 2.5 + Math.random() * 3;
    }
  });

  const face = useMemo(sculptFace, []);
  const skin = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: SKIN, roughness: 0.52, sheen: 0.5, sheenColor: new THREE.Color("#ffd0c4"), sheenRoughness: 0.6,
        clearcoat: 0.08, emissive: new THREE.Color("#3a120c"), emissiveIntensity: 0.12,
      }),
    [],
  );
  const hair = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: HAIR, roughness: 0.42, sheen: 1, sheenColor: new THREE.Color("#fff3c8"), sheenRoughness: 0.35, clearcoat: 0.3,
        clearcoatRoughness: 0.4,
      }),
    [],
  );
  const hairDeep = useMemo(() => new THREE.MeshPhysicalMaterial({ color: HAIR_DEEP, roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color("#ffe6a8") }), []);
  const chrome = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: tokens.chrome.base, metalness: 1, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6,
        iridescenceThicknessRange: [200, 800], clearcoat: 1,
      }),
    [],
  );
  const blush = useMemo(() => radialTexture("rgba(240,130,140,.55)", "rgba(240,130,140,0)"), []);

  // Hair: cap over the skull, a fringe sweeping across the forehead, long locks framing the face.
  const cap = useMemo(() => {
    const geo = new THREE.SphereGeometry(1.07, 96, 96);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      let { x, y, z } = v;
      x *= 0.86;
      z *= 0.93;
      // pull the front-lower region behind the face so only a hairline remains
      const front = z > 0.25 && y < 0.5;
      if (front) z -= 0.55 * Math.min(1, (z - 0.25) / 0.5) * Math.min(1, (0.5 - y) / 0.3);
      // fuller crown, volume at the sides
      y += 0.06 * Math.max(0, y);
      x *= 1 + 0.06 * g(y - 0.1, 0.5);
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const locks = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; deep?: boolean }[] = [];
    // side-swept fringe
    for (let i = 0; i < 7; i++) {
      const s = i / 6;
      out.push({
        geo: strand(
          [
            [0.15 - s * 0.05, 0.98, 0.42],
            [0.05 - s * 0.28, 0.78, 0.66],
            [-0.12 - s * 0.38, 0.52, 0.7],
            [-0.3 - s * 0.38, 0.3 - s * 0.05, 0.58],
          ],
          0.075 - s * 0.004,
        ),
        deep: i % 3 === 2,
      });
    }
    // face-framing locks, both sides, down past the shoulders
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const o = i * 0.05;
        out.push({
          geo: strand(
            [
              [side * (0.6 + o * 0.4), 0.7, 0.3 - o],
              [side * (0.74 + o * 0.5), 0.1, 0.32 - o],
              [side * (0.72 + o * 0.6), -0.6, 0.18 - o],
              [side * (0.78 + o * 0.8), -1.25, 0.05 - o],
              [side * (0.86 + o), -1.75, -0.08 - o],
            ],
            0.1,
          ),
          deep: i % 2 === 1,
        });
      }
    }
    // back volume
    for (let i = 0; i < 9; i++) {
      const a = -0.9 + (i / 8) * 1.8;
      out.push({
        geo: strand(
          [
            [Math.sin(a) * 0.7, 0.5, -0.55],
            [Math.sin(a) * 0.95, -0.4, -0.55],
            [Math.sin(a) * 1.05, -1.4, -0.45],
            [Math.sin(a) * 1.1, -1.9, -0.35],
          ],
          0.2,
        ),
        deep: i % 2 === 0,
      });
    }
    return out;
  }, []);

  const browGeo = useMemo(
    () => (side: number) =>
      strand(
        [
          [side * 0.12, 0.31, 0.84],
          [side * 0.28, 0.345, 0.8],
          [side * 0.44, 0.3, 0.71],
        ],
        0.018,
      ),
    [],
  );

  const levelForMouth = useRef(0);
  useFrame(() => {
    levelForMouth.current = levelRef.current;
  });

  return (
    <group position={[0, 0.45, 0]} scale={0.84}>
      {/* face */}
      <mesh geometry={face} material={skin} />
      {/* ears (mostly hidden by hair) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.79, 0.0, 0.02]} scale={[0.35, 1, 0.6]} material={skin}>
          <sphereGeometry args={[0.17, 24, 24]} />
        </mesh>
      ))}
      <Eye side={-1} look={look} blink={blink} />
      <Eye side={1} look={look} blink={blink} />
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} geometry={browGeo(s)}>
          <meshStandardMaterial color={BROW} roughness={0.7} />
        </mesh>
      ))}
      {/* blush */}
      {[-1, 1].map((s) => (
        <mesh key={`bl${s}`} position={[s * 0.4, -0.18, 0.775]} rotation={[0, s * 0.5, 0]}>
          <planeGeometry args={[0.32, 0.22]} />
          <meshBasicMaterial map={blush} transparent depthWrite={false} />
        </mesh>
      ))}
      <Mouth level={levelForMouth} />

      {/* hair */}
      <mesh geometry={cap} material={hair} position={[0, 0.06, -0.06]} />
      {locks.map((l, i) => (
        <mesh key={i} geometry={l.geo} material={l.deep ? hairDeep : hair} />
      ))}

      {/* neck, shoulders, blazer */}
      <mesh position={[0, -1.05, -0.08]} material={skin}>
        <cylinderGeometry args={[0.24, 0.3, 0.6, 32]} />
      </mesh>
      <mesh position={[0, -1.95, -0.15]} scale={[1.42, 0.78, 0.8]}>
        <sphereGeometry args={[1, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#2E2B6E" roughness={0.6} sheen={0.6} sheenColor={new THREE.Color("#8a86ff")} />
      </mesh>
      {/* white collar V */}
      {[-1, 1].map((s) => (
        <mesh key={`col${s}`} position={[s * 0.17, -1.38, 0.32]} rotation={[0.3, 0, s * 0.55]}>
          <boxGeometry args={[0.26, 0.42, 0.04]} />
          <meshStandardMaterial color="#F4F3FA" roughness={0.6} />
        </mesh>
      ))}

      {/* headset in brand chrome: band, ear cup, mic boom */}
      <mesh position={[0, 0.02, -0.08]} rotation={[-0.12, 0, 0]} material={chrome}>
        <torusGeometry args={[1.08, 0.03, 12, 80, Math.PI]} />
      </mesh>
      <mesh position={[1.04, -0.02, -0.05]} rotation={[0, 0, Math.PI / 2]} material={chrome}>
        <cylinderGeometry args={[0.2, 0.2, 0.12, 40]} />
      </mesh>
      <mesh position={[-1.04, -0.02, -0.05]} rotation={[0, 0, Math.PI / 2]} material={chrome}>
        <cylinderGeometry args={[0.17, 0.17, 0.1, 40]} />
      </mesh>
      <mesh material={chrome}>
        <tubeGeometry
          args={[
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(1.06, -0.1, 0.05),
              new THREE.Vector3(0.95, -0.4, 0.45),
              new THREE.Vector3(0.55, -0.55, 0.78),
              new THREE.Vector3(0.26, -0.5, 0.86),
            ]),
            48, 0.018, 10, false,
          ]}
        />
      </mesh>
      <mesh position={[0.23, -0.5, 0.87]} rotation={[0, 0, Math.PI / 2]} material={chrome}>
        <capsuleGeometry args={[0.035, 0.06, 6, 12]} />
      </mesh>
    </group>
  );
}
