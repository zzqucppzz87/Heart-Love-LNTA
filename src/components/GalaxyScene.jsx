import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initHeartAndPhotos, updateHeartAndPhotos, disposeHeartAndPhotos, heartPhotosConfig, getLyricsCompletedOneCycle } from '../heartPhotos';

const INTRO_BLACK_RATIO = 0.1;
const PHASE0_DURATION = 6;   /* zoom in galaxy — từ từ, thấy galaxy rồi mới bật nhạc */
const PHASE1_DURATION = 21;  /* spiral quay 1 vòng (21 giây) */
const PHASE3_DURATION = 2.5; /* hình cầu + spiral bung ra */
const PHASE2_DURATION = 4.5; /* zoom in dần tới trước tim (chậm hơn một chút) */
const RING_RADIUS = 6.5;    /* vòng spin; camera đứng ngoài vòng */
const HEART_VIEW_DISTANCE = Math.max(RING_RADIUS + 3, 10) + 4; /* ngoài vòng ring, đứng xa tim một xí */
const PHASE4_CAMERA_DURATION = 2.5; /* sau khi lyrics hết 1 vòng: camera lùi + nghiêng lên rồi mở gallery */
const EXPAND_SCALE = 1.5;  /* bán kính hình cầu lớn gấp x1.5 khi bung */
/* Phase 3 kích hoạt khi camera vào trong bán kính hình cầu; < cameraEndPos.length() (~21.4) để phase 2 chạy mượt */
const SPHERE_RADIUS_TRIGGER = 20;

/** Tự đếm số ảnh trong photosSpiral (1.jpg, 2.jpg, ...) bằng HEAD request đến khi 404 */
async function probeSpiralPhotoCount() {
  const max = 60;
  for (let i = 1; i <= max; i++) {
    try {
      const r = await fetch(`/photosSpiral/${i}.jpg`, { method: 'HEAD' });
      if (!r.ok) return i - 1;
    } catch {
      return i - 1;
    }
  }
  return max;
}

// Camera đứng xa hơn một chút khi xem spiral quay
const cameraEndPos = new THREE.Vector3(0, 4, 28);
const cameraStartDistance = 280;
const ACTIVATION_RADIUS = 10;
const ASSEMBLE_RADIUS = 30;
const DISPERSE_SPHERE_RADIUS = 10 * EXPAND_SCALE;

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

