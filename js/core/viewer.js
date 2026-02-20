/**
 * viewer.js
 *
 * Three.js 3D scene for the STL preview.
 *
 * Public API (returned by initViewer):
 *   loadGeometries(geometries, colorRegions, colorMap)
 *     — geometries : { regionId: JscadGeometry }
 *     — colorRegions: design.colorRegions array
 *     — colorMap    : { regionId: hex }
 *
 *   setRegionColor(regionId, hex)
 *     — live-recolors a mesh already in the scene
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function initViewer(canvas) {
  // ── Scene ────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080810);

  // Subtle grid floor
  const grid = new THREE.GridHelper(200, 40, 0x1a1a2e, 0x1a1a2e);
  grid.position.y = -0.5;
  scene.add(grid);

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // ── Camera ───────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(80, 70, 120);

  // ── Controls ─────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = 600;

  // ── Lights ───────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(100, 150, 80);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
  fill.position.set(-80, 60, -60);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.3);
  rim.position.set(0, -50, -100);
  scene.add(rim);

  // ── Resize handler ────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── Mesh group ────────────────────────────────────────────────────────────
  const meshMap = {};   // regionId → THREE.Mesh
  let   modelGroup = new THREE.Group();
  scene.add(modelGroup);

  // ── Animate ───────────────────────────────────────────────────────────────
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Convert JSCAD geometry objects into Three.js meshes and add to scene.
   * @param {Object} geometries   — { regionId: JscadGeometryObject }
   * @param {Array}  colorRegions — design.colorRegions
   * @param {Object} colorMap     — { regionId: hex }
   */
  function loadGeometries(geometries, colorRegions, colorMap) {
    // Remove old meshes
    scene.remove(modelGroup);
    modelGroup = new THREE.Group();
    for (const key in meshMap) delete meshMap[key];

    colorRegions.forEach(region => {
      const jscadGeom = geometries[region.id];
      if (!jscadGeom) return;

      const threeGeom = jscadToThreeGeometry(jscadGeom);
      threeGeom.computeVertexNormals();

      const color = colorMap[region.id] || region.default || '#888888';
      const mat   = new THREE.MeshStandardMaterial({
        color:     new THREE.Color(color),
        roughness: 0.55,
        metalness: 0.05,
      });

      const mesh = new THREE.Mesh(threeGeom, mat);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      modelGroup.add(mesh);
      meshMap[region.id] = mesh;
    });

    scene.add(modelGroup);

    // Center camera on the model
    const box = new THREE.Box3().setFromObject(modelGroup);
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      const size   = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      controls.target.copy(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(
        center.x + maxDim * 1.2,
        center.y + maxDim * 0.9,
        center.z + maxDim * 1.5
      );
      camera.near = maxDim * 0.001;
      camera.far  = maxDim * 20;
      camera.updateProjectionMatrix();
      controls.update();
    }
  }

  /**
   * Recolor a specific region mesh in the scene without regenerating geometry.
   */
  function setRegionColor(regionId, hex) {
    const mesh = meshMap[regionId];
    if (mesh) mesh.material.color.set(hex);
  }

  return { loadGeometries, setRegionColor };
}

// ── JSCAD → Three.js geometry conversion ─────────────────────────────────

/**
 * Converts a JSCAD geom3 object (or array of them) into a THREE.BufferGeometry.
 * JSCAD geom3 stores polygons as an array of {vertices: [{pos:[x,y,z]}, …]} objects.
 */
function jscadToThreeGeometry(jscadGeom) {
  // Handle arrays by merging
  if (Array.isArray(jscadGeom)) {
    const merged = new THREE.BufferGeometry();
    const allPositions = [];
    const allNormals   = [];

    jscadGeom.forEach(g => {
      const sub = jscadToThreeGeometry(g);
      const pos = sub.attributes.position;
      const nrm = sub.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        allPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (nrm) allNormals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      }
    });

    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    if (allNormals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    merged.computeVertexNormals();
    return merged;
  }

  const positions = [];

  // JSCAD geom3 polygon format
  const polygons = jscadGeom.polygons || [];

  polygons.forEach(poly => {
    const verts = poly.vertices;
    if (!verts || verts.length < 3) return;

    // Fan triangulation
    for (let i = 1; i < verts.length - 1; i++) {
      pushVertex(positions, verts[0]);
      pushVertex(positions, verts[i]);
      pushVertex(positions, verts[i + 1]);
    }
  });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function pushVertex(arr, v) {
  // JSCAD vertex is either {pos:[x,y,z]} (old API) or [x,y,z] (newer API)
  if (Array.isArray(v)) {
    arr.push(v[0], v[1], v[2]);
  } else if (v && v.pos) {
    arr.push(v.pos[0], v.pos[1], v.pos[2]);
  } else if (v && typeof v.x === 'number') {
    arr.push(v.x, v.y, v.z);
  }
}
