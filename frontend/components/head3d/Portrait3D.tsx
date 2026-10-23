"use client";

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/lib/tokens";

export const PORTRAIT_URL = "/images/receptionist.webp";
export const DEPTH_URL = "/images/receptionist-depth.png";

/**
 * Photoreal receptionist as a 3D relief: the portrait is displaced by its depth map on a dense
 * plane, so turning it with the cursor gives real parallax (nose, cheeks and hair move against
 * each other). Edges fade into the page; `level` adds a soft violet rim while she is speaking.
 */
export function Portrait3D({ level = 0 }: { level?: number }) {
  const [photo, depth] = useTexture([PORTRAIT_URL, DEPTH_URL]);
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.anisotropy = 8;
  const aspect = photo.image ? (photo.image as HTMLImageElement).width / (photo.image as HTMLImageElement).height : 896 / 1152;
  const h = 3.1;
  const w = h * aspect;

  const geo = useMemo(() => new THREE.PlaneGeometry(w, h, 280, Math.round(280 / aspect)), [w, h, aspect]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uPhoto: { value: photo },
          uDepth: { value: depth },
          uScale: { value: 0.42 },
          uLevel: { value: 0 },
          uRim: { value: new THREE.Color(tokens.color.accent2) },
          uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D uDepth; uniform float uScale; uniform vec2 uTexel;
          varying vec2 vUv; varying float vD;
          float sampleD(vec2 uv) {
            // small blur so hair/background edges don't tear when the plane turns
            float d = 0.0;
            for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++)
              d += texture2D(uDepth, uv + vec2(float(x), float(y)) * uTexel * 2.0).r;
            return d / 25.0;
          }
          void main() {
            vUv = uv;
            float d = sampleD(uv);
            vD = d;
            vec3 p = position + normal * (d - 0.35) * uScale;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uPhoto; uniform float uLevel; uniform vec3 uRim;
          varying vec2 vUv; varying float vD;
          void main() {
            vec4 c = texture2D(uPhoto, vUv);
            // key out the studio backdrop with the depth map so only she remains,
            // and dissolve the shoulders into the page like the template's floating head
            float subject = smoothstep(0.14, 0.32, vD);
            float ey = smoothstep(0.0, 0.34, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
            float ex = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
            // speaking glow on her silhouette (mid-depth band)
            float rim = smoothstep(0.12, 0.3, vD) * (1.0 - smoothstep(0.3, 0.55, vD));
            vec3 col = c.rgb + uRim * rim * uLevel * 0.45;
            gl_FragColor = vec4(col, subject * ex * ey);
            #include <colorspace_fragment>
          }`,
      }),
    [photo, depth],
  );

  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    mat.uniforms.uLevel.value = THREE.MathUtils.damp(mat.uniforms.uLevel.value, level, 10, dt);
    if (group.current) {
      const t = state.clock.elapsedTime;
      // gentle breathing plus a slight lean-in while talking
      const s = 1 + Math.sin(t * 1.1) * 0.006 + level * 0.02;
      group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, s, 8, dt));
    }
  });

  return (
    <group ref={group} position={[0, -0.22, 0]}>
      <mesh geometry={geo} material={mat} />
    </group>
  );
}
