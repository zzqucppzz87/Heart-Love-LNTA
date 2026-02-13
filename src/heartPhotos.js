/**
 * Heart + Photo Spiral — integrates 3D heart at galaxy core and photo planes on spiral arms.
 * Reuses existing scene/camera/renderer/controls; add to animation loop and init once.
 */

import * as THREE from "three";

// ——— Config (tweak easily) ———
export const heartPhotosConfig = {
  arms: 3,
  turns: 2.3,
  rMin: 14.0,
  rMax: 32.0,
  rMaxExpanded: 32.0,
  rMaxCollapsed: 18.0,
  thickness: 1.2,
  tPower: 1.6,
  orbitSpeed: 16,
  focusDistance: 5,
  photoSize: 1.2,
  photoAspect: 4 / 3,
  pulseSpeed: 2.2,
  pulseScaleAmt: 0.12,
  dimmedOpacity: 0.15,
  lerpFactor: 0.08,
  focusLerpFactor: 0.1,
  ringRadius: 5.0,
  ringAtHeartY: -3.5, /* khi camera zoom tới tim: tâm ring dịch xuống (Y) tới đáy/chóp tim; ring vẫn xoay */
  ringSpinSpeed: 0.15,
  ringPhotoSize: 0.85,
  ringPhotoAspect: 4 / 3,
  disperseSphereRadius: 25, /* ghi đè bởi GalaxyScene (DISPERSE_SPHERE_RADIUS), ảnh spiral phân bố đều trên mặt cầu đó */
  expansionScale: 1, /* 1 → 1.5 khi bung hình cầu (intro phase 3, EXPAND_SCALE) */
  /* Mặt trái tim hướng về camera: camera ở +Z nên mặt BOTTOM (local -Y) hướng về camera */
  heartFaceToCamera: "HEART_FACE_BOTTOM",
  /* Ảnh trên tim: tắt = chỉ trái tim hạt sáng như spiral, không hiện ảnh */
  heartImageEnabled: false,
  heartImageUrl: "/photoHeart/1.jpg",
  /* pixel tối dưới ngưỡng này sẽ mờ đi (0..1) — thấp hơn = ảnh hiện rõ hơn */
  heartImageThreshold: 0.05,
  /* 0..1: trộn màu ảnh vào hạt tim — 1.0 = rõ nét nhất */
  heartImageStrength: 1.0,
  /* Chỉ hiện ảnh khi camera đứng trước mặt tim (và disperse đã xong) */
  heartImageOnlyWhenFacing: true,
  /* Dot threshold: càng lớn càng phải đứng chính diện (0..1) */
  heartImageFacingDot: 0.62,
  /* Tốc độ fade in/out — lớn = hiện/ẩn nhanh (khoảng 50 = gần như hiện ngay) */
  heartImageFadeSpeed: 50.0,
  /* Chỉ một phần nhỏ giữa trái tim dùng để thể hiện ảnh (0.3–0.5 = 30–50% kích thước), tim vẫn hiện đầy đủ xung quanh */
  heartImageScale: 0.4,
  /* Tăng số hạt để ảnh trên tim nét hơn (càng cao càng nặng GPU) */
  heartParticleCount: 200000,
  /* Kích thước hạt tim (nhỏ hơn = nét hơn nhưng tối hơn) */
  heartPointSize: 0.045,
  /* Khi camera trước tim: ô trống hình viên nhộng (capsule ngang) — Rx = nửa chiều ngang (dài 2 đầu), Ry = nửa chiều dọc */
  heartCenterHoleRx: 0.32,
  heartCenterHoleRy: 0.11,
  /* Nền chữ: màu trắng nhạt (hoặc cùng tông với hạt) */
  heartCenterNoteBgColor: 0xffffff,
  heartCenterNoteBgOpacity: 0.72,
  /* Viền nền chữ (phân biệt với nền) */
  heartCenterNoteBgOutlineColor: 0xdd88aa,
  heartCenterNoteBgOutlineOpacity: 0.85,
  /* Dịch nền + note xuống cho khớp ô trống (âm = xuống) */
  heartCenterNoteOffsetY: -0.7,
  /* Số hạt trang trí trong khoảng trống con nhộng */
  heartCenterDotsCount: 720,
  /* Lyrics: mảng các dòng, lần lượt cuộn lên (dòng giữa rõ, 2 dòng đầu/cuối mờ nửa chữ) */
  heartCenterLyrics: [
    "Thanh An iu dấu ❤",
    "Mãi bên nhau em nhé",
    "Yêu em nhiều lắm",
    "Forever us",
  ],
  heartCenterLyricsDuration: 3.5,
};

/** Trái tim 3D có 6 hướng chuẩn (6 "mặt") — chọn mặt nào hướng về camera trong config.heartFaceToCamera */
export const HEART_FACES = {
  HEART_FACE_FRONT: new THREE.Vector3(0, 0, 1),   /* mặt trước (+Z) */
  HEART_FACE_BACK: new THREE.Vector3(0, 0, -1),    /* mặt sau (-Z) */
  HEART_FACE_RIGHT: new THREE.Vector3(1, 0, 0),   /* mặt phải (+X) */
  HEART_FACE_LEFT: new THREE.Vector3(-1, 0, 0),   /* mặt trái (-X) */
  HEART_FACE_TOP: new THREE.Vector3(0, 1, 0),     /* mặt trên (+Y) */
  HEART_FACE_BOTTOM: new THREE.Vector3(0, -1, 0), /* mặt dưới (-Y) */
};

