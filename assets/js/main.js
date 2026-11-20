/* =========================================================================
   911 — scene, camera choreography, scroll & UI
   ========================================================================= */
(function () {
  'use strict';

  var T = window.THREE;
  var doc = document;
  var root = doc.documentElement;

  /* ---------- tiny helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function qs(s, el) { return (el || doc).querySelector(s); }
  function qsa(s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); }

  var params = new URLSearchParams(location.search);
  var SHOT = params.get('shot');
  var SHOT_T = parseFloat(params.get('t') || '0');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (SHOT) {
    root.classList.add('shot-mode');
  }

  /* ---------- error surface (visible in --dump-dom) ---------- */
  var errBox = qs('#js-errors');
  function reportError(msg) {
    window.__ERR = window.__ERR || [];
    window.__ERR.push(msg);
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = 'JSERROR :: ' + window.__ERR.join(' || ');
    }
  }
  window.addEventListener('error', function (e) {
    reportError((e.message || 'error') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    reportError('promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  /* ---------- loader ---------- */
  var loader = qs('#loader');
  var loaderBar = qs('#loader-bar');
  var loaderPct = qs('#loader-pct');
  var progressValue = 0;
  function setLoad(p) {
    progressValue = Math.max(progressValue, p);
    if (loaderBar) loaderBar.style.transform = 'scaleX(' + (progressValue / 100) + ')';
    if (loaderPct) loaderPct.textContent = Math.round(progressValue);
  }
  function finishLoad() {
    setLoad(100);
    setTimeout(function () {
      if (loader) loader.classList.add('is-done');
      root.classList.add('is-loaded');
    }, SHOT ? 0 : 260);
  }
  if (SHOT) { setLoad(100); loader.classList.add('is-done'); root.classList.add('is-loaded'); }

  /* ---------- webgl ---------- */
  var canvas = qs('#scene');
  var LOWQ = !!SHOT;
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !LOWQ, powerPreference: 'high-performance' });
  } catch (err) {
    reportError('webgl: ' + err.message);
    root.classList.add('no-webgl');
    finishLoad();
    return;
  }

  var INNER_W = window.innerWidth;
  var INNER_H = window.innerHeight;
  var DPR = LOWQ ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  renderer.setPixelRatio(DPR);
  renderer.setSize(INNER_W, INNER_H, false);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();
  var BG = new T.Color(0x05060a);
  scene.background = BG;
  scene.fog = new T.FogExp2(0x05060a, 0.026);

  var camera = new T.PerspectiveCamera(40, INNER_W / INNER_H, 0.1, 200);

  setLoad(18);

  /* ---------- environment (procedural studio HDR-ish) ---------- */
  function buildEnvironment() {
    var c = doc.createElement('canvas');
    c.width = 1024; c.height = 512;
    var g = c.getContext('2d');

    var vg = g.createLinearGradient(0, 0, 0, 512);
    vg.addColorStop(0.00, '#5a6577');
    vg.addColorStop(0.28, '#2b323d');
    vg.addColorStop(0.52, '#161a21');
    vg.addColorStop(0.78, '#080a0d');
    vg.addColorStop(1.00, '#020203');
    g.fillStyle = vg;
    g.fillRect(0, 0, 1024, 512);

    g.filter = 'blur(30px)';
    /* big overhead softbox */
    g.fillStyle = 'rgba(255,253,248,1)';
    g.fillRect(280, 6, 470, 120);
    /* side strips */
    g.fillStyle = 'rgba(214,232,255,0.85)';
    g.fillRect(40, 130, 240, 80);
    g.fillStyle = 'rgba(255,240,222,0.7)';
    g.fillRect(750, 140, 240, 90);
    /* low warm bounce */
    g.fillStyle = 'rgba(255,132,96,0.34)';
    g.fillRect(70, 330, 330, 52);
    g.fillStyle = 'rgba(126,176,255,0.26)';
    g.fillRect(600, 340, 330, 44);
    /* horizon glow */
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, 262, 1024, 20);
    g.filter = 'none';

    var tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;

    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var rt = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    return rt.texture;
  }

  scene.environment = buildEnvironment();
  setLoad(34);

  /* ---------- lights ---------- */
  var key = new T.DirectionalLight(0xfff3e2, 4.6);
  key.position.set(6.5, 9.5, -6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(LOWQ ? 1024 : 2048, LOWQ ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.055;
  scene.add(key);

  var fill = new T.DirectionalLight(0x8fb0ff, 2.0);
  fill.position.set(-8, 4.5, 5);
  scene.add(fill);

  var rim = new T.DirectionalLight(0xff5a44, 2.6);
  rim.position.set(-3.5, 2.2, 8.5);
  scene.add(rim);

  var top = new T.DirectionalLight(0xffffff, 1.4);
  top.position.set(0, 12, 0);
  scene.add(top);

  scene.add(new T.HemisphereLight(0x8298ff, 0x0a0b10, 0.9));

  /* ---------- floor ---------- */
  var floorMat = new T.MeshStandardMaterial({
    color: 0x0b0c12, metalness: 0.16, roughness: 0.74, envMapIntensity: 0.22
  });
  var floor = new T.Mesh(new T.PlaneGeometry(200, 200), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  /* soft pool of light under the car */
  var poolCanvas = doc.createElement('canvas');
  poolCanvas.width = poolCanvas.height = 256;
  var pg = poolCanvas.getContext('2d');
  var pgrd = pg.createRadialGradient(128, 128, 0, 128, 128, 128);
  pgrd.addColorStop(0, 'rgba(255,226,190,0.30)');
  pgrd.addColorStop(0.35, 'rgba(190,205,255,0.10)');
  pgrd.addColorStop(1, 'rgba(0,0,0,0)');
  pg.fillStyle = pgrd;
  pg.fillRect(0, 0, 256, 256);
  var pool = new T.Mesh(
    new T.PlaneGeometry(11, 11),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(poolCanvas), transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, opacity: 0.32
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.004;
  scene.add(pool);

  /* soft contact shadow — guarantees the car sits on the ground */
  var blobCanvas = doc.createElement('canvas');
  blobCanvas.width = 256; blobCanvas.height = 256;
  var bg2 = blobCanvas.getContext('2d');
  var bgrd = bg2.createRadialGradient(128, 128, 8, 128, 128, 126);
  bgrd.addColorStop(0, 'rgba(0,0,0,0.95)');
  bgrd.addColorStop(0.42, 'rgba(0,0,0,0.55)');
  bgrd.addColorStop(1, 'rgba(0,0,0,0)');
  bg2.fillStyle = bgrd;
  bg2.fillRect(0, 0, 256, 256);
  var blobShadow = new T.Mesh(
    new T.PlaneGeometry(4.9, 2.35),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(blobCanvas), transparent: true,
      depthWrite: false, opacity: 0.85
    })
  );
  blobShadow.rotation.x = -Math.PI / 2;
  blobShadow.position.set(0, 0.006, 0);
  scene.add(blobShadow);

  /* ---------- car ---------- */
  var car = window.buildCar({ paint: 0xd5001c });
  scene.add(car.group);
  setLoad(62);

  /* ---------- dust ---------- */
  var dustCount = window.innerWidth < 760 ? 160 : 420;
  var dustGeo = new T.BufferGeometry();
  var dustPos = new Float32Array(dustCount * 3);
  var dustSeed = new Float32Array(dustCount);
  for (var i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 22;
    dustPos[i * 3 + 1] = Math.random() * 6.5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    dustSeed[i] = Math.random() * Math.PI * 2;
  }
  dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
  var dust = new T.Points(dustGeo, new T.PointsMaterial({
    color: 0xbfd2ea, size: 0.028, transparent: true, opacity: 0.55,
    depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true
  }));
  scene.add(dust);

  /* ---------- camera choreography ---------- */
  function V(px, py, pz, tx, ty, tz, fov) {
    return { p: [px, py, pz], t: [tx, ty, tz], fov: fov };
  }

  var views = {
    hero: [
      V(5.60, 1.88, -6.55, -0.95, 0.72, 0.10, 38),
      V(6.15, 2.02, -5.90, -0.90, 0.72, 0.05, 37)
    ],
    shape: [
      V(6.40, 1.55, -6.00, 0.00, 0.68, 0.00, 36),
      V(3.30, 1.05, -7.40, 0.00, 0.62, 0.00, 34),
      V(-7.40, 1.50, -2.60, 0.00, 0.68, 0.00, 35),
      V(-6.60, 1.70, 5.60, 0.00, 0.72, 0.20, 36)
    ],
    numbers: [
      V(-5.20, 1.60, 7.20, 0.00, 0.75, 0.10, 36),
      V(-6.20, 1.85, 6.10, 0.00, 0.74, 0.00, 37)
    ],
    paint: [
      V(8.00, 1.35, 0.90, 0.00, 0.70, 0.00, 35),
      V(6.20, 1.55, -4.40, 0.00, 0.72, 0.00, 36)
    ],
    line: [
      V(3.40, 5.60, 3.00, 0.00, 0.45, 0.00, 40),
      V(5.20, 4.60, 2.40, 0.00, 0.50, 0.00, 38)
    ],
    final: [
      V(-3.60, 1.00, -5.60, 0.00, 0.70, 0.00, 36),
      V(-2.40, 0.90, -6.40, 0.00, 0.70, 0.00, 34)
    ]
  };

  var sections = qsa('[data-view]').map(function (el) {
    return { el: el, name: el.getAttribute('data-view'), view: views[el.getAttribute('data-view')] };
  });

  function sectionT(el) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = r.height - vh;
    if (total <= 4) {
      /* static section: fade across its travel through the viewport */
      return clamp((vh * 0.5 - r.top) / (r.height + vh * 0.5), 0, 1);
    }
    return clamp(-r.top / total, 0, 1);
  }

  function activeSection() {
    var vh = window.innerHeight;
    var mid = vh * 0.5;
    var best = sections[0], bestScore = -Infinity;
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return { s: sections[i], t: sectionT(sections[i].el) };
      var score = -Math.abs((r.top + r.bottom) * 0.5 - mid);
      if (score > bestScore) { bestScore = score; best = sections[i]; }
    }
    return { s: best, t: 0.5 };
  }

  function sample(list, t) {
    if (list.length === 1) return list[0];
    var n = list.length - 1;
    var x = clamp(t, 0, 1) * n;
    var i = Math.min(Math.floor(x), n - 1);
    var f = x - i;
    var e = ease(f);
    var a = list[i], b = list[i + 1];
    return {
      p: [lerp(a.p[0], b.p[0], e), lerp(a.p[1], b.p[1], e), lerp(a.p[2], b.p[2], e)],
      t: [lerp(a.t[0], b.t[0], e), lerp(a.t[1], b.t[1], e), lerp(a.t[2], b.t[2], e)],
      fov: lerp(a.fov, b.fov, e)
    };
  }

  var camState = { p: [5.4, 1.9, -7.0], t: [-0.1, 0.74, 0.1], fov: 40 };
  var target = null;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var scrollP = 0;

  function computeTarget() {
    var a = activeSection();
    var v = sample(a.s.view, a.t);
    return { p: v.p, t: v.t, fov: v.fov, name: a.s.name };
  }

  function applyCamera(dt, instant) {
    if (!target) return;
    var k = instant ? 1 : (1 - Math.exp(-dt * 3.4));
    var px = target.p[0] + mouse.x * 0.30;
    var py = target.p[1] + mouse.y * 0.16;
    var pz = target.p[2];
    camState.p[0] = lerp(camState.p[0], px, k);
    camState.p[1] = lerp(camState.p[1], py, k);
    camState.p[2] = lerp(camState.p[2], pz, k);

    var tx = target.t[0] + mouse.x * 0.10;
    var ty = target.t[1] + mouse.y * 0.05;
    var tz = target.t[2];
    camState.t[0] = lerp(camState.t[0], tx, k);
    camState.t[1] = lerp(camState.t[1], ty, k);
    camState.t[2] = lerp(camState.t[2], tz, k);
    camState.fov = lerp(camState.fov, target.fov, k);

    camera.position.set(camState.p[0], camState.p[1], camState.p[2]);
    camera.lookAt(camState.t[0], camState.t[1], camState.t[2]);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
  }

  /* ---------- animation loop ---------- */
  var clock = new T.Clock();
  var elapsed = 0;
  var frames = 0;

  function animate() {
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    target = shotTarget || computeTarget();
    mouse.x = lerp(mouse.x, mouse.tx, 1 - Math.exp(-dt * 6));
    mouse.y = lerp(mouse.y, mouse.ty, 1 - Math.exp(-dt * 6));

    applyCamera(dt, !!SHOT);

    if (!reduceMotion) {
      car.group.rotation.z = Math.sin(elapsed * 0.45) * 0.0025;
      car.group.position.y = Math.sin(elapsed * 0.7) * 0.004;

      for (var s = 0; s < car.headlights.length; s++) {
        car.headlights[s].material.opacity = 0.82 + Math.sin(elapsed * 2.6 + s) * 0.06;
      }

      var arr = dustGeo.attributes.position.array;
      for (var i = 0; i < dustCount; i++) {
        arr[i * 3 + 1] += dt * (0.045 + (dustSeed[i] % 1) * 0.05);
        arr[i * 3] += Math.sin(elapsed * 0.35 + dustSeed[i]) * dt * 0.05;
        if (arr[i * 3 + 1] > 6.5) arr[i * 3 + 1] = 0;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dust.rotation.y = elapsed * 0.008;
    }

    car.update(dt);
    renderer.render(scene, camera);

    if (frames === 0) {
      setLoad(88);
      finishLoad();
    }
    frames++;

    /* in screenshot mode stop the loop so virtual time can settle */
    if (!(SHOT && frames > 26)) {
      requestAnimationFrame(animate);
    } else {
      root.setAttribute('data-frame-count', String(frames));
    }
  }
  setLoad(78);
  animate();

  /* ---------- scroll ---------- */
  var hudName = qs('#hud-name');
  var hudIndex = qs('#hud-index');
  var progressBar = qs('#progress-bar');
  var lastSection = '';

  function onScroll() {
    var max = Math.max(1, doc.body.scrollHeight - window.innerHeight);
    scrollP = clamp(window.scrollY / max, 0, 1);
    if (progressBar) progressBar.style.transform = 'scaleX(' + scrollP + ')';

    var a = activeSection();
    if (a.s.name !== lastSection) {
      lastSection = a.s.name;
      if (hudName) hudName.textContent = a.s.el.getAttribute('data-title') || a.s.name;
      if (hudIndex) hudIndex.textContent = a.s.el.getAttribute('data-index') || '01';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- pointer ---------- */
  window.addEventListener('pointermove', function (e) {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    cursorMove(e.clientX, e.clientY);
  }, { passive: true });

  /* ---------- custom cursor ---------- */
  var cursorDot = qs('#cursor-dot');
  var cursorRing = qs('#cursor-ring');
  var ring = { x: 0, y: 0 };
  function cursorMove(x, y) {
    if (!cursorDot) return;
    cursorDot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (cursorRing) {
      ring.x = lerp(ring.x, x, 0.18);
      ring.y = lerp(ring.y, y, 0.18);
      cursorRing.style.transform = 'translate3d(' + ring.x + 'px,' + ring.y + 'px,0)';
    }
  }
  (function cursorLoop() {
    if (cursorRing) cursorRing.style.transform = 'translate3d(' + ring.x + 'px,' + ring.y + 'px,0)';
    requestAnimationFrame(cursorLoop);
  })();

  qsa('a, button, .swatch, .card').forEach(function (el) {
    el.addEventListener('pointerenter', function () { root.classList.add('cursor-hover'); });
    el.addEventListener('pointerleave', function () { root.classList.remove('cursor-hover'); });
  });

  /* ---------- split text ---------- */
  qsa('[data-split]').forEach(function (el) {
    var text = el.textContent;
    el.textContent = '';
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var sp = doc.createElement('span');
      sp.className = 'ch';
      sp.style.setProperty('--i', i);
      sp.textContent = text[i] === ' ' ? '\u00A0' : text[i];
      frag.appendChild(sp);
    }
    el.appendChild(frag);
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = qsa('.reveal');
  if ('IntersectionObserver' in window && !SHOT) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });

    var counters = qsa('[data-count]');
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          countUp(en.target);
          io2.unobserve(en.target);
        }
      });
    }, { threshold: 0.35 });
    counters.forEach(function (el) { io2.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
    qsa('[data-count]').forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      el.textContent = to.toFixed(dec);
    });
  }

  /* ---------- counters ---------- */
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var dur = 1400;
    var t0 = performance.now();
    function step(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = to.toFixed(dec);
    }
    requestAnimationFrame(step);
  }

  /* ---------- paint swatches ---------- */
  var swatches = qsa('.swatch');
  var paintName = qs('#paint-name');
  swatches.forEach(function (sw) {
    sw.addEventListener('click', function () {
      var hex = sw.getAttribute('data-hex');
      var name = sw.getAttribute('data-name');
      car.setPaint(parseInt(hex, 16));
      swatches.forEach(function (s2) { s2.classList.toggle('is-active', s2 === sw); });
      if (paintName) {
        paintName.textContent = name;
        paintName.classList.remove('flip');
        void paintName.offsetWidth;
        paintName.classList.add('flip');
      }
      root.style.setProperty('--accent', sw.getAttribute('data-accent') || '#d5001c');
    });
  });

  /* ---------- magnetic CTA ---------- */
  qsa('[data-magnetic]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var mx = (e.clientX - r.left - r.width / 2) / r.width;
      var my = (e.clientY - r.top - r.height / 2) / r.height;
      el.style.transform = 'translate3d(' + (mx * 14) + 'px,' + (my * 10) + 'px,0)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  });

  /* ---------- resize ---------- */
  function resize() {
    INNER_W = window.innerWidth;
    INNER_H = window.innerHeight;
    camera.aspect = INNER_W / INNER_H;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(INNER_W, INNER_H, false);
  }
  window.addEventListener('resize', resize);

  /* ---------- shot mode: deterministic storyboard frame ---------- */
  var shotTarget = null;
  if (SHOT) {
    var map = { hero: 'hero', side: 'shape', front34: 'shape', front: 'shape', rear: 'numbers', paint: 'paint', line: 'line', final: 'final' };
    var secName = map[SHOT] || SHOT;
    var el = qs('[data-view="' + secName + '"]');
    if (el) {
      /* render this section alone, at the top of the document, no scrolling */
      qsa('[data-view]').forEach(function (s2) { if (s2 !== el) s2.style.display = 'none'; });
      el.style.height = 'auto';
      el.style.minHeight = '100svh';
      var sticky = el.querySelector('.shape__sticky');
      if (sticky) sticky.style.position = 'relative';
      doc.body.style.overflow = 'hidden';

      var v2 = sample(views[secName] || views.hero, SHOT_T);
      shotTarget = { p: v2.p, t: v2.t, fov: v2.fov };
      camera.position.set(v2.p[0], v2.p[1], v2.p[2]);
      camera.lookAt(v2.t[0], v2.t[1], v2.t[2]);
      camera.fov = v2.fov;
      camera.updateProjectionMatrix();

      car.update(1);
      renderer.render(scene, camera);
      root.setAttribute('data-shot-ready', '1');
      document.title = 'SHOT ' + SHOT + ' section=' + secName + ' t=' + SHOT_T +
        ' cam=' + camera.position.toArray().map(function (n) { return n.toFixed(1); }).join(',');
    } else {
      reportError('shot section not found: ' + SHOT);
    }
  }
})();
