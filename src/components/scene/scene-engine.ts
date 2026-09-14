import * as THREE from 'three';

export interface SceneNode {
  id: string;
  name: string;
  health: 'healthy' | 'warning' | 'critical' | 'stale';
  load: number;
}

export interface SceneOptions {
  onSelect?(id: string | null): void;
}

const HEALTH_COLORS: Record<SceneNode['health'], number> = {
  healthy: 0x5eead4,
  warning: 0xfbbf24,
  critical: 0xfb7185,
  stale: 0x64748b,
};

/** Deterministic point on a sphere so a node keeps its place between renders. */
function placement(id: string, radius: number): THREE.Vector3 {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const a = ((hash >>> 0) % 10_000) / 10_000;
  const b = ((Math.imul(hash, 31) >>> 0) % 10_000) / 10_000;
  const theta = a * Math.PI * 2;
  const phi = Math.acos(2 * b - 1);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi) * 0.7,
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

interface NodeVisual {
  id: string;
  group: THREE.Group;
  marker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  link: THREE.Line;
  load: number;
  basePosition: THREE.Vector3;
}

/**
 * The background operations view.
 *
 * Written against plain three.js rather than a React renderer: the scene is one
 * long-lived imperative object driven by prop changes, which avoids rebuilding
 * GPU resources on every React render and keeps the frame loop independent of
 * the component tree.
 */