let scene, camera, renderer, domElement;
let parentGroup;
let heartGroup, photosGroup, photoRingGroup, notesGroup;
let heartPointsNormalObject = null;
let heartPointsImageObject = null;
/** Plane phủ ảnh full resolution khi hiện ảnh — ảnh rõ nét, không phụ thuộc số hạt */
let heartImagePlaneMesh = null;
let photoMeshes = [];
let ringPhotoMeshes = [];
let noteSprites = [];
let photoMeta = [];
let noteMeta = [];
let focusedIndex = -1;
let expanded = true;
let currentRMax;
let raycaster, pointer, mouse;
let clock = new THREE.Clock();
const _tmpVec3 = new THREE.Vector3();
const _tmpVec3b = new THREE.Vector3();
const _tmpVec3c = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpQuat2 = new THREE.Quaternion();
const _heartFaceZQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
let heartTimeUniform = { value: 0 };
// Uniforms dùng chung để có thể update theo camera mỗi frame
let heartMapUniform = { value: null };
let heartMapEnabledUniform = { value: 0.0 };
let heartMapThresholdUniform = { value: heartPhotosConfig.heartImageThreshold ?? 0.18 };
let heartMapStrengthUniform = { value: heartPhotosConfig.heartImageStrength ?? 0.95 };
let heartMapScaleUniform = { value: heartPhotosConfig.heartImageScale ?? 0.4 };
let heartFaceUniform = { value: (HEART_FACES[heartPhotosConfig.heartFaceToCamera] || HEART_FACES.HEART_FACE_TOP).clone() };
/* Sau khi camera đứng trước tim: đếm ring quay 1 vòng (2π) rồi mới cho hiện ảnh photoHeart trên tim */
let ringAngleAccumulatedAtHeart = 0;
let ringCompletedOneLapSinceAtHeart = false;
/* Ô trống giữa tim + note: bật khi camera ở trước tim */
let heartCenterHoleUniform = { value: 0 };
let heartCenterHoleRxUniform = { value: 0.24 };
let heartCenterHoleRyUniform = { value: 0.11 };
let heartCenterNoteSprite = null;
let heartCenterNoteBgMesh = null;
let heartCenterNoteBgOutline = null; /* viền nền chữ */
let heartCenterDotsPoints = null;
/* Lyrics cuộn: mảng dòng, index hiện tại, canvas/texture để cập nhật. Dùng time (từ update) để tính index. */
let heartCenterLyricsLines = [];
let heartCenterLyricsIndex = 0;
let heartCenterLyricsTimeWhenHoleShown = null; /* time (đơn vị như tham số time) khi lần đầu showCenterHole */
let heartCenterLyricsCanvas = null;
let heartCenterLyricsTexture = null;

