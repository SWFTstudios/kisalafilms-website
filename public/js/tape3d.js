import * as THREE from "three";

/* Kisala Films — 3D VHS cassette meshes.
   Exports createTapeStage (single hero tape) and createTapeWall (watch grid). */

const TONE_HEX = {
  red: "#b9b9b9",
  lime: "#ffffff",
  orange: "#d2d2d2",
  blue: "#9a9a9a",
  cream: "#e8e8e8",
};
const TONE_INT = { red: 0xb9b9b9, lime: 0xffffff, orange: 0xd2d2d2, blue: 0x9a9a9a, cream: 0xe8e8e8 };

const TAPE_W = 1.85;
const TAPE_H = 1.05;
const TAPE_D = 0.32;

function makeLabelTexture(film) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 448;
  const ctx = c.getContext("2d");
  const tone = TONE_HEX[film.tone] || "#ffffff";

  ctx.fillStyle = "#ededed";
  ctx.fillRect(0, 0, c.width, c.height);
  // subtle paper noise lines
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  for (let y = 0; y < c.height; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y);
    ctx.stroke();
  }

  // tone header band
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, c.width, 92);
  ctx.fillStyle = "#0b0c0a";
  ctx.font = "700 30px 'IBM Plex Mono', monospace";
  ctx.fillText("KISALA FILMS", 28, 58);
  ctx.textAlign = "right";
  ctx.font = "700 26px 'IBM Plex Mono', monospace";
  ctx.fillText(film.code || "", c.width - 28, 56);
  ctx.textAlign = "left";

  // category
  ctx.fillStyle = "#0b0c0a";
  ctx.font = "700 24px 'IBM Plex Mono', monospace";
  ctx.fillText((film.categoryLabel || film.label || "").toUpperCase(), 30, 150);

  // title (wrap up to 2 lines)
  ctx.fillStyle = "#0b0c0a";
  ctx.font = "900 74px 'Archivo Black', 'Arial Black', sans-serif";
  const words = (film.title || "").toUpperCase().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > c.width - 60 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 30, 250 + i * 78));

  // footer meta
  ctx.fillStyle = "#0b0c0a";
  ctx.fillRect(0, c.height - 70, c.width, 70);
  ctx.fillStyle = tone;
  ctx.font = "700 26px 'IBM Plex Mono', monospace";
  ctx.fillText(`${film.format || "SP"}`, 28, c.height - 26);
  ctx.textAlign = "right";
  ctx.fillText(`${film.time || "--:--"} / COLOR`, c.width - 28, c.height - 26);
  ctx.textAlign = "left";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildTapeMesh(film) {
  const group = new THREE.Group();
  const toneInt = TONE_INT[film.tone] || 0xffffff;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(TAPE_W, TAPE_H, TAPE_D),
    new THREE.MeshStandardMaterial({ color: 0x141510, roughness: 0.55, metalness: 0.15 })
  );
  group.add(body);

  // inner border frame (front)
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(TAPE_W * 0.94, TAPE_H * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x0a0b09, roughness: 0.8 })
  );
  frame.position.z = TAPE_D / 2 + 0.001;
  group.add(frame);

  // reel window (upper area)
  const windowPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(TAPE_W * 0.7, TAPE_H * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x050605, roughness: 1 })
  );
  windowPanel.position.set(0, TAPE_H * 0.2, TAPE_D / 2 + 0.004);
  group.add(windowPanel);

  // two spinning reels
  const reels = [];
  const reelMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.6 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  [-1, 1].forEach((side) => {
    const reel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 24), reelMat);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 18), hubMat);
    hub.rotation.x = Math.PI / 2;
    // spokes
    for (let s = 0; s < 6; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01), hubMat);
      spoke.rotation.z = (s / 6) * Math.PI;
      reel.add(spoke);
    }
    reel.add(ring, hub);
    reel.position.set(side * TAPE_W * 0.17, TAPE_H * 0.2, TAPE_D / 2 + 0.02);
    group.add(reel);
    reels.push(reel);
  });

  // label
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(TAPE_W * 0.9, TAPE_H * 0.46),
    new THREE.MeshBasicMaterial({ map: makeLabelTexture(film), toneMapped: false })
  );
  label.position.set(0, -TAPE_H * 0.22, TAPE_D / 2 + 0.006);
  group.add(label);

  // spine (top) tone stripe
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(TAPE_W * 0.97, 0.04, TAPE_D * 0.9),
    new THREE.MeshStandardMaterial({ color: toneInt, roughness: 0.4, emissive: toneInt, emissiveIntensity: 0.15 })
  );
  spine.position.set(0, TAPE_H / 2 + 0.005, 0);
  group.add(spine);

  group.userData = { film, reels, label, toneInt };
  return group;
}

