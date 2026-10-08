/**
 * MuJoCo 모델을 three.js 씬으로 옮기는 계층.
 *
 * MuJoCo는 물리만 계산하고 그림은 그리지 않는다(데스크톱 렌더러는 OpenGL에 묶여
 * 있어 WASM으로 넘어오지 않는다). 그래서 시작할 때 geom을 three.js 메쉬로 한 번
 * 변환해두고, 매 프레임 body의 위치/자세만 읽어 씬 그래프에 대입한다.
 *
 * 좌표계: MuJoCo는 Z-up, three.js는 Y-up이라 축을 맞바꿔 넣는다.
 *
 * geom 변환과 좌표 스위즐 방식은 zalo/mujoco_wasm (MIT)의 mujocoUtils.js를 참고했다.
 */

import * as THREE from 'three';

/** MuJoCo geom 타입 (mjtGeom). */
const GEOM_PLANE = 0;
const GEOM_SPHERE = 2;
const GEOM_CAPSULE = 3;
const GEOM_ELLIPSOID = 4;
const GEOM_CYLINDER = 5;
const GEOM_BOX = 6;
const GEOM_MESH = 7;

/**
 * MuJoCo의 위치(Z-up)를 three.js(Y-up)로 옮긴다.
 * (x, y, z)_mj -> (x, z, -y)_three
 */
export function getPosition(buffer, index, target) {
  return target.set(
    buffer[index * 3 + 0],
    buffer[index * 3 + 2],
    -buffer[index * 3 + 1],
  );
}

/**
 * MuJoCo의 쿼터니언(w,x,y,z / Z-up)을 three.js(x,y,z,w / Y-up)로 옮긴다.
 * 축 교환과 손좌표 보정이 함께 들어가 부호가 섞인다.
 */
export function getQuaternion(buffer, index, target) {
  return target.set(
    -buffer[index * 4 + 1],
    -buffer[index * 4 + 3],
    buffer[index * 4 + 2],
    -buffer[index * 4 + 0],
  );
}

/** MuJoCo mesh 자산을 three.js BufferGeometry로 변환한다. */
function buildMeshGeometry(model, meshID) {
  const geometry = new THREE.BufferGeometry();

  // 정점을 Y-up으로 스위즐한다. subarray는 WASM 메모리를 직접 가리키는 뷰라
  // 원본을 건드리지 않도록 복사본을 만든 뒤 수정한다.
  const vertexBuffer = model.mesh_vert
    .subarray(
      model.mesh_vertadr[meshID] * 3,
      (model.mesh_vertadr[meshID] + model.mesh_vertnum[meshID]) * 3,
    )
    .slice();
  for (let v = 0; v < vertexBuffer.length; v += 3) {
    const temp = vertexBuffer[v + 1];
    vertexBuffer[v + 1] = vertexBuffer[v + 2];
    vertexBuffer[v + 2] = -temp;
  }

  const faceBuffer = model.mesh_face.subarray(
    model.mesh_faceadr[meshID] * 3,
    (model.mesh_faceadr[meshID] + model.mesh_facenum[meshID]) * 3,
  );

  geometry.setAttribute('position', new THREE.BufferAttribute(vertexBuffer, 3));
  geometry.setIndex(Array.from(faceBuffer));
  // MuJoCo가 주는 법선은 면 인덱스로 간접 참조되어 있어 그대로 쓰기 까다롭다.
  // 정점 수가 적으므로 three.js가 다시 계산하게 둔다.
  geometry.computeVertexNormals();

  return geometry;
}

/** geom 하나의 기본 형상을 만든다. */
function buildPrimitiveGeometry(type, size) {
  switch (type) {
    case GEOM_SPHERE:
      return new THREE.SphereGeometry(size[0], 24, 16);
    case GEOM_CAPSULE:
      return new THREE.CapsuleGeometry(size[0], size[1] * 2.0, 8, 16);
    case GEOM_ELLIPSOID:
      return new THREE.SphereGeometry(1, 24, 16); // 아래에서 scale로 늘린다
    case GEOM_CYLINDER:
      return new THREE.CylinderGeometry(size[0], size[0], size[1] * 2.0, 24);
    case GEOM_BOX:
      return new THREE.BoxGeometry(size[0] * 2.0, size[2] * 2.0, size[1] * 2.0);
    default:
      return new THREE.SphereGeometry(size[0] * 0.5, 12, 8);
  }
}

