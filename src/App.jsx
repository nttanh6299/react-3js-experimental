import { useRef, useEffect, Suspense } from 'react';
import { TextureLoader, RepeatWrapping, Vector3, Quaternion } from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useAnimations } from '@react-three/drei';
import { create } from 'zustand';

export const W = 'w';
export const A = 'a';
export const S = 's';
export const D = 'd';
const DIRECTIONS = [W, A, S, D];

const useControlStore = create((set) => ({
  orbitControls: null,
  setOrbitControls: (orbitControls) => set(() => ({ orbitControls })),
}));

const keysPressed = {};
const walkDirection = new Vector3();
const rotateAngle = new Vector3(0, 1, 0);
const rotateQuarternion = new Quaternion();
const cameraTarget = new Vector3();
let holdingShift = false;
let enableTPose = false;
let currentAction = 'Idle';
let additiveWeight = 0;
const weightSpeed = 0.02;

function getDirectionOffset(keysPressed) {
  let directionOffset = 0; // w

  if (keysPressed[W]) {
    if (keysPressed[A]) {
      directionOffset = Math.PI / 4; // w+a
    } else if (keysPressed[D]) {
      directionOffset = -Math.PI / 4; // w+d
    }
  } else if (keysPressed[S]) {
    if (keysPressed[A]) {
      directionOffset = Math.PI / 4 + Math.PI / 2; // s+a
    } else if (keysPressed[D]) {
      directionOffset = -Math.PI / 4 - Math.PI / 2; // s+d
    } else {
      directionOffset = Math.PI; // s
    }
  } else if (keysPressed[A]) {
    directionOffset = Math.PI / 2; // a
  } else if (keysPressed[D]) {
    directionOffset = -Math.PI / 2; // d
  }

  return directionOffset;
}

const handleKeyDown = (event) => {
  if (event.key === 'Shift') {
    holdingShift = true;
  }
  if (event.key === 't' || event.key === 'T') {
    enableTPose = !enableTPose;
  }
  keysPressed[event.key.toLowerCase()] = true;
};

const handleKeyUp = (event) => {
  if (event.key === 'Shift') {
    holdingShift = false;
  }
  keysPressed[event.key.toLowerCase()] = false;
};

const Model = ({ path, pose, ...props }) => {
  const group = useRef();
  const { scene, animations } = useGLTF(String(path));
  const { camera } = useThree();
  const { actions, mixer } = useAnimations(animations, group);
  const { orbitControls } = useControlStore();

  useFrame((_, delta) => {
    // diagonal movement angle offset
    const directionOffset = getDirectionOffset(keysPressed);
    const directionPressed = DIRECTIONS.some((key) => keysPressed[key] == true);

    let play = '';
    if (directionPressed && holdingShift) {
      play = 'Run';
    } else if (directionPressed) {
      play = 'Walk';
    } else {
      play = 'Idle';
    }

    if (currentAction !== play) {
      const toPlay = actions[play];
      const current = actions[currentAction];
      current.fadeOut(0.2);
      toPlay.reset().fadeIn(0.2).play();
      currentAction = play;
    }

    if (enableTPose) {
      if (additiveWeight < 1) {
        additiveWeight = Math.min(additiveWeight + weightSpeed, 1);
      }
    } else {
      if (additiveWeight > 0) {
        additiveWeight = Math.max(additiveWeight - weightSpeed, 0);
      }
    }

    actions['TPose'].setEffectiveWeight(additiveWeight);

    if (play === 'Walk' || play === 'Run') {
      // calculate towards camera direction
      const angleYCameraDirection = Math.atan2(
        camera.position.x - scene.position.x,
        camera.position.z - scene.position.z,
      );

      // rotate model
      rotateQuarternion.setFromAxisAngle(rotateAngle, angleYCameraDirection + directionOffset);
      scene.quaternion.rotateTowards(rotateQuarternion, 0.2);

      camera.getWorldDirection(walkDirection);
      walkDirection.y = 0;
      walkDirection.normalize();
      walkDirection.applyAxisAngle(rotateAngle, directionOffset);

      const velocity = play === 'Run' ? 5 : 2;
      const moveX = walkDirection.x * velocity * delta;
      const moveZ = walkDirection.z * velocity * delta;
      scene.position.x += moveX;
      scene.position.z += moveZ;

      // Update camera
      camera.position.x += moveX;
      camera.position.z += moveZ;
      cameraTarget.x = scene.position.x;
      cameraTarget.y = scene.position.y;
      cameraTarget.z = scene.position.z;
      orbitControls.target = cameraTarget;
    }
  });

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (actions && !!actions[pose]) {
      actions[pose].play();

      // let additiveClip = animations.find((clip) => clip.name === 'TPose');
      // if (additiveClip) {
      //   additiveClip = AnimationUtils.makeClipAdditive(additiveClip);
      //   const additiveAction = mixer.clipAction(additiveClip);
      //   additiveAction.play();
      //   additiveAction.setEffectiveWeight(0);
      // }
      actions['TPose'].play();
      actions['TPose'].setEffectiveWeight(0);
    }
  }, [actions, mixer, animations]);

  return (
    <group ref={group} dispose={null}>
      <primitive {...props} object={scene} />
    </group>
  );
};

const Floor = () => {
  const [colorTexture, normalTexture, displacementTexture, aoMapTexture] = useLoader(
    TextureLoader,
    [
      '/textures/sand/color.jpg',
      '/textures/sand/normal.jpg',
      '/textures/sand/height.jpg',
      '/textures/sand/ao.jpg',
    ],
  );

  // Repeat the textures
  const repeatX = 10;
  const repeatY = 10;
  colorTexture.repeat.set(repeatX, repeatY);
  normalTexture.repeat.set(repeatX, repeatY);
  displacementTexture.repeat.set(repeatX, repeatY);
  aoMapTexture.repeat.set(repeatX, repeatY);

  // Enable texture wrapping
  colorTexture.wrapS = colorTexture.wrapT = RepeatWrapping;
  normalTexture.wrapS = normalTexture.wrapT = RepeatWrapping;
  displacementTexture.wrapS = displacementTexture.wrapT = RepeatWrapping;
  aoMapTexture.wrapS = aoMapTexture.wrapT = RepeatWrapping;

  return (
    <mesh receiveShadow rotation-x={-Math.PI / 2}>
      <planeGeometry args={[80, 80, 512, 512]} />
      <meshStandardMaterial
        map={colorTexture}
        normalMap={normalTexture}
        displacementMap={displacementTexture}
        aoMap={aoMapTexture}
        displacementScale={0.1}
      />
    </mesh>
  );
};

const Light = () => {
  return (
    <>
      <ambientLight color="white" intensity={1} />
      <directionalLight
        position={[-60, 100, -10]}
        color={'white'}
        intensity={3}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.1}
        shadow-camera-far={200}
      />
    </>
  );
};

const Scene = () => {
  const { setOrbitControls } = useControlStore();

  return (
    <>
      <color attach="background" args={['#a8def0']} />
      <Light />
      <Floor />
      <Suspense fallback={null}>
        <Model path={'/models/Soldier.glb'} pose={'Idle'} />
      </Suspense>
      <OrbitControls
        ref={setOrbitControls}
        enableDamping
        minDistance={4}
        maxDistance={15}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
    </>
  );
};

function App() {
  return (
    <Canvas shadows camera={{ fov: 70, position: [0, 4, 3] }}>
      <Scene />
    </Canvas>
  );
}

export default App;