function baseScene(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x777777, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x999999, 0.8);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  return { scene, camera, renderer };
}

export function createTapeStage({ container, onPlay }) {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { scene, camera, renderer } = baseScene(container);
  camera.position.set(0, 0, 4.2);

  const glow = new THREE.PointLight(0xffffff, 0, 6, 2);
  glow.position.set(0, 0, 2);
  scene.add(glow);

  let current = null;
  let target = new THREE.Vector2(0, 0);
  const pointer = new THREE.Vector2(0, 0);
  let swap = null; // {t, from, to}

  function setTape(film) {
    const mesh = buildTapeMesh(film);
    mesh.scale.setScalar(1);
    if (!current) {
      scene.add(mesh);
      current = mesh;
      mesh.position.y = prefersReduced ? 0 : -3;
      swap = { t: 0, mode: "in", mesh };
    } else {
      swap = { t: 0, mode: "out", oldMesh: current, next: mesh };
    }
    glow.color.setHex(mesh.userData.toneInt);
  }

  const onMove = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    target.set(pointer.x * 0.4, pointer.y * 0.3);
  };
  const onClick = () => {
    if (current?.userData?.film && onPlay) onPlay(current.userData.film);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("click", onClick);
  renderer.domElement.style.cursor = "pointer";

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const el = clock.elapsedTime;
    const dt = clock.getDelta();

    if (swap) {
      swap.t = Math.min(1, swap.t + dt * (prefersReduced ? 6 : 2.2));
      const e = 1 - Math.pow(1 - swap.t, 3);
      if (swap.mode === "in") {
        swap.mesh.position.y = -3 * (1 - e);
        swap.mesh.rotation.y = (1 - e) * Math.PI * 1.5;
      } else {
        swap.oldMesh.position.y = -3 * e;
        swap.oldMesh.rotation.y = e * Math.PI;
        swap.oldMesh.scale.setScalar(1 - e * 0.4);
        if (swap.t >= 1) {
          scene.remove(swap.oldMesh);
          scene.add(swap.next);
          current = swap.next;
          swap = { t: 0, mode: "in", mesh: swap.next };
        }
      }
      if (swap && swap.mode === "in" && swap.t >= 1) swap = null;
    }

    glow.intensity = 1.4 + Math.sin(el * 3) * 0.4;

    if (current && !swap) {
      current.rotation.y += (target.x - current.rotation.y) * 0.06;
      current.rotation.x += (-target.y - current.rotation.x) * 0.06;
      current.position.y = prefersReduced ? 0 : Math.sin(el * 1.4) * 0.06;
    }
    if (current) {
      current.userData.reels.forEach((r, i) => {
        r.rotation.z -= (i === 0 ? 0.05 : -0.05);
      });
    }

    renderer.render(scene, camera);
  }
  frame();

  function pause() { running = false; cancelAnimationFrame(raf); }
  function resume() { if (running) return; running = true; clock.getDelta(); frame(); }
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));

  return { setTape, pause, resume };
}

