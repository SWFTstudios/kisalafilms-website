import * as THREE from "three";

/* Kisala Films — digital dot-matrix travel globe.
   Renders a glowing wireframe/point globe with city pins and light arcs
   between filmed locations. Click a pin -> onSelect(film). */

const DEG2RAD = Math.PI / 180;

function latLngToVec3(lat, lng, radius) {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

const TONE_COLORS = {
  red: 0xb9b9b9,
  lime: 0xffffff,
  orange: 0xd2d2d2,
  blue: 0x9a9a9a,
  cream: 0xe8e8e8,
};

export function createGlobe({ container, films = [], onSelect, onHover }) {
  const RADIUS = 1;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.35, 3.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.cursor = "grab";
  /* Let the canvas own touch gestures so dragging spins instead of scrolling. */
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  renderer.domElement.style.webkitUserSelect = "none";
  renderer.domElement.setAttribute("aria-hidden", "true");

  /* Lights */
  scene.add(new THREE.AmbientLight(0x555555, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-2, 1.5, 2);
  scene.add(key);

  /* Rotating world group (globe + pins + arcs share rotation) */
  const world = new THREE.Group();
  world.rotation.x = 0.32;
  scene.add(world);

  /* —— Dotted graticule sphere —— */
  const dotGeo = new THREE.BufferGeometry();
  const dotPos = [];
  const latStep = 6;
  const lngStep = 6;
  for (let lat = -80; lat <= 80; lat += latStep) {
    const ring = Math.max(6, Math.round((360 / lngStep) * Math.cos(lat * DEG2RAD)));
    for (let i = 0; i < ring; i++) {
      const lng = (i / ring) * 360 - 180;
      const v = latLngToVec3(lat, lng, RADIUS);
      dotPos.push(v.x, v.y, v.z);
    }
  }
  dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPos, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0xdedede,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  world.add(new THREE.Points(dotGeo, dotMat));

  /* Solid inner sphere so back dots are occluded (reads as a real globe) */
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x080808,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });
  world.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 0.985, 48, 48), coreMat));

  /* Wireframe latitude/longitude cage */
  const cage = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(RADIUS * 1.002, 24, 16)),
    new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.16 })
  );
  world.add(cage);

  /* —— Atmosphere glow (fresnel back-side shell) —— */
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.18, 48, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { glow: { value: new THREE.Color(0xcccccc) } },
      vertexShader: `
        varying float vI;
        void main() {
          vec3 n = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 vd = normalize(-mv.xyz);
          vI = pow(1.0 - abs(dot(n, vd)), 2.4);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vI;
        uniform vec3 glow;
        void main() { gl_FragColor = vec4(glow, vI * 0.9); }
      `,
    })
  );
  scene.add(atmosphere);

  /* —— Starfield —— */
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const r = 14 + Math.random() * 22;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    starPos.push(
      r * Math.sin(p) * Math.cos(t),
      r * Math.sin(p) * Math.sin(t),
      r * Math.cos(p)
    );
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xbcbcbc, size: 0.06, transparent: true, opacity: 0.7 })
  );
  scene.add(stars);

  /* —— City pins —— */
  const pinGroup = new THREE.Group();
  world.add(pinGroup);
  const pins = [];
  const withCoords = films.filter((f) => typeof f.lat === "number" && typeof f.lng === "number");

  withCoords.forEach((film) => {
    const color = TONE_COLORS[film.tone] || 0xffffff;
    const pos = latLngToVec3(film.lat, film.lng, RADIUS * 1.01);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 16),
      new THREE.MeshBasicMaterial({ color })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending })
    );
    /* Larger invisible sphere so taps register on phones. */
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );

    const up = pos.clone().normalize();
    const pin = new THREE.Group();
    beam.position.copy(up.clone().multiplyScalar(0.08));
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    head.position.copy(up.clone().multiplyScalar(0.16));
    halo.position.copy(head.position);
    hit.position.copy(head.position);
    pin.add(beam, head, halo, hit);
    pin.position.copy(pos);
    pin.userData.film = film;
    pin.userData.head = head;
    pin.userData.halo = halo;
    pin.userData.hit = hit;
    pin.userData.baseColor = color;
    pinGroup.add(pin);
    pins.push(pin);
  });

  /* —— Great-circle arcs connecting the route —— */
  const arcs = [];
  for (let i = 0; i < withCoords.length; i++) {
    const a = withCoords[i];
    const b = withCoords[(i + 1) % withCoords.length];
    if (withCoords.length < 2) break;
    const start = latLngToVec3(a.lat, a.lng, RADIUS * 1.01);
    const end = latLngToVec3(b.lat, b.lng, RADIUS * 1.01);
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize();
    const lift = 1 + start.distanceTo(end) * 0.32;
    mid.multiplyScalar(RADIUS * lift);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const pts = curve.getPoints(48);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.userData.count = pts.length;
    world.add(line);
    arcs.push(line);
  }

  /* —— Interaction: drag to rotate + inertia + idle spin —— */
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 0.05 };
  const pointer = new THREE.Vector2();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let velY = 0.0016;
  let velX = 0;
  let moved = false;
  let activePointerId = null;
  /* Finger jitter on phones often exceeds 3px; keep taps selectable. */
  const TAP_SLOP_PX = 14;

  /* External (scroll-driven) rotation target. When set, the globe eases toward
     these angles instead of idle-spinning; a user drag temporarily disables it. */
  let externalMode = false;
  let focusedFilmId = null;
  let focusedFilm = null;
  const externalQ = new THREE.Quaternion();

  function setPointerFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /* Front-facing / limb pins are interactive; back-side occluded pins are not. */
  const VISIBLE_DOT = 0.08;
  const _pinWorld = new THREE.Vector3();
  const _globeOrigin = new THREE.Vector3();
  const _camDir = new THREE.Vector3();

  function isPinFacingCamera(pin) {
    pin.getWorldPosition(_pinWorld);
    world.getWorldPosition(_globeOrigin);
    /* Surface normal ≈ direction from globe center to pin. */
    _pinWorld.sub(_globeOrigin).normalize();
    _camDir.copy(camera.position).sub(_globeOrigin).normalize();
    return _pinWorld.dot(_camDir) > VISIBLE_DOT;
  }

  function pickPin() {
    raycaster.setFromCamera(pointer, camera);
    world.updateMatrixWorld();
    const targets = pins.map((p) => p.userData.hit || p.userData.head);
    const hits = raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const pin = hit.object.parent || null;
      if (pin && isPinFacingCamera(pin)) return pin;
    }
    return null;
  }

  function selectPinAtPointer() {
    const pin = pickPin();
    if (pin?.userData?.film && onSelect) onSelect(pin.userData.film, pin);
    return !!pin;
  }

  const onDown = (e) => {
    dragging = true;
    moved = false;
    activePointerId = e.pointerId ?? null;
    rotAnim = null;
    /* Quaternion focus leaves euler stale — sync before drag mutates rotation.x/y. */
    syncEulerFromQuaternion();
    externalMode = false; // let the user free-spin; scroll / select re-engages hold
    focusedFilmId = null;
    focusedFilm = null;
    lastX = e.clientX;
    lastY = e.clientY;
    setPointerFromEvent(e);
    velY = 0;
    velX = 0;
    renderer.domElement.style.cursor = "grabbing";
    if (e.pointerId != null && renderer.domElement.setPointerCapture) {
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    if (e.cancelable) e.preventDefault();
  };
  const onMove = (e) => {
    setPointerFromEvent(e);
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP_PX) moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      world.rotation.y += dx * 0.006;
      world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + dy * 0.006, -0.9, 1.2);
      velY = dx * 0.006;
      velX = dy * 0.006;
      if (e.cancelable) e.preventDefault();
    }
  };
  const onUp = (e) => {
    if (!dragging) return;
    if (activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;
    dragging = false;
    renderer.domElement.style.cursor = "grab";
    if (e && e.pointerId != null && renderer.domElement.releasePointerCapture) {
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    /* Select on pointerup (not click) so mobile taps aren't dropped after preventDefault. */
    if (!moved) {
      setPointerFromEvent(e);
      selectPinAtPointer();
    }
    activePointerId = null;
  };

  renderer.domElement.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  /* Hover feedback */
  let hovered = null;
  function updateHover() {
    const next = pickPin();
    if (next !== hovered) {
      hovered = next;
      renderer.domElement.style.cursor = next ? "pointer" : dragging ? "grabbing" : "grab";
      if (onHover) onHover(next?.userData?.film || null);
    }
  }

  /* Dead center of the camera viewport on the globe (optical axis → sphere). */
  function focusAimDirection() {
    return camera.position.clone().normalize();
  }

  /* Full quaternion that maps a lat/lng pin onto the viewport-center aim. */
  function focusQuaternionForLatLng(lat, lng) {
    const localDir = latLngToVec3(lat, lng, 1).normalize();
    const aim = focusAimDirection();
    return new THREE.Quaternion().setFromUnitVectors(localDir, aim);
  }

  function syncEulerFromQuaternion() {
    world.rotation.setFromQuaternion(world.quaternion, world.rotation.order);
  }

  /* Focus a pin: rotate world so it sits at viewport center, then hold. */
  function focusFilm(film) {
    if (typeof film?.lat !== "number" || typeof film?.lng !== "number") return;
    focusedFilmId = film.id || null;
    focusedFilm = film;
    velY = 0;
    velX = 0;
    externalMode = false;
    const targetQ = focusQuaternionForLatLng(film.lat, film.lng);
    animateFocusQuaternion(targetQ, () => {
      world.quaternion.copy(targetQ);
      syncEulerFromQuaternion();
      externalQ.copy(targetQ);
      externalMode = true;
    });
  }

  /* Point the globe at a lat/lng and keep it there (scroll-driven). */
  function setFocusLatLng(lat, lng, filmId = null) {
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const targetQ = focusQuaternionForLatLng(lat, lng);
    world.quaternion.copy(targetQ);
    syncEulerFromQuaternion();
    externalQ.copy(targetQ);
    externalMode = true;
    focusedFilmId = filmId;
    focusedFilm = { id: filmId, lat, lng };
    rotAnim = null;
    velY = 0;
    velX = 0;
  }

  let rotAnim = null;
  function animateFocusQuaternion(targetQ, onDone) {
    const startQ = world.quaternion.clone();
    const endQ = targetQ.clone();
    const start = performance.now();
    const dur = prefersReduced ? 1 : 900;
    rotAnim = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      world.quaternion.slerpQuaternions(startQ, endQ, e);
      if (t >= 1) {
        rotAnim = null;
        world.quaternion.copy(endQ);
        syncEulerFromQuaternion();
        if (onDone) onDone();
      }
    };
  }

  /* —— Resize —— */
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* Keep a held pin parked at viewport center after layout changes. */
    if (externalMode && focusedFilm && typeof focusedFilm.lat === "number") {
      const targetQ = focusQuaternionForLatLng(focusedFilm.lat, focusedFilm.lng);
      externalQ.copy(targetQ);
      world.quaternion.copy(targetQ);
      syncEulerFromQuaternion();
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* —— Animation loop —— */
  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const el = clock.elapsedTime;

    if (rotAnim) {
      rotAnim(performance.now());
    } else if (!dragging) {
      if (externalMode) {
        // Hold the focused pin at viewport center.
        world.quaternion.slerp(externalQ, 0.18);
      } else {
        world.rotation.y += velY;
        world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + velX, -0.9, 1.2);
        velY += (0.0016 - velY) * 0.02;
        velX *= 0.9;
      }
    }

    stars.rotation.y += 0.0004;

    pins.forEach((pin, i) => {
      const isFocused = focusedFilmId && pin.userData.film?.id === focusedFilmId;
      const pulse = 0.5 + 0.5 * Math.sin(el * 2.2 + i);
      const boost = isFocused ? 1.7 : 1;
      pin.userData.halo.scale.setScalar((1 + pulse * 0.6) * boost);
      pin.userData.halo.material.opacity = (0.16 + pulse * 0.22) * (isFocused ? 1.8 : 1);
      if (pin.userData.head?.scale) {
        pin.userData.head.scale.setScalar(isFocused ? 1.35 : 1);
      }
    });

    updateHover();
    renderer.render(scene, camera);
  }
  frame();

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function resume() {
    if (running) return;
    running = true;
    clock.getDelta();
    frame();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else resume();
  });

  function dispose() {
    pause();
    ro.disconnect();
    renderer.domElement.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { focusFilm, setFocusLatLng, pause, resume, dispose };
}
