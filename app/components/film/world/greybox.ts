import * as THREE from "three";
import { PLACES } from "../beats";

/**
 * The greybox world: every object at its true size and position, in flat
 * materials. It exists to prove the camera path and the page composition
 * before any detail is modelled, so nothing here is final geometry.
 *
 * Proportions follow public photos of liquid-cooled 8-GPU servers: a module
 * about 142 by 78 mm, a die about 26 by 33 mm on a silicon interposer with
 * three memory stacks on each side, eight modules in two rows of four on one
 * baseboard, 4U chassis in a 48U rack.
 */

export type World = {
  root: THREE.Group;
  /** 0 = cold plate seated, 1 = lifted clear of the package. */
  setLift(v: number): void;
  /** Hides parts the camera is inside of, by eye position. */
  cull(eye: THREE.Vector3): void;
  vectorSpace: THREE.Points;
  dispose(): void;
};

const U = 0.04445; // one rack unit in metres

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildWorld(field: { positions: number[]; clusters: number[] }): World {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const mat = (params: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(params);
    disposables.push(m);
    return m;
  };

  const floorMat = mat({ color: 0x141619, roughness: 0.35, metalness: 0.2 });
  const rackMat = mat({ color: 0x1b1d20, roughness: 0.6, metalness: 0.4 });
  const serverMat = mat({ color: 0x3a3e44, roughness: 0.45, metalness: 0.6 });
  const bezelMat = mat({ color: 0x15171a, roughness: 0.5, metalness: 0.3, transparent: true });
  const boardMat = mat({ color: 0x1c2a22, roughness: 0.45, metalness: 0.1 });
  const pcbMat = mat({ color: 0x17221c, roughness: 0.4, metalness: 0.15 });
  const siliconMat = mat({ color: 0x8a8f99, roughness: 0.12, metalness: 0.65 });
  const hbmMat = mat({ color: 0x202226, roughness: 0.7, metalness: 0.05 });
  const interposerMat = mat({ color: 0x5a5448, roughness: 0.3, metalness: 0.5 });
  const plateMat = mat({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
  const ledMat = mat({ color: 0x000000, emissive: 0xdfe8ff, emissiveIntensity: 2.2 });
  const stripMat = mat({ color: 0x000000, emissive: 0xf2f6ff, emissiveIntensity: 3.0 });
  const trayMat = mat({ color: 0x4a4e55, roughness: 0.5, metalness: 0.7 });
  const dimmMat = mat({ color: 0x1f3a2c, roughness: 0.5, metalness: 0.2 });

  // ---- Hall ---------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-8, PLACES.floorY, 1.2);
  root.add(floor);
  disposables.push(floor.geometry);

  // Ceiling light strips over the aisle and over each row.
  for (const z of [0, PLACES.aisleZ, 2.4]) {
    root.add(box(40, 0.02, 0.05, stripMat, -8, 2.9, z));
  }
  // Overhead fibre trays above the aisle.
  root.add(box(40, 0.012, 0.3, trayMat, -8, PLACES.trayY - 0.01, PLACES.aisleZ));
  root.add(box(40, 0.05, 0.01, trayMat, -8, PLACES.trayY + 0.02, PLACES.aisleZ - 0.15));
  root.add(box(40, 0.05, 0.01, trayMat, -8, PLACES.trayY + 0.02, PLACES.aisleZ + 0.15));

  // ---- Racks: instanced shells for both rows, detailed hero and app racks --
  const rackH = 48 * U;
  const rackGeo = new THREE.BoxGeometry(0.6, rackH, 1.2);
  disposables.push(rackGeo);
  const rackY = PLACES.floorY + rackH / 2;
  const shells: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  for (let i = 1; i < 22; i++) shells.push(m4.clone().setPosition(-0.6 * i, rackY, 0));
  for (let i = 0; i < 22; i++) {
    const x = -0.6 * i;
    if (Math.abs(x - PLACES.appRack[0]) < 0.01) continue;
    shells.push(m4.clone().setPosition(x, rackY, 2.4));
  }
  const rackShells = new THREE.InstancedMesh(rackGeo, rackMat, shells.length);
  shells.forEach((m, i) => rackShells.setMatrixAt(i, m));
  root.add(rackShells);

  // Status LED rows on every shell front: one instanced quad per server slot.
  const ledGeo = new THREE.BoxGeometry(0.012, 0.004, 0.002);
  disposables.push(ledGeo);
  const ledMatrices: THREE.Matrix4[] = [];
  shells.forEach((m) => {
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const front = pos.z < 1 ? 0.601 : -0.601;
    for (let s = 0; s < 10; s++) {
      ledMatrices.push(m4.clone().setPosition(pos.x + 0.2, PLACES.floorY + 0.12 + s * 4 * U, pos.z + front));
    }
  });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, ledMatrices.length);
  ledMatrices.forEach((m, i) => leds.setMatrixAt(i, m));
  root.add(leds);

  // Hero rack: an open frame of four posts, so the camera can pass in.
  const hero = new THREE.Group();
  for (const [x, z] of [
    [-0.29, -0.59],
    [0.29, -0.59],
    [-0.29, 0.59],
    [0.29, 0.59],
  ]) {
    hero.add(box(0.02, rackH, 0.02, rackMat, x, rackY, z));
  }
  // Closed 4U servers in every slot but the hero's, and a 1U switch on top.
  const heroSlotBottom = -0.06;
  const bezels: THREE.Mesh[] = [];
  for (let y = PLACES.floorY + 0.05; y + 4 * U < 1.0; y += 4 * U) {
    if (Math.abs(y - heroSlotBottom) < 2 * U) continue;
    hero.add(box(0.44, 4 * U - 0.004, 0.95, serverMat, 0, y + 2 * U, -0.025));
    hero.add(box(0.012, 0.004, 0.002, ledMat, 0.2, y + 0.02, 0.453));
  }
  hero.add(box(0.44, U, 0.95, serverMat, 0, 1.08, -0.025));

  // The hero server: chassis floor and walls, no lid, and a front bezel the
  // camera passes through on its way in.
  const chassis = new THREE.Group();
  const cy = heroSlotBottom;
  chassis.add(box(0.44, 0.003, 0.95, serverMat, 0, cy, -0.025));
  chassis.add(box(0.003, 4 * U, 0.95, serverMat, -0.22, cy + 2 * U, -0.025));
  chassis.add(box(0.003, 4 * U, 0.95, serverMat, 0.22, cy + 2 * U, -0.025));
  const bezel = box(0.44, 4 * U, 0.01, bezelMat, 0, cy + 2 * U, 0.455);
  bezels.push(bezel);
  chassis.add(bezel);
  // Front NVMe bays.
  for (let i = 0; i < 8; i++) chassis.add(box(0.045, 0.012, 0.18, trayMat, -0.18 + i * 0.05, cy + 0.02, 0.35));
  // Baseboard.
  const [bx, by, bz] = PLACES.board;
  chassis.add(box(0.4, 0.002, 0.34, boardMat, bx, by - 0.001, bz));
  hero.add(chassis);

  // Eight modules, two rows of four. The hero is column 2, row 1 at the origin.
  const moduleGeo = new THREE.BoxGeometry(0.078, 0.0016, 0.142);
  const pkgGeo = new THREE.BoxGeometry(0.05, 0.0012, 0.044);
  const plateGeo = new THREE.BoxGeometry(0.066, 0.008, 0.06);
  disposables.push(moduleGeo, pkgGeo, plateGeo);
  let lifted: THREE.Mesh | null = null;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 2; r++) {
      const x = bx + (c - 1.5) * 0.095;
      const z = bz + (r - 0.5) * 0.16;
      const isHero = c === 2 && r === 1;
      hero.add(new THREE.Mesh(moduleGeo, pcbMat).translateX(x).translateY(-0.0023).translateZ(z));
      // Mezzanine connectors between module and baseboard.
      hero.add(box(0.06, 0.009, 0.006, trayMat, x, -0.0075, z - 0.05));
      hero.add(box(0.06, 0.009, 0.006, trayMat, x, -0.0075, z + 0.05));
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(x, 0.0048, z);
      hero.add(plate);
      if (isHero) lifted = plate;
      else hero.add(new THREE.Mesh(pkgGeo, interposerMat).translateX(x).translateY(-0.0009).translateZ(z));
    }
  }
  // Four switch packages along the baseboard front.
  for (let i = 0; i < 4; i++) hero.add(box(0.035, 0.004, 0.035, siliconMat, bx - 0.14 + i * 0.095, -0.01, bz + 0.2));

  // The hero package: substrate, interposer, die, six memory stacks.
  hero.add(box(0.05, 0.001, 0.044, pcbMat, 0, -0.001, 0));
  hero.add(box(0.05, 0.0005, 0.035, interposerMat, 0, -0.00025, 0));
  hero.add(box(0.026, 0.0008, 0.033, siliconMat, 0, 0.0004, 0));
  for (const sx of [-1, 1]) {
    for (let k = -1; k <= 1; k++) {
      hero.add(box(0.008, 0.0009, 0.0105, hbmMat, sx * 0.0185, 0.00045, k * 0.011));
    }
  }
  // VRM field: instanced inductors around the package.
  const indGeo = new THREE.BoxGeometry(0.004, 0.003, 0.004);
  disposables.push(indGeo);
  const ind = new THREE.InstancedMesh(indGeo, trayMat, 64);
  let n = 0;
  for (let a = 0; a < 16; a++) {
    for (const [x0, z0, dx, dz] of [
      [-0.033, -0.062, 0.0045, 0],
      [-0.033, 0.058, 0.0045, 0],
      [-0.035, -0.028, 0, 0.0035],
      [0.033, -0.028, 0, 0.0035],
    ]) {
      if (n >= 64) break;
      ind.setMatrixAt(n++, m4.clone().setPosition(x0 + dx * a, 0.0001, z0 + dz * a));
    }
  }
  hero.add(ind);
  root.add(hero);

  // ---- App rack: open frame, 1U servers, one open with its DIMMs -----------
  const app = new THREE.Group();
  const [ax, , az] = PLACES.appRack;
  for (const [x, z] of [
    [-0.29, -0.59],
    [0.29, -0.59],
    [-0.29, 0.59],
    [0.29, 0.59],
  ]) {
    app.add(box(0.02, rackH, 0.02, rackMat, ax + x, rackY, az + z));
  }
  for (let y = PLACES.floorY + 0.05; y < 1.05; y += U * 1.5) {
    if (Math.abs(y - PLACES.appServerY) < U * 1.2) continue;
    app.add(box(0.44, U - 0.003, 0.95, serverMat, ax, y + U / 2, az + 0.02));
    app.add(box(0.012, 0.004, 0.002, ledMat, ax + 0.2, y + 0.02, az - 0.458));
  }
  const appY = PLACES.appServerY;
  app.add(box(0.44, 0.002, 0.95, serverMat, ax, appY, az + 0.02));
  // Two CPU sockets and sixteen DIMMs.
  for (const sx of [-0.1, 0.1]) app.add(box(0.07, 0.008, 0.07, plateMat, ax + sx, appY + 0.005, az - 0.1));
  const dimmGeo = new THREE.BoxGeometry(0.004, 0.031, 0.133);
  disposables.push(dimmGeo);
  const dimms = new THREE.InstancedMesh(dimmGeo, dimmMat, 16);
  for (let i = 0; i < 16; i++) {
    const x = ax - 0.19 + i * 0.0255 + (i >= 8 ? 0.02 : 0);
    dimms.setMatrixAt(i, m4.clone().setPosition(x, appY + 0.017, PLACES.dimm[2]));
  }
  app.add(dimms);
  root.add(app);

  // ---- Vector space: the corpus projection, opened out of the DIMM ---------
  const pos = new Float32Array(field.positions.length);
  const scale = 0.045;
  for (let i = 0; i < field.positions.length; i += 3) {
    pos[i] = PLACES.dimm[0] + field.positions[i] * scale;
    pos[i + 1] = PLACES.dimm[1] + field.positions[i + 1] * scale;
    pos[i + 2] = PLACES.dimm[2] + field.positions[i + 2] * scale;
  }
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const vMat = new THREE.PointsMaterial({
    color: 0x7aa2ff,
    size: 0.0012,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const vectorSpace = new THREE.Points(vGeo, vMat);
  root.add(vectorSpace);
  disposables.push(vGeo, vMat);

  const heroCentre = new THREE.Vector3(0, 0, 0);
  return {
    root,
    vectorSpace,
    setLift(v) {
      if (!lifted) return;
      // Up and aside, clear of every die and memory shot.
      lifted.position.y = 0.0048 + v * 0.16;
      lifted.position.x = 0 + v * 0.12;
    },
    cull(eye) {
      // The bezel dissolves as the eye crosses it, so the way in is never a cut.
      const inside = eye.z < 0.52 && Math.abs(eye.x) < 0.25 && eye.y > -0.07 && eye.y < 0.13;
      const near = eye.distanceTo(heroCentre);
      for (const b of bezels) {
        const mb = b.material as THREE.MeshStandardMaterial;
        mb.opacity = inside ? 0 : Math.min(1, Math.max(0, (near - 0.5) / 0.3));
        b.visible = mb.opacity > 0.01;
      }
      const dv = eye.distanceTo(new THREE.Vector3(...PLACES.dimm));
      vMat.opacity = Math.min(1, Math.max(0, (0.4 - dv) / 0.2));
      vectorSpace.visible = vMat.opacity > 0.01;
    },
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}