function createHeartPointsGeometry(particleCount) {
  const points = [];
  const edgeFlag = [];
  const targetCount = Math.max(1000, particleCount ?? 30000);
  const box = 1.4;
  const heartRadius = 3.5;
  const edgeThreshold = 0.12;
  let tries = 0;
  const maxTries = targetCount * 50;

  while (points.length / 3 < targetCount && tries < maxTries) {
    tries++;
    const x = (Math.random() * 2 - 1) * box;
    const y = (Math.random() * 2 - 1) * box;
    const z = (Math.random() * 2 - 1) * box;
    const x2 = x * x, y2 = y * y, z2 = z * z;
    const a = x2 + (9 / 4) * y2 + z2 - 1;
    const F = a * a * a - x2 * z * z * z - (9 / 80) * y2 * z * z * z;
    if (F <= 0) {
      const px = x * heartRadius, py = y * heartRadius, pz = z * heartRadius;
      const isEdge = F > -edgeThreshold ? 1 : 0;
      points.push(px, py, pz);
      edgeFlag.push(isEdge);
      /* Chỉ thêm hạt ở 2 núm trên (hai chóp), phần giữa giữ nguyên */
      if (y > 1.0) {
        points.push(px, py, pz);
        edgeFlag.push(isEdge);
        points.push(px, py, pz);
        edgeFlag.push(isEdge);
      }
    }
  }
  const n = points.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += points[i * 3];
    cy += points[i * 3 + 1];
    cz += points[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) {
    points[i * 3] -= cx;
    points[i * 3 + 1] -= cy;
    points[i * 3 + 2] -= cz;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geom.setAttribute("edge", new THREE.Float32BufferAttribute(edgeFlag, 1));
  return geom;
}

function createHeartPoints(opts) {
  const {
    timeUniform,
    particleCount = 30000,
    pointSize = 0.1,
    blending = THREE.AdditiveBlending,
    // Giữ "look" tim cũ: size hạt random rộng (0.4..0.9)
    sizeRandBase = 0.4,
    sizeRandRange = 0.5,
    heartImageTexture = null,
    heartImageEnabled = false,
    heartImageThreshold = 0.18,
    heartImageStrength = 0.95,
    heartFace = HEART_FACES[heartPhotosConfig.heartFaceToCamera] || HEART_FACES.HEART_FACE_TOP,
  } = opts;
  const geom = createHeartPointsGeometry(particleCount);
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const cnt = geom.getAttribute("position").count;
  const sizes = new Float32Array(cnt);
  for (let i = 0; i < cnt; i++) sizes[i] = Math.random() * sizeRandRange + sizeRandBase;
  geom.setAttribute("sizes", new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({
    size: pointSize,
    transparent: true,
    blending,
    depthWrite: false,
    vertexColors: false,
    sizeAttenuation: true,
    onBeforeCompile(shader) {
      shader.uniforms.time = timeUniform;
      // Bind uniforms dùng chung để update trong updateHeartAndPhotos()
      heartMapUniform.value = heartImageTexture || null;
      heartMapThresholdUniform.value = heartImageThreshold;
      heartMapStrengthUniform.value = heartImageStrength;
      heartFaceUniform.value.copy(heartFace);
      // mặc định tắt nếu chỉ muốn hiện khi zoom tới tim; updateHeartAndPhotos sẽ điều khiển enable/fade
      const onlyWhenFacing = !!heartPhotosConfig.heartImageOnlyWhenFacing;
      heartMapEnabledUniform.value = (heartImageEnabled && !!heartImageTexture && !onlyWhenFacing) ? 1.0 : 0.0;
      shader.uniforms.heartMap = heartMapUniform;
      shader.uniforms.heartMapEnabled = heartMapEnabledUniform;
      shader.uniforms.heartMapThreshold = heartMapThresholdUniform;
      shader.uniforms.heartMapStrength = heartMapStrengthUniform;
      shader.uniforms.heartMapScale = heartMapScaleUniform;
      shader.uniforms.heartCenterHole = heartCenterHoleUniform;
      shader.uniforms.heartCenterHoleRx = heartCenterHoleRxUniform;
      shader.uniforms.heartCenterHoleRy = heartCenterHoleRyUniform;
      shader.uniforms.heartFace = heartFaceUniform;
      shader.uniforms.bboxMin = { value: bb?.min ? bb.min.clone() : new THREE.Vector3(-5, -5, -5) };
      shader.uniforms.bboxMax = { value: bb?.max ? bb.max.clone() : new THREE.Vector3(5, 5, 5) };
      shader.vertexShader = `
        uniform float time;
        attribute float sizes;
        attribute float edge;
        varying vec3 vColor;
        varying float vEdge;
        varying vec2 vHeartUv;
        uniform vec3 heartFace;
        uniform vec3 bboxMin;
        uniform vec3 bboxMax;
        ${shader.vertexShader}
      `.replace(`gl_PointSize = size;`, `gl_PointSize = size * sizes * (1.0 + 0.14 * sin(time * 2.2)) * (1.0 + 0.9 * edge);`)
        .replace(`#include <color_vertex>`, `#include <color_vertex>
          vEdge = edge;
          float r = length(position);
          float d = clamp(r / 5.0, 0.0, 1.0);
          vColor = mix(vec3(227., 155., 0.), vec3(100., 50., 255.), d) / 255.;
          
          vec3 ap = abs(heartFace);
          vec3 size3 = max(bboxMax - bboxMin, vec3(1e-5));
          vec2 uv = vec2(0.5);
          if (ap.z >= ap.x && ap.z >= ap.y) {
            uv = vec2((position.x - bboxMin.x) / size3.x, (position.y - bboxMin.y) / size3.y);
            if (heartFace.z < 0.0) uv.x = 1.0 - uv.x;
          } else if (ap.x >= ap.y) {
            uv = vec2((position.z - bboxMin.z) / size3.z, (position.y - bboxMin.y) / size3.y);
            if (heartFace.x < 0.0) uv.x = 1.0 - uv.x;
          } else {
            uv = vec2((position.x - bboxMin.x) / size3.x, (position.z - bboxMin.z) / size3.z);
            if (heartFace.y < 0.0) uv.y = 1.0 - uv.y;
          }
          vHeartUv = clamp(uv, 0.0, 1.0);
        `);
      shader.fragmentShader = `
        varying vec3 vColor;
        varying float vEdge;
        varying vec2 vHeartUv;
        uniform sampler2D heartMap;
        uniform float heartMapEnabled;
        uniform float heartMapThreshold;
        uniform float heartMapStrength;
        uniform float heartMapScale;
        uniform float heartCenterHole;
        uniform float heartCenterHoleRx;
        uniform float heartCenterHoleRy;
        ${shader.fragmentShader}
      `.replace(`#include <clipping_planes_fragment>`, `#include <clipping_planes_fragment>
          float segHalf = max(0.0, heartCenterHoleRx - heartCenterHoleRy);
          float cx = clamp(vHeartUv.x - 0.5, -segHalf, segHalf);
          float dx = (vHeartUv.x - 0.5) - cx;
          float dy = (vHeartUv.y - 0.5);
          float distToSeg = sqrt(dx * dx + dy * dy);
          if (heartCenterHole > 0.5 && distToSeg < heartCenterHoleRy) discard;
          vec3 imgColor = vec3(1.0);
          float imageRegion = 0.0;
          if (heartMapEnabled > 0.5) {
            float scale = max(0.01, heartMapScale);
            vec2 uvCentered = (vHeartUv - (1.0 - scale) * 0.5) / scale;
            vec2 uvFlipped = vec2(uvCentered.x, 1.0 - uvCentered.y);
            float inBounds = step(0.0, uvFlipped.x) * step(uvFlipped.x, 1.0) * step(0.0, uvFlipped.y) * step(uvFlipped.y, 1.0);
            if (inBounds > 0.5) {
              vec4 t = texture2D(heartMap, uvFlipped);
              // Hiển thị màu ảnh gần như nguyên bản để thấy "như thật"
              imgColor = mix(vec3(1.0), t.rgb, clamp(heartMapStrength, 0.0, 1.0));
              imageRegion = 1.0;
            }
            /* Ngoài vùng ảnh: giữ nguyên màu trái tim */
          }
          // Pixel vùng ảnh: dùng "vuông" để tránh cảm giác mờ do hạt tròn
          float d = length(gl_PointCoord.xy - 0.5);
          if (imageRegion < 0.5 && d > 0.5) discard;
          float edgeGlow = 0.5 + 0.6 * vEdge;

          vec3 baseColor = vColor * edgeGlow;
          vec3 finalColor = mix(baseColor, imgColor, imageRegion);
          float heartAlpha = smoothstep(0.5, 0.2, d) * (0.5 + 0.5 * edgeGlow);
          float imageAlpha = 1.0;
          float finalAlpha = mix(heartAlpha, imageAlpha, imageRegion) * opacity;
        `).replace(`vec4 diffuseColor = vec4( diffuse, opacity );`, `vec4 diffuseColor = vec4( finalColor, finalAlpha );`);
    },
  });
  return new THREE.Points(geom, mat);
}

/* Phân bố đều theo kinh độ / vĩ độ (như trái đất): các vòng vĩ độ, mỗi vòng đều kinh độ. Trục cầu Z. */
function pointOnSphereLatLong(globalIndex, totalCount, r) {
  if (totalCount <= 1) return new THREE.Vector3(0, 0, r);
  const numLat = Math.max(2, Math.round(Math.sqrt(totalCount / 2)));
  const numLon = Math.max(3, Math.ceil(totalCount / numLat));
  const ring = Math.floor(globalIndex / numLon);
  const k = globalIndex % numLon;
  /* Vĩ độ: từ cực +Z xuống -Z, các vòng đều */
  const phi = Math.acos(1 - 2 * (ring + 0.5) / numLat);
  /* Kinh độ: đều trên vòng */
  const theta = (k / numLon) * Math.PI * 2;
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi)
  );
}

/* Global index cho ảnh/note: nửa ảnh nửa note trên mỗi vòng — ảnh chẵn, note lẻ (interleave). */
function globalIndexForPhoto(photoIndex, numPhotos, numNotes) {
  const total = numPhotos + numNotes;
  if (photoIndex <= (numNotes - 1)) return 2 * photoIndex;
  return numNotes * 2 + (photoIndex - numNotes);
}
function globalIndexForNote(noteIndex, numPhotos, numNotes) {
  return 2 * noteIndex + 1;
}

function spiralPosition(t, armIndex, phase, cfg, jitterY = 0) {
  const { turns, rMin, tPower } = cfg;
  const rMax = currentRMax;
  const theta = (t * turns * Math.PI * 2) + armIndex * (2 * Math.PI / cfg.arms) + phase;
  const r = rMin + Math.pow(t, tPower) * (rMax - rMin);
  return new THREE.Vector3(r * Math.cos(theta), 0, r * Math.sin(theta));
}