export default function GalaxyScene({ containerRef, skipRef, onGalaxyVisible }) {
  const phase1StartTimeRef = useRef(null);
  const phase3StartTimeRef = useRef(null);
  const phase4StartTimeRef = useRef(null);
  const galaxyVisibleFiredRef = useRef(false);
  const debugRef = useRef({
    phase3Logged: false,
    introDoneLogged: false,
    lyricsCycleLogged: false,
    phase4StartLogged: false,
    phase4CameraDoneLogged: false,
  });

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    let cancelled = false;
    let cleanupFn = null;

    (async () => {
      const spiralCount = await probeSpiralPhotoCount();
      if (cancelled) return;
      const ringN = Math.max(1, heartPhotosConfig.ringPhotoCount ?? 13);
      const spiralN = Math.max(1, spiralCount || 31);
      const ringPhotoUrls = Array.from({ length: ringN }, (_, i) => `/photosRing/${i + 1}.jpg`);
      const spiralPhotoUrls = Array.from({ length: spiralN }, (_, i) => `/photosSpiral/${i + 1}.jpg`);

      const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x160016);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.copy(cameraEndPos).normalize().multiplyScalar(cameraStartDistance);
    const cameraZoomStart = camera.position.clone();
    /* Camera đứng trước tim (trục +Z), nhìn tim và ring thẳng đứng không nghiêng */
    const heartViewPos = new THREE.Vector3(0, 0, HEART_VIEW_DISTANCE);
    /* Phase 4: camera lùi ra 4 đơn vị, nghiêng lên nhìn chính diện gallery */
    const phase4CameraPos = new THREE.Vector3(0, 0, HEART_VIEW_DISTANCE + 4);
    const phase4TargetEnd = new THREE.Vector3(0, 3.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 5;
    controls.maxDistance = 400;
    controls.enabled = false;

    const gu = { time: { value: 0 } };
    const guDisperse = { value: 0 };
    const guDisperseSphereScale = { value: 1 }; /* 1 → EXPAND_SCALE (x1.5) khi bung (phase 3) */
    let disperseTarget = 0;

    const sizes = [];
    const shift = [];
    const pushShift = () => {
      shift.push(
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
        (Math.random() * 0.9 + 0.1) * Math.PI * 0.1,
        Math.random() * 0.9 + 0.1
      );
    };

    const pts = new Array(25000).fill().map(() => {
      sizes.push(Math.random() * 1.5 + 0.5);
      pushShift();
      return new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.5 + 9.5);
    });
    for (let i = 0; i < 50000; i++) {
      const r = 10, R = 40;
      const rand = Math.pow(Math.random(), 1.5);
      const radius = Math.sqrt(R * R * rand + (1 - rand) * r * r);
      pts.push(new THREE.Vector3().setFromCylindricalCoords(radius, Math.random() * 2 * Math.PI, (Math.random() - 0.5) * 2));
      sizes.push(Math.random() * 1.5 + 0.5);
      pushShift();
    }

    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('sizes', new THREE.Float32BufferAttribute(sizes, 1));
    g.setAttribute('shift', new THREE.Float32BufferAttribute(shift, 4));
    const chaosPositions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const c = new THREE.Vector3().randomDirection().multiplyScalar(DISPERSE_SPHERE_RADIUS);
      chaosPositions[i * 3] = c.x;
      chaosPositions[i * 3 + 1] = c.y;
      chaosPositions[i * 3 + 2] = c.z;
    }
    g.setAttribute('aChaosPos', new THREE.BufferAttribute(chaosPositions, 3));

    const m = new THREE.PointsMaterial({
      size: 0.1,
      transparent: true,
      blending: THREE.AdditiveBlending,
      onBeforeCompile: (shader) => {
        shader.uniforms.time = gu.time;
        shader.uniforms.uDisperse = guDisperse;
        shader.uniforms.uDisperseSphereScale = guDisperseSphereScale;
        shader.vertexShader = `
          uniform float time;
          uniform float uDisperse;
          uniform float uDisperseSphereScale;
          attribute float sizes;
          attribute vec4 shift;
          attribute vec3 aChaosPos;
          varying vec3 vColor;
          ${shader.vertexShader}
        `.replace('gl_PointSize = size;', 'gl_PointSize = size * sizes;')
          .replace(
            '#include <color_vertex>',
            `#include <color_vertex>
            float d = length(abs(position) / vec3(40., 10., 40));
            d = clamp(d, 0., 1.);
            vColor = mix(vec3(227., 155., 0.), vec3(100., 50., 255.), d) / 255.;
          `
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec3 chaosScaled = aChaosPos * uDisperseSphereScale;
            vec3 basePos = mix(position, chaosScaled, uDisperse);
            transformed = basePos;
            float t = time;
            float moveT = mod(shift.x + shift.z * t, PI2);
            float moveS = mod(shift.y + shift.z * t, PI2);
            transformed += vec3(cos(moveS) * sin(moveT), cos(moveT), sin(moveS) * sin(moveT)) * shift.a * (1.0 - uDisperse);
          `
          );
        shader.fragmentShader = `
          varying vec3 vColor;
          ${shader.fragmentShader}
        `.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          float d = length(gl_PointCoord.xy - 0.5);
          if (d > 0.5) discard;
        `
        ).replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.2, d) * 0.5 + 0.5 );');
      },
    });

    const p = new THREE.Points(g, m);
    p.rotation.order = 'ZYX';
    p.rotation.z = 0.2;
    scene.add(p);

    /* Ảnh spiral phân bố trên mặt cầu trùng với quả cầu lớn (DISPERSE_SPHERE_RADIUS × expansionScale) */
    initHeartAndPhotos({
      scene,
      camera,
      renderer,
      photoUrls: spiralPhotoUrls,
      ringPhotoUrls,
      parent: p,
      configOverrides: { disperseSphereRadius: DISPERSE_SPHERE_RADIUS },
    });

    const clock = new THREE.Clock();

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let frameId;
    const loop = () => {
      // IMPORTANT: getElapsedTime() internally calls getDelta().
      // If we call getElapsedTime() and then getDelta() again, dt becomes ~0 each frame.
      // That breaks animations that rely on dt (e.g. gallery image cycling).
      const dt = clock.getDelta();
      let elapsed = clock.elapsedTime;
      if (skipRef?.current && phase3StartTimeRef.current == null) {
        phase3StartTimeRef.current = 0;
        elapsed = PHASE3_DURATION + 0.5;
      }
      const t = elapsed * 0.5;
      gu.time.value = t * Math.PI;
      controls.target.set(0, 0, 0);

      const phase1Start = phase1StartTimeRef.current ?? PHASE0_DURATION;
      const phase1End = phase1Start + PHASE1_DURATION;
      const inPhase2 = elapsed >= phase1End && phase3StartTimeRef.current == null;
      if (inPhase2 && camera.position.length() <= SPHERE_RADIUS_TRIGGER) {
        phase3StartTimeRef.current = elapsed;
      }
      const phase3Start = phase3StartTimeRef.current;
      const inPhase3 = phase3Start != null && elapsed - phase3Start < PHASE3_DURATION;
      const introDone = phase3Start != null && elapsed - phase3Start >= PHASE3_DURATION;
      const heartFacingCamera = elapsed >= phase1End;
      /* Khi camera zoom tới trái tim: trái tim và camera không xoay vòng; chỉ quả cầu lớn và ring xoay */
      const cameraAtHeart = heartViewPos.distanceTo(camera.position) < 0.8;

      // ---- DEBUG LOGS (phase flow) ----
      if (phase3Start != null && !debugRef.current.phase3Logged) {
        debugRef.current.phase3Logged = true;
        console.log("[GalaxyScene debug] phase3Start", { elapsed, phase3Start });
      }
      if (introDone && !debugRef.current.introDoneLogged) {
        debugRef.current.introDoneLogged = true;
        console.log("[GalaxyScene debug] introDone", { elapsed, phase3Start });
      }
      const lyricsDone = getLyricsCompletedOneCycle();
      if (lyricsDone && !debugRef.current.lyricsCycleLogged) {
        debugRef.current.lyricsCycleLogged = true;
        console.log("[GalaxyScene debug] lyricsCompletedOneCycle -> true", { elapsed });
      }

      if (introDone && getLyricsCompletedOneCycle() && phase4StartTimeRef.current == null) {
        phase4StartTimeRef.current = elapsed;
      }
      const phase4Start = phase4StartTimeRef.current;
      const inPhase4 = phase4Start != null;
      const phase4Elapsed = inPhase4 ? elapsed - phase4Start : 0;
      const phase4CameraDone = phase4Elapsed >= PHASE4_CAMERA_DURATION;

      if (inPhase4 && !debugRef.current.phase4StartLogged) {
        debugRef.current.phase4StartLogged = true;
        console.log("[GalaxyScene debug] phase4Start", { elapsed, phase4Start });
      }
      if (inPhase4 && phase4CameraDone && !debugRef.current.phase4CameraDoneLogged) {
        debugRef.current.phase4CameraDoneLogged = true;
        console.log("[GalaxyScene debug] phase4CameraDone (showGalleryAboveHeart should be TRUE)", {
          elapsed,
          phase4Elapsed,
          phase4CameraDone,
        });
      }

      if (inPhase4) {
        /* Phase 4: chỉ camera + tim + gallery đứng yên; ring và phần khác vẫn xoay (p.rotation.y chạy) */
        p.scale.setScalar(1);
        guDisperseSphereScale.value = EXPAND_SCALE;
        heartPhotosConfig.expansionScale = EXPAND_SCALE;
        disperseTarget = 1;
        p.rotation.y = (elapsed - phase3Start - PHASE3_DURATION) * 0.3 + Math.PI * 2;
        p.rotation.z = 0;
        if (!phase4CameraDone) {
          const t = easeOutCubic(phase4Elapsed / PHASE4_CAMERA_DURATION);
          camera.position.lerpVectors(heartViewPos, phase4CameraPos, t);
          controls.target.lerpVectors(new THREE.Vector3(0, 0, 0), phase4TargetEnd, t);
        } else {
          camera.position.copy(phase4CameraPos);
          controls.target.copy(phase4TargetEnd);
        }
      } else if (elapsed < PHASE0_DURATION) {
        const introT = Math.min(1, elapsed / PHASE0_DURATION);
        if (introT >= INTRO_BLACK_RATIO) {
          if (!galaxyVisibleFiredRef.current && typeof onGalaxyVisible === 'function') {
            galaxyVisibleFiredRef.current = true;
            // Đánh dấu thời điểm bắt đầu Phase 1 khi galaxy bắt đầu hiện
            phase1StartTimeRef.current = elapsed;
            onGalaxyVisible();
          }
          const zoomT = (introT - INTRO_BLACK_RATIO) / (1 - INTRO_BLACK_RATIO);
          const easeZoom = easeOutCubic(zoomT);
          camera.position.lerpVectors(cameraZoomStart, cameraEndPos, easeZoom);
          p.scale.setScalar(easeZoom);
          // Bắt đầu xoay galaxy ngay khi thấy galaxy
          if (phase1StartTimeRef.current != null) {
            const phase1Elapsed = elapsed - phase1StartTimeRef.current;
            const phase1T = Math.min(1, phase1Elapsed / PHASE1_DURATION);
            p.rotation.y = phase1T * Math.PI * 2;
          } else {
            p.rotation.y = 0;
          }
        } else {
          camera.position.copy(cameraZoomStart);
          p.scale.setScalar(0);
          p.rotation.y = 0;
        }
        disperseTarget = 0;
        guDisperseSphereScale.value = 1;
        heartPhotosConfig.expansionScale = 1;
      } else if (phase1StartTimeRef.current == null) {
        // Fallback: nếu chưa có phase1StartTime, dùng logic cũ
        phase1StartTimeRef.current = PHASE0_DURATION;
        const phase1T = Math.min(1, (elapsed - PHASE0_DURATION) / PHASE1_DURATION);
        p.rotation.y = phase1T * Math.PI * 2;
        p.scale.setScalar(1);
        camera.position.copy(cameraEndPos);
        disperseTarget = 0;
        guDisperseSphereScale.value = 1;
        heartPhotosConfig.expansionScale = 1;
      } else if (elapsed < phase1StartTimeRef.current + PHASE1_DURATION) {
        // Phase 1: galaxy xoay 1 vòng trong 20 giây từ khi bắt đầu thấy galaxy
        const phase1Elapsed = elapsed - phase1StartTimeRef.current;
        const phase1T = Math.min(1, phase1Elapsed / PHASE1_DURATION);
        p.rotation.y = phase1T * Math.PI * 2;
        p.scale.setScalar(1);
        camera.position.copy(cameraEndPos);
        disperseTarget = 0;
        guDisperseSphereScale.value = 1;
        heartPhotosConfig.expansionScale = 1;
      } else if (phase3Start == null) {
        /* Phase 2: zoom in từ từ tới trước tim (ease); phase 3 khi camera vào bán kính SPHERE_RADIUS_TRIGGER */
        const phase2Start = phase1End;
        const phase2T = Math.min(1, (elapsed - phase2Start) / PHASE2_DURATION);
        const ease = easeOutCubic(phase2T);
        camera.position.lerpVectors(cameraEndPos, heartViewPos, ease);
        p.scale.setScalar(1);
        const targetRotY = Math.PI * 2;
        p.rotation.y += (targetRotY - p.rotation.y) * Math.min(1, dt * 6);
        disperseTarget = 1;
        guDisperseSphereScale.value = 1;
        heartPhotosConfig.expansionScale = 1;
      } else if (inPhase3) {
        const phase3T = (elapsed - phase3Start) / PHASE3_DURATION;
        const ease = easeOutCubic(phase3T);
        const scale = 1 + (EXPAND_SCALE - 1) * ease;
        guDisperseSphereScale.value = scale;
        heartPhotosConfig.expansionScale = scale;
        /* Zoom in từ từ tới trước tim (không nhảy), lerp theo dt để mượt hơn */
        const camLerp = Math.min(1, dt * 2.2);
        camera.position.lerp(heartViewPos, camLerp);
        p.scale.setScalar(1);
        p.rotation.y = Math.PI * 2;
        disperseTarget = 1;
      } else {
        camera.position.copy(heartViewPos);
        p.scale.setScalar(1);
        guDisperseSphereScale.value = EXPAND_SCALE;
        heartPhotosConfig.expansionScale = EXPAND_SCALE;
        disperseTarget = 1;
        p.rotation.y = (elapsed - phase3Start - PHASE3_DURATION) * 0.3 + Math.PI * 2;
      }

      /* Tim + ring cùng trục đứng với camera khi đứng trước tim hoặc phase 4 (gallery) */
      p.rotation.z = (cameraAtHeart || inPhase4) ? 0 : 0.2;

      // Làm mượt quá trình bung/thu (tránh nhảy cứng 1 frame do dt * 2000/4000 ~ clamp = 1)
      const dampSpeed = disperseTarget > guDisperse.value ? 3.0 : 4.5;
      guDisperse.value += (disperseTarget - guDisperse.value) * Math.min(1, dt * dampSpeed);
      if (disperseTarget === 0 && guDisperse.value < 0.01) guDisperse.value = 0;
      /* Khi zoom tới tim: camera không xoay (up = 0,1,0 cố định). Chỉ quả cầu lớn + ring xoay */
      camera.up.set(0, 1, 0);
      updateHeartAndPhotos(dt, t * Math.PI, guDisperse.value, {
        heartFacingCamera: inPhase4 ? true : heartFacingCamera,
        cameraAtHeart: inPhase4 ? false : cameraAtHeart,
        showGalleryAboveHeart: inPhase4 && phase4CameraDone,
        ringAtHeartLevel: cameraAtHeart || inPhase4,
        /* Photo spiral khóa phase = rotation spiral để quay cùng */
        spiralRotationY: p.rotation.y,
      });
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    cleanupFn = () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (container && renderer.domElement) container.removeChild(renderer.domElement);
      disposeHeartAndPhotos();
    };
    })();

    return () => {
      cancelled = true;
      if (cleanupFn) cleanupFn();
    };
  }, [containerRef, skipRef, onGalaxyVisible]);

  return null;
}