export class NeoSceneEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly nodeLayer = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private core!: THREE.LineSegments;
  private coreGlow!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private stars!: THREE.Points;
  private ring!: THREE.Points;

  private visuals = new Map<string, NodeVisual>();
  private frame = 0;
  private running = false;
  private clock = new THREE.Clock();

  private orbit = { azimuth: 0.6, polar: 1.15, distance: 7.2, targetDistance: 7.2 };
  private drag: { x: number; y: number } | null = null;
  private selectedId: string | null = null;
  private activityColor: THREE.Color | null = null;
  private activityUntil = 0;

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: SceneOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.scene.add(this.root);
    this.root.add(this.nodeLayer);

    this.buildStars();
    this.buildCore();
    this.buildRing();

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.resize();
  }

  // --- construction ------------------------------------------------------

  private buildStars(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 24 + Math.random() * 45;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
    this.disposables.push(geometry, material);
  }

  private buildCore(): void {
    const geometry = new THREE.IcosahedronGeometry(2, 3);
    const wireframe = new THREE.WireframeGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.26,
    });
    this.core = new THREE.LineSegments(wireframe, material);
    this.root.add(this.core);

    const glowGeometry = new THREE.SphereGeometry(1.86, 48, 48);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x0e7490,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.coreGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.root.add(this.coreGlow);

    this.disposables.push(geometry, wireframe, material, glowGeometry, glowMaterial);
  }

  private buildRing(): void {
    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 3.3 + (Math.random() - 0.5) * 0.18;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.06;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x22d3ee,
      size: 0.045,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ring = new THREE.Points(geometry, material);
    this.ring.rotation.x = 0.42;
    this.root.add(this.ring);
    this.disposables.push(geometry, material);
  }

  // --- public API --------------------------------------------------------

  setNodes(nodes: SceneNode[]): void {
    const seen = new Set<string>();

    for (const node of nodes) {
      seen.add(node.id);
      const color = HEALTH_COLORS[node.health];
      const existing = this.visuals.get(node.id);
      if (existing) {
        existing.marker.material.color.setHex(color);
        existing.halo.material.color.setHex(color);
        (existing.link.material as THREE.LineBasicMaterial).color.setHex(color);
        existing.load = node.load;
        continue;
      }
      this.visuals.set(node.id, this.createNodeVisual(node, color));
    }

    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      this.nodeLayer.remove(visual.group);
      visual.marker.geometry.dispose();
      visual.marker.material.dispose();
      visual.halo.geometry.dispose();
      visual.halo.material.dispose();
      visual.link.geometry.dispose();
      (visual.link.material as THREE.Material).dispose();
      this.visuals.delete(id);
    }
  }

  private createNodeVisual(node: SceneNode, color: number): NodeVisual {
    const position = placement(node.id, 3.05);
    const group = new THREE.Group();

    const markerGeometry = new THREE.SphereGeometry(0.085, 20, 20);
    const markerMaterial = new THREE.MeshBasicMaterial({ color });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.userData.nodeId = node.id;
    group.add(marker);

    const haloGeometry = new THREE.SphereGeometry(0.2, 20, 20);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    group.add(halo);

    const linkGeometry = new THREE.BufferGeometry().setFromPoints([
      position.clone().multiplyScalar(0.62),
      position.clone(),
    ]);
    const linkMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    const link = new THREE.Line(linkGeometry, linkMaterial);

    group.position.copy(position);
    this.nodeLayer.add(group);
    this.nodeLayer.add(link);

    return { id: node.id, group, marker, halo, link, load: node.load, basePosition: position };
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
  }

  /** Flashes the core in an agent's colour while that agent is working. */
  pulse(colorHex: string, durationMs = 1400): void {
    this.activityColor = new THREE.Color(colorHex);
    this.activityUntil = performance.now() + durationMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.setNodes([]);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }

  // --- interaction -------------------------------------------------------

  private handlePointerDown = (event: PointerEvent): void => {
    this.drag = { x: event.clientX, y: event.clientY };
    this.updatePointer(event);
    const hit = this.pick();
    if (hit) this.options.onSelect?.(hit);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    this.drag = { x: event.clientX, y: event.clientY };
    this.orbit.azimuth -= dx * 0.005;
    this.orbit.polar = Math.min(Math.PI - 0.25, Math.max(0.25, this.orbit.polar - dy * 0.005));
  };

  private handlePointerUp = (): void => {
    this.drag = null;
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.orbit.targetDistance = Math.min(
      14,
      Math.max(4.2, this.orbit.targetDistance + event.deltaY * 0.004),
    );
  };

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const markers = [...this.visuals.values()].map((visual) => visual.marker);
    const hits = this.raycaster.intersectObjects(markers, false);
    const first = hits[0];
    return first ? ((first.object.userData.nodeId as string) ?? null) : null;
  }

  // --- frame loop --------------------------------------------------------

  private loop = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);

    const elapsed = this.clock.getElapsedTime();
    const now = performance.now();

    this.orbit.distance += (this.orbit.targetDistance - this.orbit.distance) * 0.08;
    if (!this.drag) this.orbit.azimuth += 0.0009;

    const sinPolar = Math.sin(this.orbit.polar);
    this.camera.position.set(
      this.orbit.distance * sinPolar * Math.sin(this.orbit.azimuth),
      this.orbit.distance * Math.cos(this.orbit.polar),
      this.orbit.distance * sinPolar * Math.cos(this.orbit.azimuth),
    );
    this.camera.lookAt(0, 0, 0);

    this.core.rotation.y = elapsed * 0.06;
    this.core.rotation.x = Math.sin(elapsed * 0.12) * 0.08;
    this.ring.rotation.y = -elapsed * 0.14;
    this.stars.rotation.y = elapsed * 0.006;

    const active = now < this.activityUntil && this.activityColor;
    const breathe = 0.16 + Math.sin(elapsed * 1.8) * 0.05;
    this.coreGlow.material.opacity = active ? breathe + 0.16 : breathe;
    if (active) this.coreGlow.material.color.lerp(this.activityColor!, 0.12);
    else this.coreGlow.material.color.lerp(new THREE.Color(0x0e7490), 0.05);

    for (const visual of this.visuals.values()) {
      const selected = visual.id === this.selectedId;
      const beat = 1 + Math.sin(elapsed * (1.4 + visual.load * 2.6) + visual.basePosition.x) * 0.12;
      visual.halo.scale.setScalar(selected ? beat * 1.7 : beat);
      visual.halo.material.opacity = selected ? 0.4 : 0.14 + visual.load * 0.14;
      visual.marker.scale.setScalar(selected ? 1.5 : 1);
    }

    this.renderer.render(this.scene, this.camera);
  };
}
