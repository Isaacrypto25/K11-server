/**
 * K11 OMNI ELITE — THREE.JS BACKGROUND ENGINE v8
 * Background 3D imersivo: partículas, geometrias flutuantes, field lines
 */
'use strict';

const K11ThreeBG = (() => {
  let _scene, _camera, _renderer, _canvas;
  let _particles, _geometries = [], _lines = [];
  let _animFrame, _running = false;
  let _w = window.innerWidth, _h = window.innerHeight;
  let _mouse = { x: 0, y: 0 };
  let _t = 0;

  // Colors (updated per theme)
  let _col1 = new THREE.Color('#FF8C00');
  let _col2 = new THREE.Color('#6366f1');
  let _col3 = new THREE.Color('#10B981');

  function init(canvasEl) {
    if (!canvasEl || typeof THREE === 'undefined') return;
    _canvas = canvasEl;
    _w = window.innerWidth;
    _h = window.innerHeight;

    // Renderer
    _renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: false });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    _renderer.setSize(_w, _h);
    _renderer.setClearColor(0x000000, 0);

    // Scene + Camera
    _scene = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(60, _w / _h, 0.1, 2000);
    _camera.position.z = 600;

    _buildParticles();
    _buildFloatingGeo();
    _buildFieldLines();

    window.addEventListener('resize', _onResize, { passive: true });
    window.addEventListener('mousemove', _onMouse, { passive: true });
    window.addEventListener('touchmove', _onTouch, { passive: true });

    _running = true;
    _animate();
    console.log('[K11ThreeBG] ✅ Three.js background running');

    // Register with theme engine
    if (typeof K11ThemeEngine !== 'undefined') K11ThemeEngine.registerThreeEngine({ setColors });
  }

  // ── PARTICLES ──────────────────────────────────────────────────
  function _buildParticles() {
    const count = Math.min(1800, Math.floor((_w * _h) / 1200));
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const colors = [_col1, _col2, _col3];
    for (let i = 0; i < count; i++) {
      const spread = 700;
      pos[i * 3]     = (Math.random() - 0.5) * spread * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      const c = colors[Math.floor(Math.random() * 3)];
      col[i * 3]     = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      sizes[i] = Math.random() * 2.5 + 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });

    _particles = new THREE.Points(geo, mat);
    _scene.add(_particles);
  }

  // ── FLOATING GEOMETRIES ────────────────────────────────────────
  function _buildFloatingGeo() {
    const shapes = [
      { geo: new THREE.OctahedronGeometry(18, 0),    x: -250, y: 120,  z: -200 },
      { geo: new THREE.TetrahedronGeometry(14, 0),   x:  280, y: -80,  z: -150 },
      { geo: new THREE.OctahedronGeometry(12, 1),    x: -80,  y: -160, z: -300 },
      { geo: new THREE.TetrahedronGeometry(22, 0),   x:  180, y: 200,  z: -400 },
      { geo: new THREE.OctahedronGeometry(9, 0),     x:  -320,y: -50,  z: -250 },
    ];

    const edgeColors = [_col1, _col2, _col3, _col1, _col2];
    shapes.forEach((s, i) => {
      const edges = new THREE.EdgesGeometry(s.geo);
      const mat   = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: edgeColors[i % edgeColors.length],
        transparent: true,
        opacity: 0.25,
      }));
      mat.position.set(s.x, s.y, s.z);
      mat.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mat.userData = {
        rx: (Math.random() - 0.5) * 0.004,
        ry: (Math.random() - 0.5) * 0.005,
        floatSpeed: Math.random() * 0.001 + 0.0005,
        floatOffset: Math.random() * Math.PI * 2,
        origY: s.y,
      };
      _geometries.push(mat);
      _scene.add(mat);
    });
  }

  // ── FIELD LINES (connection lines between particles) ──────────
  function _buildFieldLines() {
    const lineCount = 8;
    for (let i = 0; i < lineCount; i++) {
      const pts = [];
      const segments = 12;
      for (let j = 0; j < segments; j++) {
        pts.push(new THREE.Vector3(
          (Math.random() - 0.5) * 900,
          (Math.random() - 0.5) * 500,
          (Math.random() - 0.5) * 400 - 100
        ));
      }
      const curve  = new THREE.CatmullRomCurve3(pts);
      const points = curve.getPoints(60);
      const geo    = new THREE.BufferGeometry().setFromPoints(points);
      const mat    = new THREE.LineBasicMaterial({
        color: [_col1, _col2, _col3][i % 3],
        transparent: true,
        opacity: 0.07 + Math.random() * 0.08,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { speed: (Math.random() - 0.5) * 0.003, origPts: pts.map(p => p.clone()) };
      _lines.push(line);
      _scene.add(line);
    }
  }

  // ── ANIMATION ─────────────────────────────────────────────────
  function _animate() {
    if (!_running) return;
    _animFrame = requestAnimationFrame(_animate);
    _t += 0.004;

    // Rotate particle cloud slowly + mouse parallax
    if (_particles) {
      _particles.rotation.y = _t * 0.06 + _mouse.x * 0.00015;
      _particles.rotation.x = _t * 0.03 + _mouse.y * 0.00010;
    }

    // Float geometries
    _geometries.forEach(g => {
      g.rotation.x += g.userData.rx;
      g.rotation.y += g.userData.ry;
      g.position.y  = g.userData.origY + Math.sin(_t + g.userData.floatOffset) * 25;
    });

    // Drift field lines
    _lines.forEach(l => {
      l.rotation.z += l.userData.speed;
    });

    // Camera subtle drift
    _camera.position.x += (_mouse.x * 0.025 - _camera.position.x) * 0.02;
    _camera.position.y += (-_mouse.y * 0.025 - _camera.position.y) * 0.02;
    _camera.lookAt(_scene.position);

    _renderer.render(_scene, _camera);
  }

  // ── THEME COLOR UPDATE ─────────────────────────────────────────
  function setColors(c1, c2, c3) {
    _col1 = new THREE.Color(c1);
    _col2 = new THREE.Color(c2);
    _col3 = new THREE.Color(c3);

    // Update particle colors
    if (_particles) {
      const col = _particles.geometry.attributes.color;
      const count = col.count;
      const colors = [_col1, _col2, _col3];
      for (let i = 0; i < count; i++) {
        const c = colors[i % 3];
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }

    // Update geometry edge colors
    const edgeColors = [_col1, _col2, _col3];
    _geometries.forEach((g, i) => {
      g.material.color = edgeColors[i % 3];
    });

    // Update field line colors
    _lines.forEach((l, i) => {
      l.material.color = [_col1, _col2, _col3][i % 3];
    });
  }

  function _onResize() {
    _w = window.innerWidth; _h = window.innerHeight;
    _camera.aspect = _w / _h;
    _camera.updateProjectionMatrix();
    _renderer.setSize(_w, _h);
  }

  function _onMouse(e) {
    _mouse.x = e.clientX - _w / 2;
    _mouse.y = e.clientY - _h / 2;
  }

  function _onTouch(e) {
    if (!e.touches[0]) return;
    _mouse.x = e.touches[0].clientX - _w / 2;
    _mouse.y = e.touches[0].clientY - _h / 2;
  }

  function destroy() {
    _running = false;
    cancelAnimationFrame(_animFrame);
    window.removeEventListener('resize', _onResize);
    window.removeEventListener('mousemove', _onMouse);
    _renderer?.dispose();
  }

  return { init, setColors, destroy };
})();

window.K11ThreeBG = K11ThreeBG;