export function createTapeWall({ container, films = [], onPlay }) {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { scene, camera, renderer } = baseScene(container);
  camera.position.set(0, 0, 9);

  const wall = new THREE.Group();
  scene.add(wall);

  const cols = films.length > 6 ? 4 : 3;
  const gapX = 2.35;
  const gapY = 1.7;
  const tapes = [];

  films.forEach((film, i) => {
    const mesh = buildTapeMesh(film);
    const col = i % cols;
    const row = Math.floor(i / cols);
    mesh.userData.home = new THREE.Vector3(
      (col - (cols - 1) / 2) * gapX,
      -(row * gapY) + 1.2,
      0
    );
    mesh.position.copy(mesh.userData.home);
    mesh.scale.setScalar(0.82);
    mesh.userData.phase = i * 0.7;
    mesh.userData.visible = true;
    wall.add(mesh);
    tapes.push(mesh);
  });

  // center wall vertically based on rows
  const rows = Math.ceil(films.length / cols);
  wall.position.y = (rows - 1) * gapY * 0.5 - 1.2;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovered = null;
  let dragging = false;
  let lastX = 0;
  let moved = false;
  let targetRotY = 0;

  const onMove = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (dragging) {
      const dx = e.clientX - lastX;
      if (Math.abs(dx) > 3) moved = true;
      lastX = e.clientX;
      targetRotY = THREE.MathUtils.clamp(targetRotY + dx * 0.004, -0.5, 0.5);
    }
  };
  const onDown = (e) => { dragging = true; moved = false; lastX = e.clientX; };
  const onUp = () => { dragging = false; };
  const onClick = () => {
    if (moved) return;
    if (hovered?.userData?.film && onPlay) onPlay(hovered.userData.film);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("click", onClick);

  function filter(categoryId) {
    tapes.forEach((mesh) => {
      const match = !categoryId || categoryId === "all" || mesh.userData.film.category === categoryId;
      mesh.userData.visible = match;
    });
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // fit: pull camera back on narrow screens
    camera.position.z = w < 640 ? 13 : w < 960 ? 10.5 : 9;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const el = clock.elapsedTime;

    wall.rotation.y += (targetRotY - wall.rotation.y) * 0.06;
    wall.rotation.x += (pointer.y * 0.12 - wall.rotation.x) * 0.04;

    raycaster.setFromCamera(pointer, camera);
    const visibleMeshes = tapes.filter((m) => m.userData.visible);
    const hits = raycaster.intersectObjects(visibleMeshes, true);
    let hitTop = null;
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.film) o = o.parent;
      hitTop = o;
    }
    hovered = hitTop;
    renderer.domElement.style.cursor = hovered ? "pointer" : dragging ? "grabbing" : "grab";

    tapes.forEach((mesh) => {
      const vis = mesh.userData.visible;
      const home = mesh.userData.home;
      const targetScale = vis ? (mesh === hovered ? 1.02 : 0.82) : 0.2;
      mesh.scale.x += (targetScale - mesh.scale.x) * 0.15;
      mesh.scale.y += (targetScale - mesh.scale.y) * 0.15;
      mesh.scale.z += (targetScale - mesh.scale.z) * 0.15;

      const targetZ = vis ? (mesh === hovered ? 1.4 : 0) : -4;
      const bob = prefersReduced || !vis ? 0 : Math.sin(el * 1.2 + mesh.userData.phase) * 0.12;
      mesh.position.x += (home.x - mesh.position.x) * 0.12;
      mesh.position.y += (home.y + bob - mesh.position.y) * 0.12;
      mesh.position.z += (targetZ - mesh.position.z) * 0.12;

      mesh.visible = mesh.scale.x > 0.24 || vis;

      const targetRot = mesh === hovered ? 0 : -0.12;
      mesh.rotation.y += (targetRot - mesh.rotation.y) * 0.1;

      mesh.userData.reels.forEach((r, i) => {
        if (mesh === hovered) r.rotation.z -= i === 0 ? 0.08 : -0.08;
      });
    });

    renderer.render(scene, camera);
  }
  frame();

  function pause() { running = false; cancelAnimationFrame(raf); }
  function resume() { if (running) return; running = true; clock.getDelta(); frame(); }
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));

  return { filter, pause, resume };
}