function createPhotoPlane(texture, index, cfg) {
  const w = cfg.photoSize;
  const h = cfg.photoSize / cfg.photoAspect;
  const geom = new THREE.PlaneGeometry(w, h);
  if (texture) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (texture.colorSpace !== undefined) texture.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0x333366,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.photoIndex = index;
  return mesh;
}

function createRingPhotoPlane(texture, index, cfg) {
  const w = cfg.ringPhotoSize ?? cfg.photoSize;
  const h = w / (cfg.ringPhotoAspect ?? cfg.photoAspect);
  const geom = new THREE.PlaneGeometry(w, h);
  if (texture) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (texture.colorSpace !== undefined) texture.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0x444466,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.ringPhotoIndex = index;
  return mesh;
}

function createNoteSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 200, 255, 0.8)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "white";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 2.4, 1);
  return sprite;
}

const LYRICS_CANVAS_W = 512;
const LYRICS_CANVAS_H = 256;
const LYRICS_LINE_HEIGHT = 55;
/* Font mềm Valentine: Quicksand (load từ index.html), fallback Segoe UI / sans-serif */
const LYRICS_FONT = "600 38px \"Quicksand\", \"Segoe UI\", sans-serif";
const LYRICS_FONT_MID = "600 50px \"Quicksand\", \"Segoe UI\", sans-serif";
const LYRICS_FADE_OPACITY = 0.5;
/* Màu chữ cho nền trắng: tối, tương phản tốt */
const LYRICS_FILL = "#6b2048";
const LYRICS_STROKE = "rgba(35, 8, 25, 0.95)";
const LYRICS_STROKE_WIDTH = 2;

/** Vẽ 3 dòng lyrics: trên/dưới mờ full chữ, giữa rõ. currentIndex = dòng đang là "giữa". */
function drawLyricsToCanvas(canvas, lines, currentIndex) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !lines.length) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const n = lines.length;
  const prevIdx = (currentIndex - 1 + n) % n;
  const nextIdx = (currentIndex + 1) % n;
  const cx = canvas.width / 2;
  const gap = LYRICS_LINE_HEIGHT;
  const yTop = canvas.height / 2 - gap;
  const yMid = canvas.height / 2;
  const yBot = canvas.height / 2 + gap;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
  ctx.shadowBlur = 4;

  function drawLine(text, y, alpha, font) {
    ctx.font = font || LYRICS_FONT;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LYRICS_STROKE;
    ctx.lineWidth = LYRICS_STROKE_WIDTH;
    ctx.lineJoin = "round";
    ctx.strokeText(text, cx, y);
    ctx.fillStyle = LYRICS_FILL;
    ctx.fillText(text, cx, y);
  }

  // Dòng trên: mờ, font nhỏ
  drawLine(lines[prevIdx], yTop, LYRICS_FADE_OPACITY, LYRICS_FONT);
  // Dòng giữa: rõ, font to hơn
  drawLine(lines[currentIndex], yMid, 1, LYRICS_FONT_MID);
  // Dòng dưới: mờ, font nhỏ
  drawLine(lines[nextIdx], yBot, LYRICS_FADE_OPACITY, LYRICS_FONT);
}

/** Tạo sprite lyrics dùng chung 1 canvas texture; cập nhật bằng drawLyricsToCanvas + texture.needsUpdate = true. */
function createLyricsSprite(lines) {
  const canvas = document.createElement("canvas");
  canvas.width = LYRICS_CANVAS_W;
  canvas.height = LYRICS_CANVAS_H;
  heartCenterLyricsCanvas = canvas;
  heartCenterLyricsLines = lines.length ? [...lines] : [];
  heartCenterLyricsIndex = 0;
  heartCenterLyricsTimeWhenHoleShown = null;
  drawLyricsToCanvas(canvas, heartCenterLyricsLines, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  heartCenterLyricsTexture = tex;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 2.4, 1);
  return sprite;
}

