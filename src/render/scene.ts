import * as THREE from 'three';

/**
 * Scène de démonstration de l'étape 1 (validation de la stack Vite + TS + Three.js + Svelte 5).
 * Remplacée par le vrai rendu à l'étape 3.
 */
export function startDemoScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fd3ff');
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 6, -12);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8f3a', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(10, 20, -5);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), new THREE.MeshLambertMaterial({ color: '#5cc85a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 16), new THREE.MeshLambertMaterial({ color: '#ff7a1a' }));
  capsule.position.set(0, 0.9, 0);
  scene.add(capsule);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  ball.scale.set(1, 1, 1.6);
  scene.add(ball);

  let raf = 0;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  const loop = (t: number) => {
    const s = t / 1000;
    ball.position.set(Math.sin(s) * 2, 1.5 + Math.abs(Math.sin(s * 2)) * 1.5, Math.cos(s) * 2);
    ball.rotation.y = s * 3;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    renderer.dispose();
  };
}