/** null로 구분된 model.names 버퍼에서 body 이름을 꺼낸다. */
function readBodyName(model, namesArray, decoder, bodyID) {
  const start = model.name_bodyadr[bodyID];
  let end = start;
  while (end < namesArray.length && namesArray[end] !== 0) end++;
  return decoder.decode(namesArray.subarray(start, end));
}

/**
 * 모델의 모든 geom을 three.js 오브젝트로 만들어 씬에 넣는다.
 *
 * @returns {{root: THREE.Group, bodies: Object.<number, THREE.Group>}}
 */
export function buildScene(mujoco, model, scene) {
  const root = new THREE.Group();
  root.name = 'MuJoCo Root';
  scene.add(root);

  const decoder = new TextDecoder('utf-8');
  const namesArray = new Uint8Array(model.names);

  /** @type {Object.<number, THREE.Group>} */
  const bodies = {};
  /** @type {Object.<number, THREE.BufferGeometry>} */
  const meshCache = {};

  for (let g = 0; g < model.ngeom; g++) {
    // simulate와 같은 기본 동작: geom group 3 이상은 그리지 않는다.
    if (!(model.geom_group[g] < 3)) continue;

    const b = model.geom_bodyid[g];
    const type = model.geom_type[g];
    const size = [
      model.geom_size[g * 3 + 0],
      model.geom_size[g * 3 + 1],
      model.geom_size[g * 3 + 2],
    ];

    if (!(b in bodies)) {
      bodies[b] = new THREE.Group();
      bodies[b].name = readBodyName(model, namesArray, decoder, b);
      bodies[b].bodyID = b;
    }

    let geometry;
    if (type === GEOM_MESH) {
      const meshID = model.geom_dataid[g];
      if (!(meshID in meshCache)) {
        meshCache[meshID] = buildMeshGeometry(model, meshID);
      }
      geometry = meshCache[meshID];
    } else if (type === GEOM_PLANE) {
      // 바닥. 실제 크기는 무한이므로 적당히 큰 판으로 대신한다.
      geometry = new THREE.PlaneGeometry(20, 20);
    } else {
      geometry = buildPrimitiveGeometry(type, size);
    }

    // 색은 geom에 직접 지정된 rgba를 쓰고, material이 있으면 그쪽을 우선한다.
    let color = [
      model.geom_rgba[g * 4 + 0],
      model.geom_rgba[g * 4 + 1],
      model.geom_rgba[g * 4 + 2],
      model.geom_rgba[g * 4 + 3],
    ];
    const matId = model.geom_matid[g];
    if (matId !== -1) {
      color = [
        model.mat_rgba[matId * 4 + 0],
        model.mat_rgba[matId * 4 + 1],
        model.mat_rgba[matId * 4 + 2],
        model.mat_rgba[matId * 4 + 3],
      ];
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      transparent: color[3] < 1.0,
      opacity: color[3],
      roughness: 0.7,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = type !== GEOM_PLANE;
    mesh.receiveShadow = true;
    mesh.bodyID = b;

    if (type === GEOM_PLANE) {
      // PlaneGeometry는 XY 평면에 생기므로 눕힌다.
      mesh.rotateX(-Math.PI / 2);
      mesh.castShadow = false;
      mesh.material.color = new THREE.Color(0.82, 0.84, 0.88);
    } else {
      getPosition(model.geom_pos, g, mesh.position);
      getQuaternion(model.geom_quat, g, mesh.quaternion);
    }
    if (type === GEOM_ELLIPSOID) mesh.scale.set(size[0], size[2], size[1]);

    bodies[b].add(mesh);
  }

  // body는 계층 구조로 두지 않고 전부 root 밑에 평평하게 붙인다.
  // MuJoCo가 매 프레임 월드 좌표(xpos/xquat)를 주므로 부모-자식 누적이 필요 없다.
  for (let b = 0; b < model.nbody; b++) {
    if (bodies[b]) root.add(bodies[b]);
  }

  return { root, bodies };
}

/** 매 프레임 호출: MuJoCo의 body 월드 변환을 three.js 오브젝트에 반영한다. */
export function syncBodies(model, data, bodies) {
  for (let b = 0; b < model.nbody; b++) {
    const obj = bodies[b];
    if (!obj) continue;
    getPosition(data.xpos, b, obj.position);
    getQuaternion(data.xquat, b, obj.quaternion);
  }
}