export function initHeartAndPhotos(opts) {
  const { scene: sc, camera: cam, renderer: ren, photoUrls = [], ringPhotoUrls = [], configOverrides = {}, parent = null } = opts;
  scene = sc;
  camera = cam;
  renderer = ren;
  domElement = ren.domElement;
  parentGroup = parent || scene;
  Object.assign(heartPhotosConfig, configOverrides);
  currentRMax = heartPhotosConfig.rMax;
  heartPhotosConfig.rMaxExpanded = heartPhotosConfig.rMax;

  const cfg = heartPhotosConfig;
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  // Ảnh khuôn cho hạt tim (đặt 1 ảnh trong public/photoHeart/)
  let heartImageTexture = null;
  if (cfg.heartImageEnabled && cfg.heartImageUrl) {
    heartImageTexture = textureLoader.load(
      cfg.heartImageUrl,
      (tex) => {
        tex.generateMipmaps = false;
        const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 0;
        tex.anisotropy = Math.min(16, maxAniso || 0);
        tex.needsUpdate = true;
      },
      undefined,
      (err) => console.warn("Heart image load error:", cfg.heartImageUrl, err)
    );
    heartImageTexture.minFilter = THREE.LinearFilter;
    heartImageTexture.magFilter = THREE.LinearFilter;
    heartImageTexture.generateMipmaps = false;
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 0;
    heartImageTexture.anisotropy = Math.min(16, maxAniso || 0);
    if (heartImageTexture.colorSpace !== undefined) heartImageTexture.colorSpace = THREE.SRGBColorSpace;
  }

  const addHeartImagePlane = (texture) => {
    if (!heartGroup || !cfg.heartImageEnabled || heartImagePlaneMesh) return;
    const scale = cfg.heartImageScale ?? 0.4;
    const planeSize = (3.5 * 2) * scale;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
    });
    planeMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float dist = length(vUv - 0.5) * 2.0;
        diffuseColor.a *= 1.0 - smoothstep(0.6, 1.0, dist);`
      );
    };
    heartImagePlaneMesh = new THREE.Mesh(planeGeom, planeMat);
    heartImagePlaneMesh.position.set(0, 0, 0.0);
    heartImagePlaneMesh.rotation.x = -Math.PI / 2;
    heartImagePlaneMesh.renderOrder = 10;
    heartImagePlaneMesh.visible = false;
    heartGroup.add(heartImagePlaneMesh);
  };

  heartGroup = new THREE.Group();
  heartGroup.position.set(0, 0, 0);
  heartGroup.rotation.x = -Math.PI / 2;
  // 1) Trái tim "bình thường" (spiral đang quay): giữ nguyên style cũ
  heartPointsNormalObject = createHeartPoints({
    timeUniform: heartTimeUniform,
    particleCount: 30000,
    pointSize: 0.1,
    blending: THREE.AdditiveBlending,
    // đúng như version cũ: hạt "lấp lánh" do random size rộng
    sizeRandBase: 0.4,
    sizeRandRange: 0.5,
    heartImageTexture,
    // không hiện ảnh ở mode bình thường
    heartImageEnabled: false,
    heartImageThreshold: cfg.heartImageThreshold,
    heartImageStrength: cfg.heartImageStrength,
    heartFace: HEART_FACES[cfg.heartFaceToCamera] || HEART_FACES.HEART_FACE_TOP,
  });
  heartGroup.add(heartPointsNormalObject);

  // 2) Trái tim "hiện ảnh": hạt chỉ hỗ trợ độ sâu (màu tim), ảnh chỉ ở plane texture
  heartPointsImageObject = createHeartPoints({
    timeUniform: heartTimeUniform,
    particleCount: cfg.heartParticleCount ?? 200000,
    pointSize: cfg.heartPointSize ?? 0.045,
    blending: THREE.NormalBlending,
    sizeRandBase: 0.92,
    sizeRandRange: 0.08,
    heartImageTexture,
    heartImageEnabled: false,
    heartImageThreshold: cfg.heartImageThreshold,
    heartImageStrength: cfg.heartImageStrength,
    heartFace: HEART_FACES[cfg.heartFaceToCamera] || HEART_FACES.HEART_FACE_TOP,
  });
  if (heartPointsImageObject.material) {
    heartPointsImageObject.material.opacity = 0.35;
    heartPointsImageObject.material.depthWrite = true;
  }
  heartPointsImageObject.visible = false;
  heartGroup.add(heartPointsImageObject);

  // Plane phủ ảnh full resolution — ảnh chỉ hiện ở đây, hạt chỉ làm độ sâu
  if (cfg.heartImageEnabled && heartImageTexture) {
    addHeartImagePlane(heartImageTexture);
  }

  // Kích thước ô trống = bbox mặt tim (giống shader) để nền + note khớp khoảng trống
  const bb = heartPointsNormalObject.geometry.boundingBox;
  const faceSizeX = bb.max.x - bb.min.x;
  const faceSizeZ = bb.max.z - bb.min.z;
  const rx = cfg.heartCenterHoleRx ?? 0.24;
  const ry = cfg.heartCenterHoleRy ?? 0.11;
  const holeW = 2 * rx * faceSizeX;
  const holeH = 2 * ry * faceSizeZ;

  // Nền chữ: hình viên nhộng, cùng kích thước ô trống
  const pillShape = new THREE.Shape();
  const prx = 1;
  const pry = Math.min(1, ry / rx);
  pillShape.moveTo(-prx + pry, -pry);
  pillShape.lineTo(prx - pry, -pry);
  pillShape.absarc(prx - pry, 0, pry, -Math.PI / 2, Math.PI / 2);
  pillShape.lineTo(-prx + pry, pry);
  pillShape.absarc(-prx + pry, 0, pry, Math.PI / 2, -Math.PI / 2);
  pillShape.closePath();
  const pillGeom = new THREE.ShapeGeometry(pillShape);
  const bgColor = cfg.heartCenterNoteBgColor ?? 0xffffff;
  const bgOpacity = cfg.heartCenterNoteBgOpacity ?? 0.92;
  const pillMat = new THREE.MeshBasicMaterial({
    color: bgColor,
    transparent: true,
    opacity: bgOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
  });
  heartCenterNoteBgMesh = new THREE.Mesh(pillGeom, pillMat);
  const noteZ = -0.5;
  const noteOffsetY = cfg.heartCenterNoteOffsetY ?? 0;
  heartCenterNoteBgMesh.scale.set(rx * faceSizeX, rx * faceSizeZ, 1);
  heartCenterNoteBgMesh.rotation.x = -Math.PI / 2;
  heartCenterNoteBgMesh.position.set(0, noteOffsetY, noteZ);
  heartCenterNoteBgMesh.renderOrder = 5;
  heartCenterNoteBgMesh.visible = false;
  heartGroup.add(heartCenterNoteBgMesh);

  // Viền nền: chỉ đường viền ngoài (LineLoop từ shape), tránh vẽ cạnh tam giác bên trong
  const outlineDivisions = 32;
  const outlinePts = pillShape.getPoints(outlineDivisions);
  const outlineGeom = new THREE.BufferGeometry().setFromPoints(
    outlinePts.map((p) => new THREE.Vector3(p.x, p.y, 0))
  );
  const outlineColor = cfg.heartCenterNoteBgOutlineColor ?? 0xdd88aa;
  const outlineOpacity = cfg.heartCenterNoteBgOutlineOpacity ?? 0.75;
  const outlineMat = new THREE.LineBasicMaterial({
    color: outlineColor,
    transparent: true,
    opacity: outlineOpacity,
    depthWrite: false,
    depthTest: true,
  });
  heartCenterNoteBgOutline = new THREE.LineLoop(outlineGeom, outlineMat);
  heartCenterNoteBgOutline.scale.copy(heartCenterNoteBgMesh.scale);
  heartCenterNoteBgOutline.rotation.copy(heartCenterNoteBgMesh.rotation);
  heartCenterNoteBgOutline.position.copy(heartCenterNoteBgMesh.position);
  heartCenterNoteBgOutline.renderOrder = 5.5;
  heartCenterNoteBgOutline.visible = false;
  heartGroup.add(heartCenterNoteBgOutline);

  // Lyrics 3 dòng cuộn lên (dòng giữa rõ, 2 dòng đầu/cuối mờ nửa chữ)
  const lyricsRaw = cfg.heartCenterLyrics;
  const lyricsLines = Array.isArray(lyricsRaw)
    ? lyricsRaw.filter((s) => String(s).trim()).map((s) => String(s).trim())
    : typeof lyricsRaw === "string"
      ? lyricsRaw.split(/\n/).map((s) => s.trim()).filter(Boolean)
      : [cfg.heartCenterNote || "❤"];
  const lyricsSprite = createLyricsSprite(lyricsLines.length ? lyricsLines : ["❤"]);
  if (lyricsSprite) {
    heartCenterNoteSprite = lyricsSprite;
    heartCenterNoteSprite.position.set(0, noteOffsetY, noteZ);
    heartCenterNoteSprite.scale.set(holeW, holeH, 1);
    heartCenterNoteSprite.renderOrder = 6;
    heartCenterNoteSprite.visible = false;
    heartGroup.add(heartCenterNoteSprite);
  }

  // Hạt trang trí random trong khoảng trống con nhộng
  const segHalf = Math.max(0, (rx - ry) * faceSizeX);
  const capRadius = ry * faceSizeZ;
  const dotsCount = Math.max(20, cfg.heartCenterDotsCount ?? 220);
  const dotPositions = [];
  let tries = 0;
  while (dotPositions.length / 3 < dotsCount && tries < dotsCount * 20) {
    tries++;
    const qx = (Math.random() * 2 - 1) * rx * faceSizeX;
    const qz = (Math.random() * 2 - 1) * ry * faceSizeZ;
    const cx = Math.max(-segHalf, Math.min(segHalf, qx));
    const dist = Math.sqrt((qx - cx) ** 2 + qz ** 2);
    if (dist <= capRadius) {
      dotPositions.push(qx, noteOffsetY, noteZ + qz);
    }
  }
  if (dotPositions.length >= 3) {
    const dotsGeom = new THREE.BufferGeometry();
    dotsGeom.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
    const dotsMat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    heartCenterDotsPoints = new THREE.Points(dotsGeom, dotsMat);
    heartCenterDotsPoints.renderOrder = 4;
    heartCenterDotsPoints.visible = false;
    heartGroup.add(heartCenterDotsPoints);
  }

  parentGroup.add(heartGroup);

  photosGroup = new THREE.Group();
  parentGroup.add(photosGroup);
  const notesList = ["Yêu em", "Nhớ em", "Luôn bên em", "Forever us", "Mãi bên nhau", "Trọn đời", "Cảm ơn em", "Em là nhất", "Hạnh phúc", "Together", "Always", "My love", "Thương em", "Bé An", "Cục cưng Thanh An", "Chị đại Lê Nguyễn Thanh An", "Lê Nguyễn Thanh An", "LNTA", "Bé An ơi", "Thanh An iu dấu ❤", "Gửi em bé An"];
  const N = Math.max(1, (photoUrls || []).length);
  const M = notesList.length;
  const totalSphere = N + M;
  const R = cfg.disperseSphereRadius ?? cfg.rMax;

  for (let i = 0; i < N; i++) {
    const t = 0.10 + (i + 0.5) / N * 0.80;
    const armIndex = i % cfg.arms;
    const phase = (i / cfg.arms) * 0.3;
    const texture = photoUrls[i] ? textureLoader.load(photoUrls[i], undefined, undefined, (err) => console.warn("Photo load error:", photoUrls[i], err)) : null;
    const mesh = createPhotoPlane(texture, i, cfg);
    photoMeshes.push(mesh);
    const basePos = spiralPosition(t, armIndex, phase, cfg, 0);
    mesh.position.copy(basePos);
    const gIdx = globalIndexForPhoto(i, N, M);
    photoMeta.push({
      baseT: t, armIndex, phase, jitterY: 0, speed: 0.2,
      basePos: basePos.clone(), chaosPos: pointOnSphereLatLong(gIdx, totalSphere, R),
      baseQuat: new THREE.Quaternion(), targetPos: basePos.clone(), targetQuat: new THREE.Quaternion(),
    });
    photosGroup.add(mesh);
  }

  photoRingGroup = new THREE.Group();
  const ringR = cfg.ringRadius ?? 6.5;
  const ringN = Math.max(1, ringPhotoUrls.length);
  for (let i = 0; i < ringN; i++) {
    const theta = (i / ringN) * Math.PI * 2;
    const x = ringR * Math.cos(theta), z = ringR * Math.sin(theta);
    const texture = ringPhotoUrls[i] ? textureLoader.load(ringPhotoUrls[i], undefined, undefined, (e) => console.warn("Ring photo load error:", ringPhotoUrls[i], e)) : null;
    const mesh = createRingPhotoPlane(texture, i, cfg);
    mesh.position.set(x, 0, z);
    mesh.lookAt(0, 0, 0);
    ringPhotoMeshes.push(mesh);
    photoRingGroup.add(mesh);
  }
  parentGroup.add(photoRingGroup);

  notesGroup = new THREE.Group();
  for (let i = 0; i < notesList.length; i++) {
    const sprite = createNoteSprite(notesList[i]);
    if (!sprite) continue;
    const t = 0.14 + (i + 0.5) / notesList.length * 0.72;
    const armIndex = i % cfg.arms;
    const phase = (i / cfg.arms) * 0.3;
    const pos = spiralPosition(t, armIndex, phase, cfg, 0);
    sprite.position.copy(pos);
    const gIdx = globalIndexForNote(i, N, M);
    noteMeta.push({ baseT: t, armIndex, phase, jitterY: 0, speed: 0.2, basePos: pos.clone(), chaosPos: pointOnSphereLatLong(gIdx, totalSphere, R) });
    notesGroup.add(sprite);
    noteSprites.push(sprite);
  }
  parentGroup.add(notesGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  mouse = new THREE.Vector2();
  domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);

  const nav = document.getElementById("focusNav");
  const prevBtn = document.getElementById("focusPrevBtn");
  const nextBtn = document.getElementById("focusNextBtn");
  const exitBtn = document.getElementById("focusExitBtn");
  if (nav) nav.style.display = "none";
  if (prevBtn) prevBtn.addEventListener("click", () => focusPrev());
  if (nextBtn) nextBtn.addEventListener("click", () => focusNext());
  if (exitBtn) exitBtn.addEventListener("click", () => exitFocusMode());
}

function getFocusTargetPosition() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(heartPhotosConfig.focusDistance)).add(new THREE.Vector3(0, 0.3, 0));
}

function enterFocusMode(index) {
  if (focusedIndex === index) return;
  focusedIndex = index;
  const nav = document.getElementById("focusNav");
  if (nav) nav.style.display = "flex";
  const targetWorld = getFocusTargetPosition();
  const targetQuat = new THREE.Quaternion().copy(camera.quaternion);
  const cfg = heartPhotosConfig;
  for (let i = 0; i < photoMeshes.length; i++) {
    const meta = photoMeta[i];
    const mesh = photoMeshes[i];
    mesh.getWorldQuaternion(meta.baseQuat);
    meta.basePos.copy(mesh.position).applyMatrix4(mesh.matrixWorld);
    if (i === index) {
      photosGroup.worldToLocal(meta.targetPos.copy(targetWorld));
      meta.targetQuat.copy(targetQuat);
      mesh.material.opacity = 1;
    } else {
      meta.targetPos.copy(meta.basePos);
      meta.targetQuat.copy(meta.baseQuat);
      mesh.material.opacity = cfg.dimmedOpacity;
    }
  }
}

function exitFocusMode() {
  if (focusedIndex < 0) return;
  const cfg = heartPhotosConfig;
  for (let i = 0; i < photoMeshes.length; i++) {
    const meta = photoMeta[i];
    meta.targetPos.copy(spiralPosition(meta.baseT, meta.armIndex, meta.phase, cfg, meta.jitterY));
    meta.targetQuat.identity();
    photoMeshes[i].material.opacity = 1;
  }
  focusedIndex = -1;
  const nav = document.getElementById("focusNav");
  if (nav) nav.style.display = "none";
}

function focusNext() {
  if (photoMeshes.length === 0) return;
  enterFocusMode((focusedIndex < 0 ? 0 : focusedIndex + 1) % photoMeshes.length);
}

function focusPrev() {
  if (photoMeshes.length === 0) return;
  enterFocusMode(focusedIndex <= 0 ? photoMeshes.length - 1 : focusedIndex - 1);
}

function onPointerDown(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  raycaster.layers.set(0);
  const hits = raycaster.intersectObjects(photoMeshes, true);
  if (hits.length > 0) {
    const idx = hits[0].object.userData.photoIndex;
    if (typeof idx === "number") enterFocusMode(idx);
    return;
  }
  exitFocusMode();
}

function onKeyDown(event) {
  if (event.key === "Escape") { exitFocusMode(); return; }
  if (event.key === "ArrowRight") { focusNext(); return; }
  if (event.key === "ArrowLeft") { focusPrev(); return; }
  if (event.key === "c" || event.key === "C") setExpanded(!expanded);
}

export function updateHeartAndPhotos(dt, time, disperseProgress = 0, opts = {}) {
  if (!heartGroup || !photosGroup) return;
  const cfg = heartPhotosConfig;
  const heartFacingCamera = opts.heartFacingCamera === true;
  const cameraAtHeart = opts.cameraAtHeart === true;
  heartTimeUniform.value = time;
  /* Khi camera zoom tới tim: trái tim không xoay vòng (bù xoay parent), vẫn nhịp đập. Chỉ quả cầu lớn + ring xoay */
  heartGroup.position.set(0, 0, 0);
  if (cameraAtHeart && parentGroup) {
    parentGroup.updateMatrixWorld(true);
    parentGroup.getWorldQuaternion(_tmpQuat).invert();
    heartGroup.quaternion.copy(_heartFaceZQuat).premultiply(_tmpQuat);
  } else {
    heartGroup.rotation.set(-Math.PI / 2, 0, 0);
  }
  const pulse = 1 + cfg.pulseScaleAmt * Math.sin(time * cfg.pulseSpeed);
  heartGroup.scale.setScalar(pulse);

  /* Ring: xoay vòng; khi camera tới tim thì tâm ring dịch xuống (trục Y) */
  if (photoRingGroup) {
    const ringSpeed = cfg.ringSpinSpeed ?? 0.15;
    photoRingGroup.rotation.y += dt * ringSpeed;
    photoRingGroup.position.y = cameraAtHeart ? (cfg.ringAtHeartY ?? -3.5) : 0;
    photoRingGroup.scale.setScalar(1);
    /* Khi camera đã đứng trước tim: tích lũy góc ring quay; đủ 1 vòng (2π) thì đánh dấu hoàn thành */
    if (cameraAtHeart && !ringCompletedOneLapSinceAtHeart) {
      ringAngleAccumulatedAtHeart += dt * ringSpeed;
      if (ringAngleAccumulatedAtHeart >= 2 * Math.PI) ringCompletedOneLapSinceAtHeart = true;
    }
  }

  // Ảnh từ photoHeart (1 hình thể hiện bằng điểm trên tim): hiện khi camera đứng trước tim + disperse xong
  if (cfg.heartImageEnabled) {
    const faceLocal = HEART_FACES[cfg.heartFaceToCamera] || HEART_FACES.HEART_FACE_BOTTOM;
    heartFaceUniform.value.copy(faceLocal);
    heartMapThresholdUniform.value = cfg.heartImageThreshold ?? heartMapThresholdUniform.value;
    heartMapStrengthUniform.value = cfg.heartImageStrength ?? heartMapStrengthUniform.value;
    heartMapScaleUniform.value = cfg.heartImageScale ?? heartMapScaleUniform.value;

    const disperseReady = disperseProgress > 0.85;
    const wantShow = cfg.heartImageOnlyWhenFacing ? (cameraAtHeart === true && disperseReady) : true;
    if (wantShow) {
      heartMapEnabledUniform.value = 1.0;
    } else {
      const k = Math.min(1, (cfg.heartImageFadeSpeed ?? 50.0) * Math.max(0, dt));
      heartMapEnabledUniform.value = heartMapEnabledUniform.value + (0.0 - heartMapEnabledUniform.value) * k;
    }
  } else {
    heartMapEnabledUniform.value = 0.0;
  }

  // Chỉ áp dụng "mode ảnh nét" khi đang thật sự hiện ảnh
  const imageActive = cfg.heartImageEnabled && heartMapEnabledUniform.value > 0.01;
  if (heartPointsNormalObject) {
    heartPointsNormalObject.visible = true;
    heartPointsNormalObject.material.opacity = imageActive ? 0.45 : 1.0;
  }
  if (heartPointsImageObject) heartPointsImageObject.visible = imageActive;
  if (heartImagePlaneMesh) heartImagePlaneMesh.visible = imageActive;

  const holeRx = cfg.heartCenterHoleRx ?? 0.24;
  const holeRy = cfg.heartCenterHoleRy ?? 0.11;
  const showCenterHole = cameraAtHeart && holeRx > 0.001 && holeRy > 0.001;
  heartCenterHoleUniform.value = showCenterHole ? 1.0 : 0.0;
  heartCenterHoleRxUniform.value = holeRx;
  heartCenterHoleRyUniform.value = holeRy;
  if (heartCenterNoteBgMesh) heartCenterNoteBgMesh.visible = showCenterHole;
  if (heartCenterNoteBgOutline) heartCenterNoteBgOutline.visible = showCenterHole;
  if (heartCenterNoteSprite) heartCenterNoteSprite.visible = showCenterHole;
  if (heartCenterDotsPoints) heartCenterDotsPoints.visible = showCenterHole;

  // Lyrics: cuộn theo thời gian (dùng time để tránh lỗi khi dt = 0 hoặc không ổn định)
  if (!showCenterHole) {
    heartCenterLyricsTimeWhenHoleShown = null;
  } else if (heartCenterLyricsLines.length > 0 && heartCenterLyricsCanvas && heartCenterLyricsTexture) {
    if (heartCenterLyricsTimeWhenHoleShown == null) heartCenterLyricsTimeWhenHoleShown = time;
    const timeScale = 0.5 * Math.PI; /* time = elapsed * timeScale (từ GalaxyScene: t * Math.PI, t = elapsed * 0.5) */
    const elapsedSeconds = (time - heartCenterLyricsTimeWhenHoleShown) / timeScale;
    const duration = cfg.heartCenterLyricsDuration ?? 3.5;
    const newIndex = Math.floor(elapsedSeconds / duration) % heartCenterLyricsLines.length;
    if (newIndex !== heartCenterLyricsIndex) {
      heartCenterLyricsIndex = newIndex;
      drawLyricsToCanvas(heartCenterLyricsCanvas, heartCenterLyricsLines, heartCenterLyricsIndex);
      heartCenterLyricsTexture.needsUpdate = true;
    }
  }

  const expandedRMax = cfg.rMaxExpanded ?? cfg.rMax;
  const collapsedRMax = cfg.rMaxCollapsed ?? 2.5;
  currentRMax = expanded ? expandedRMax : currentRMax + (expandedRMax - currentRMax) * 0.02;
  if (!expanded) currentRMax = currentRMax + (collapsedRMax - currentRMax) * 0.02;
  const phaseFrozen = disperseProgress > 0.5;

  for (let i = 0; i < photoMeshes.length; i++) {
    const mesh = photoMeshes[i];
    const meta = photoMeta[i];
    if (!phaseFrozen) meta.phase += dt * meta.speed * cfg.orbitSpeed;
    meta.basePos.copy(spiralPosition(meta.baseT, meta.armIndex, meta.phase, cfg, meta.jitterY));
    if (focusedIndex >= 0) {
      mesh.position.lerp(meta.targetPos, cfg.focusLerpFactor);
      mesh.quaternion.slerp(meta.targetQuat, cfg.focusLerpFactor);
    } else {
      /* disperseProgress=0: đĩa spiral (basePos), disperseProgress=1: mặt cầu (chaosPos) */
      _tmpVec3.copy(meta.chaosPos).multiplyScalar(cfg.expansionScale ?? 1);
      _tmpVec3.sub(meta.basePos).multiplyScalar(disperseProgress).add(meta.basePos);
      if (disperseProgress < 0.01) mesh.position.copy(meta.basePos);
      else mesh.position.lerp(_tmpVec3, disperseProgress > 0.3 ? cfg.lerpFactor : 0.7);
      photosGroup.worldToLocal(_tmpVec3.copy(camera.position));
      _tmpVec3.sub(mesh.position);
      mesh.rotation.set(0, Math.atan2(_tmpVec3.x, _tmpVec3.z), 0);
    }
  }

  if (notesGroup && noteSprites.length === noteMeta.length) {
    for (let i = 0; i < noteSprites.length; i++) {
      const s = noteSprites[i];
      const meta = noteMeta[i];
      if (!phaseFrozen) meta.phase += dt * meta.speed * cfg.orbitSpeed * 0.8;
      meta.basePos.copy(spiralPosition(meta.baseT, meta.armIndex, meta.phase, cfg, 0.0));
      _tmpVec3.copy(meta.chaosPos).multiplyScalar(cfg.expansionScale ?? 1);
      _tmpVec3.sub(meta.basePos).multiplyScalar(disperseProgress).add(meta.basePos);
      if (disperseProgress < 0.01) s.position.copy(meta.basePos);
      else s.position.lerp(_tmpVec3, disperseProgress > 0.3 ? 0.12 : 0.7);
      s.lookAt(camera.position);
    }
  }
}

export function setExpanded(value) {
  expanded = !!value;
}

export function disposeHeartAndPhotos() {
  if (domElement) {
    domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("keydown", onKeyDown);
  }
  if (heartGroup && parentGroup) {
    heartGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    parentGroup.remove(heartGroup);
  }
  if (photosGroup && parentGroup) parentGroup.remove(photosGroup);
  photoMeshes.forEach((m) => {
    if (m.geometry) m.geometry.dispose();
    if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  });
  if (notesGroup && parentGroup) {
    parentGroup.remove(notesGroup);
    noteSprites.forEach((s) => {
      if (s.material && s.material.map) s.material.map.dispose();
      if (s.material) s.material.dispose();
    });
  }
  if (photoRingGroup && parentGroup) {
    parentGroup.remove(photoRingGroup);
    ringPhotoMeshes.forEach((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    });
  }
  heartGroup = null;
  photosGroup = null;
  photoRingGroup = null;
  photoMeshes = [];
  ringPhotoMeshes = [];
  noteSprites = [];
  photoMeta = [];
  noteMeta = [];
  focusedIndex = -1;
  ringAngleAccumulatedAtHeart = 0;
  ringCompletedOneLapSinceAtHeart = false;
  heartPointsNormalObject = null;
  heartPointsImageObject = null;
  heartImagePlaneMesh = null;
  heartCenterNoteSprite = null;
  heartCenterNoteBgMesh = null;
  if (heartCenterNoteBgOutline) {
    if (heartCenterNoteBgOutline.geometry) heartCenterNoteBgOutline.geometry.dispose();
    if (heartCenterNoteBgOutline.material) heartCenterNoteBgOutline.material.dispose();
    heartCenterNoteBgOutline = null;
  }
  heartCenterDotsPoints = null;
  if (heartCenterLyricsTexture) {
    heartCenterLyricsTexture.dispose();
    heartCenterLyricsTexture = null;
  }
  heartCenterLyricsCanvas = null;
  heartCenterLyricsLines = [];
  heartCenterLyricsIndex = 0;
  heartCenterLyricsTimeWhenHoleShown = null;
}
