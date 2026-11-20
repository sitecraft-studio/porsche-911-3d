/* =========================================================================
   911 — procedural geometry
   Hand-built in code: no models, no textures, no external assets.
   Body = lofted super-ellipse sections with real wheel-arch cut-outs.
   ========================================================================= */
(function (global) {
  'use strict';
  var T = global.THREE;
  if (!T) return;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function resample(list, sub) {
    var out = [], n = list.length, i, k, t;
    sub = sub || 5;
    for (i = 0; i < n - 1; i++) {
      var p0 = list[Math.max(0, i - 1)], p1 = list[i];
      var p2 = list[i + 1], p3 = list[Math.min(n - 1, i + 2)];
      for (k = 0; k < sub; k++) {
        t = k / sub;
        out.push({
          z: p1.z + (p2.z - p1.z) * t,
          w: cr(p0.w, p1.w, p2.w, p3.w, t),
          top: cr(p0.top, p1.top, p2.top, p3.top, t),
          bottom: cr(p0.bottom, p1.bottom, p2.bottom, p3.bottom, t),
          n: p1.n || 5.5,
          tuck: p1.tuck === undefined ? 0.2 : p1.tuck,
          dip: cr(p0.dip || 0, p1.dip || 0, p2.dip || 0, p3.dip || 0, t)
        });
      }
    }
    out.push(list[n - 1]);
    return out;
  }

  /* ---------- loft with optional circular cut-outs ---------- */
  function loftGeometry(sections, opt) {
    opt = opt || {};
    var radial = opt.radial || 64;
    var splitFn = opt.split || null;
    var holes = opt.holes || null;
    var R = sections.length, N = radial;
    var pos = [], idxA = [], idxB = [];
    var i, j, topness = 0;

    var rings = [];
    for (i = 0; i < R; i++) {
      var s = sections[i];
      var yc = (s.top + s.bottom) * 0.5;
      var hh = Math.max((s.top - s.bottom) * 0.5, 1e-4);
      var e = 2 / (s.n || 5.5);
      var tuck = s.tuck === undefined ? 0.2 : s.tuck;
      var dip = s.dip || 0;
      var ring = [];
      for (j = 0; j < N; j++) {
        var th = (j / N) * Math.PI * 2;
        var cu = Math.cos(th), sv = Math.sin(th);
        var x = s.w * Math.sign(cu) * Math.pow(Math.abs(cu), e);
        var y = yc + hh * Math.sign(sv) * Math.pow(Math.abs(sv), e);
        var hNorm = clamp((y - s.bottom) / (s.top - s.bottom), 0, 1);
        x *= 1 - tuck * (1 - hNorm);
        if (dip > 0 && y > yc) {
          /* fenders sit higher than the hood / engine lid */
          var f = Math.max(0, 1 - Math.pow(Math.abs(x) / Math.max(s.w, 1e-4), 2));
          y -= dip * f * ((y - yc) / hh);
        }
        ring.push([x, y]);
      }
      rings.push({ z: s.z, pts: ring });
    }

    for (i = 0; i < R; i++) {
      for (j = 0; j < N; j++) {
        pos.push(rings[i].pts[j][0], rings[i].pts[j][1], rings[i].z);
      }
    }

    function inHole(cx, cy, cz) {
      if (!holes) return false;
      for (var h = 0; h < holes.length; h++) {
        var q = holes[h];
        var dy = cy - q.y, dz = cz - q.z;
        if (dy * dy + dz * dz < q.r * q.r) return true;
      }
      return false;
    }

    function pushTri(ia, ib, ic) {
      var a = ia * 3, b = ib * 3, c = ic * 3;
      var cx = (pos[a] + pos[b] + pos[c]) / 3;
      var cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      var cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      if (inHole(cx, cy, cz)) return;

      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;

      var g = splitFn ? splitFn(ny, cy, cz, topness) : 0;
      if (g === 0) idxA.push(ia, ib, ic); else idxB.push(ia, ib, ic);
    }

    for (i = 0; i < R - 1; i++) {
      for (j = 0; j < N; j++) {
        var j2 = (j + 1) % N;
        var a0 = i * N + j, b0 = i * N + j2;
        var c0 = (i + 1) * N + j, d0 = (i + 1) * N + j2;
        topness = Math.sin(((j + 0.5) / N) * Math.PI * 2);
        pushTri(a0, c0, b0);
        pushTri(b0, c0, d0);
      }
    }

    /* caps */
    topness = 1;
    var first = rings[0], last = rings[R - 1];
    var ciFront = pos.length / 3;
    pos.push(0, (first.pts[0][1] + first.pts[Math.floor(N / 2)][1]) * 0.5, first.z);
    var ciBack = pos.length / 3;
    pos.push(0, (last.pts[0][1] + last.pts[Math.floor(N / 2)][1]) * 0.5, last.z);
    for (j = 0; j < N; j++) {
      var jn = (j + 1) % N;
      pushTri(ciFront, j, jn);
      pushTri(ciBack, (R - 1) * N + jn, (R - 1) * N + j);
    }

    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idxA.concat(idxB));
    geo.addGroup(0, idxA.length, 0);
    if (idxB.length) geo.addGroup(idxA.length, idxB.length, 1);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* ---------- wheel ------------------------------------------------ */
  function buildWheel(R, W, mats) {
    var g = new T.Group();

    /* tire: torus, axis along X */
    var tire = new T.Mesh(new T.TorusGeometry(R * 0.715, R * 0.285, 18, 48), mats.rubber);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    g.add(tire);

    /* rim face on the outboard side */
    var face = new T.Mesh(new T.CylinderGeometry(R * 0.60, R * 0.60, 0.035, 32), mats.rim);
    face.rotation.z = Math.PI / 2;
    face.position.x = W * 0.20;
    face.castShadow = true;
    g.add(face);

    /* ten spokes */
    for (var k = 0; k < 5; k++) {
      var spoke = new T.Mesh(new T.BoxGeometry(0.030, R * 0.52, 0.062), mats.spoke);
      spoke.position.x = W * 0.225;
      spoke.rotation.x = (k / 5) * Math.PI;
      g.add(spoke);
    }

    /* hub cap */
    var hub = new T.Mesh(new T.CylinderGeometry(0.058, 0.058, 0.05, 20), mats.chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = W * 0.26;
    g.add(hub);

    /* brake disc + caliper inboard */
    var disc = new T.Mesh(new T.CylinderGeometry(R * 0.47, R * 0.47, 0.02, 30), mats.disc);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -W * 0.10;
    g.add(disc);

    var cal = new T.Mesh(new T.BoxGeometry(0.045, 0.10, 0.055), mats.caliper);
    cal.position.set(W * 0.02, R * 0.34, -R * 0.22);
    g.add(cal);

    return g;
  }

  /* ---------- car --------------------------------------------------- */
  global.buildCar = function (opts) {
    opts = opts || {};
    var group = new T.Group();
    var body = new T.Group();
    group.add(body);

    var paint = new T.MeshPhysicalMaterial({
      color: new T.Color(opts.paint === undefined ? 0xd5001c : opts.paint),
      metalness: 0.66, roughness: 0.22,
      clearcoat: 1.0, clearcoatRoughness: 0.04,
      envMapIntensity: 1.5,
      side: T.DoubleSide
    });

    var trim = new T.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.3, roughness: 0.6, side: T.DoubleSide });
    var glass = new T.MeshPhysicalMaterial({
      color: 0x090d13, metalness: 0.15, roughness: 0.07,
      clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.5,
      side: T.DoubleSide
    });
    var rubber = new T.MeshStandardMaterial({ color: 0x08090a, metalness: 0.0, roughness: 0.95 });
    var rimMat = new T.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.3, envMapIntensity: 2.2 });
    var spokeMat = new T.MeshStandardMaterial({ color: 0x24262b, metalness: 0.7, roughness: 0.42 });
    var discMat = new T.MeshStandardMaterial({ color: 0x6b7076, metalness: 1.0, roughness: 0.5 });
    var caliperMat = new T.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.45, roughness: 0.35 });
    var chrome = new T.MeshStandardMaterial({ color: 0xdde2e8, metalness: 1.0, roughness: 0.14, envMapIntensity: 1.6 });
    var lightMat = new T.MeshStandardMaterial({ color: 0xfff8ec, emissive: 0xfff4e0, emissiveIntensity: 3.2, roughness: 0.25 });
    var tailMat = new T.MeshStandardMaterial({ color: 0x250106, emissive: 0xff1222, emissiveIntensity: 3.4, roughness: 0.35 });

    var mats = { rubber: rubber, rim: rimMat, disc: discMat, caliper: caliperMat, chrome: chrome, spoke: spokeMat };

    var WHEEL_R = 0.352;
    var AXLE_F = -1.30, AXLE_R = 1.30;
    var WHEEL_X = 0.815;
    var ARCH_R = 0.388;

    var holes = [
      { y: WHEEL_R, z: AXLE_F, r: ARCH_R },
      { y: WHEEL_R, z: AXLE_R, r: ARCH_R }
    ];

    /* ---- main body shell ---- */
    var bodySections = [
      { z: -2.24, w: 0.625, top: 0.556, bottom: 0.300, n: 6.0 },
      { z: -2.19, w: 0.780, top: 0.580, bottom: 0.272, n: 6.4 },
      { z: -2.08, w: 0.858, top: 0.625, bottom: 0.250, n: 6.6 },
      { z: -1.94, w: 0.888, top: 0.695, bottom: 0.240, n: 6.2, dip: 0.050 },
      { z: -1.72, w: 0.904, top: 0.760, bottom: 0.234, n: 6.8, dip: 0.058 },
      { z: -1.42, w: 0.912, top: 0.795, bottom: 0.230, n: 7.0, dip: 0.058 },
      { z: -1.10, w: 0.910, top: 0.818, bottom: 0.228, n: 7.0, dip: 0.055 },
      { z: -0.76, w: 0.904, top: 0.836, bottom: 0.228, n: 7.0, dip: 0.048 },
      { z: -0.40, w: 0.900, top: 0.848, bottom: 0.228, n: 7.0, dip: 0.030 },
      { z: -0.02, w: 0.900, top: 0.856, bottom: 0.228, n: 7.0, dip: 0.014 },
      { z: 0.42, w: 0.906, top: 0.866, bottom: 0.228, n: 6.8, dip: 0.014 },
      { z: 0.86, w: 0.920, top: 0.884, bottom: 0.228, n: 6.6, dip: 0.022 },
      { z: 1.28, w: 0.934, top: 0.900, bottom: 0.232, n: 6.2, dip: 0.018 },
      { z: 1.68, w: 0.926, top: 0.905, bottom: 0.242, n: 5.8, dip: 0.010 },
      { z: 1.98, w: 0.888, top: 0.895, bottom: 0.256, n: 5.4 },
      { z: 2.16, w: 0.804, top: 0.872, bottom: 0.284, n: 5.0 },
      { z: 2.26, w: 0.640, top: 0.842, bottom: 0.318, n: 4.6 }
    ];

    var bodyGeo = loftGeometry(resample(bodySections, 5), { radial: 72, holes: holes });
    var shell = new T.Mesh(bodyGeo, paint);
    shell.castShadow = true;
    shell.receiveShadow = true;
    body.add(shell);

    /* ---- greenhouse ---- */
    var cabinSections = [
      { z: -0.86, w: 0.585, top: 0.842, bottom: 0.780, n: 4.0, tuck: 0.06 },
      { z: -0.64, w: 0.700, top: 0.896, bottom: 0.772, n: 4.2, tuck: 0.05 },
      { z: -0.40, w: 0.760, top: 1.000, bottom: 0.770, n: 4.4, tuck: 0.04 },
      { z: -0.12, w: 0.786, top: 1.110, bottom: 0.770, n: 4.6, tuck: 0.03 },
      { z: 0.16, w: 0.793, top: 1.205, bottom: 0.774, n: 4.8, tuck: 0.02 },
      { z: 0.44, w: 0.793, top: 1.268, bottom: 0.784, n: 5.0, tuck: 0.02 },
      { z: 0.72, w: 0.786, top: 1.286, bottom: 0.794, n: 5.0, tuck: 0.02 },
      { z: 0.96, w: 0.770, top: 1.262, bottom: 0.806, n: 4.8, tuck: 0.03 },
      { z: 1.18, w: 0.734, top: 1.196, bottom: 0.820, n: 4.6, tuck: 0.04 },
      { z: 1.38, w: 0.684, top: 1.100, bottom: 0.836, n: 4.4, tuck: 0.05 },
      { z: 1.54, w: 0.620, top: 0.995, bottom: 0.850, n: 4.2, tuck: 0.05 },
      { z: 1.66, w: 0.545, top: 0.925, bottom: 0.862, n: 4.0, tuck: 0.06 },
      { z: 1.74, w: 0.470, top: 0.885, bottom: 0.872, n: 4.0, tuck: 0.06 }
    ];

    var cabinGeo = loftGeometry(resample(cabinSections, 6), {
      radial: 60,
      split: function (ny, cy, cz, topness) {
        /* painted roof band, glass below it */
        return (topness > 0.55 && cy > 1.05) ? 1 : 0;
      }
    });
    var cabin = new T.Mesh(cabinGeo, [glass, paint]);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    body.add(cabin);

    /* ---- rocker / underbody ---- */
    var sillSections = [
      { z: -1.92, w: 0.54, top: 0.33, bottom: 0.190, n: 6, tuck: 0.10 },
      { z: -1.70, w: 0.64, top: 0.35, bottom: 0.160, n: 6, tuck: 0.08 },
      { z: -1.20, w: 0.70, top: 0.36, bottom: 0.160, n: 6, tuck: 0.06 },
      { z: -0.40, w: 0.685, top: 0.37, bottom: 0.160, n: 6, tuck: 0.06 },
      { z: 0.40, w: 0.690, top: 0.37, bottom: 0.160, n: 6, tuck: 0.06 },
      { z: 1.20, w: 0.715, top: 0.38, bottom: 0.165, n: 6, tuck: 0.06 },
      { z: 1.80, w: 0.685, top: 0.38, bottom: 0.190, n: 6, tuck: 0.08 },
      { z: 2.10, w: 0.600, top: 0.39, bottom: 0.230, n: 6, tuck: 0.10 }
    ];
    var sill = new T.Mesh(loftGeometry(resample(sillSections, 4), { radial: 44 }), trim);
    sill.castShadow = true;
    sill.receiveShadow = true;
    body.add(sill);

    /* ---- wheels ---- */
    var wF = buildWheel(WHEEL_R, 0.245, mats);
    var wR = buildWheel(WHEEL_R, 0.295, mats);

    [[WHEEL_X, AXLE_F, wF, 1], [-WHEEL_X, AXLE_F, wF, -1],
     [WHEEL_X, AXLE_R, wR, 1], [-WHEEL_X, AXLE_R, wR, -1]].forEach(function (it) {
      var m = it[2].clone();
      m.position.set(it[0], WHEEL_R, it[1]);
      if (it[3] < 0) m.scale.x = -1;
      group.add(m);
    });

    /* arch liners so the cut-outs don't show through */
    [[AXLE_F, 0.46], [AXLE_R, 0.49]].forEach(function (a) {
      var liner = new T.Mesh(
        new T.CylinderGeometry(0.435, 0.435, a[1], 26, 1, true),
        new T.MeshStandardMaterial({ color: 0x05060a, metalness: 0.2, roughness: 0.95, side: T.DoubleSide })
      );
      liner.rotation.z = Math.PI / 2;
      liner.position.set(0, WHEEL_R, a[0]);
      body.add(liner);
    });

    /* ---- headlights ---- */
    [-1, 1].forEach(function (side) {
      var lampX = side * 0.60;

      var housing = new T.Mesh(new T.CylinderGeometry(0.128, 0.128, 0.05, 26), trim);
      housing.rotation.x = Math.PI / 2;
      housing.position.set(lampX, 0.742, -1.915);
      body.add(housing);

      var lens = new T.Mesh(new T.CylinderGeometry(0.112, 0.112, 0.03, 26), lightMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(lampX, 0.742, -1.938);
      body.add(lens);

      var ring = new T.Mesh(new T.TorusGeometry(0.118, 0.008, 8, 30), chrome);
      ring.position.set(lampX, 0.742, -1.930);
      body.add(ring);
    });

    /* ---- front details ---- */
    var lip = new T.Mesh(new T.BoxGeometry(1.12, 0.020, 0.06), trim);
    lip.position.set(0, 0.330, -2.215);
    body.add(lip);

    [-1, 1].forEach(function (side) {
      var intake = new T.Mesh(new T.BoxGeometry(0.24, 0.048, 0.03), trim);
      intake.position.set(side * 0.46, 0.420, -2.236);
      body.add(intake);
    });

    /* ---- tail ---- */
    var tailBar = new T.Mesh(new T.BoxGeometry(1.44, 0.050, 0.040), tailMat);
    tailBar.position.set(0, 0.855, 2.252);
    body.add(tailBar);

    var tailThin = new T.Mesh(new T.BoxGeometry(1.47, 0.012, 0.016), tailMat);
    tailThin.position.set(0, 0.892, 2.250);
    body.add(tailThin);

    var diffuser = new T.Mesh(new T.BoxGeometry(1.38, 0.075, 0.22), trim);
    diffuser.position.set(0, 0.300, 2.170);
    body.add(diffuser);

    /* ---- ducktail ---- */
    var wing = new T.Mesh(new T.BoxGeometry(1.26, 0.028, 0.225), paint);
    wing.position.set(0, 0.962, 1.955);
    wing.rotation.x = -0.10;
    wing.castShadow = true;
    body.add(wing);

    [-1, 1].forEach(function (side) {
      var strut = new T.Mesh(new T.BoxGeometry(0.042, 0.055, 0.12), trim);
      strut.position.set(side * 0.520, 0.928, 1.970);
      body.add(strut);
    });

    /* ---- mirrors ---- */
    [-1, 1].forEach(function (side) {
      var arm = new T.Mesh(new T.BoxGeometry(0.17, 0.030, 0.05), trim);
      arm.position.set(side * 0.895, 0.900, -0.545);
      body.add(arm);

      var cap = new T.Mesh(new T.SphereGeometry(0.085, 16, 12), paint);
      cap.scale.set(1.15, 0.72, 0.85);
      cap.position.set(side * 0.985, 0.935, -0.565);
      cap.castShadow = true;
      body.add(cap);
    });

    /* ---- door handle ---- */
    [-1, 1].forEach(function (side) {
      var handle = new T.Mesh(new T.BoxGeometry(0.020, 0.032, 0.15), chrome);
      handle.position.set(side * 0.896, 0.742, 0.180);
      body.add(handle);
    });

    /* ---- exhausts ---- */
    [-1, 1].forEach(function (side) {
      var pipe = new T.Mesh(new T.CylinderGeometry(0.045, 0.050, 0.12, 16, 1, true), chrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.28, 0.315, 2.258);
      body.add(pipe);
    });

    /* ---- PORSCHE badge ---- */
    var badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 512; badgeCanvas.height = 128;
    var bx = badgeCanvas.getContext('2d');
    bx.clearRect(0, 0, 512, 128);
    bx.fillStyle = 'rgba(235,235,235,0.9)';
    bx.font = '500 46px Inter, Arial, sans-serif';
    bx.textAlign = 'center';
    bx.textBaseline = 'middle';
    bx.fillText('P O R S C H E', 256, 66);
    var badgeTex = new T.CanvasTexture(badgeCanvas);
    badgeTex.colorSpace = T.SRGBColorSpace;
    var badge = new T.Mesh(
      new T.PlaneGeometry(0.58, 0.145),
      new T.MeshBasicMaterial({ map: badgeTex, transparent: true, opacity: 0.8, depthWrite: false })
    );
    badge.position.set(0, 0.790, 2.262);
    body.add(badge);

    /* ---- headlight glow ---- */
    var glowTex = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g2 = c.getContext('2d');
      var grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,250,235,1)');
      grad.addColorStop(0.22, 'rgba(255,242,214,0.5)');
      grad.addColorStop(0.55, 'rgba(255,224,175,0.14)');
      grad.addColorStop(1, 'rgba(255,210,150,0)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 128, 128);
      var t = new T.CanvasTexture(c);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    })();

    var sprites = [];
    [-1, 1].forEach(function (side) {
      var sp = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: 0xfff2dc, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, opacity: 0.75
      }));
      sp.scale.set(0.95, 0.95, 1);
      sp.position.set(side * 0.60, 0.735, -1.925);
      body.add(sp);
      sprites.push(sp);
    });

    var current = new T.Color(opts.paint === undefined ? 0xd5001c : opts.paint);
    var target = current.clone();

    return {
      group: group,
      body: body,
      paint: paint,
      headlights: sprites,
      wheels: { front: wF, rear: wR, radius: WHEEL_R },
      setPaint: function (hex) { target.set(hex); },
      update: function (dt) {
        current.lerp(target, Math.min(1, dt * 3.2));
        paint.color.copy(current);
      }
    };
  };
})(window);
