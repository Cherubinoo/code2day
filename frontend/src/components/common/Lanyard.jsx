/* eslint-disable react/no-unknown-property */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, useTexture } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import './Lanyard.css';

extend({ MeshLineGeometry, MeshLineMaterial });

const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function fitTexture(texture, faceAspect, fit = 'cover', position = 'top') {
  const image = texture.image;
  if (!image?.width || !image?.height) return texture;

  const next = texture.clone();
  const imageAspect = image.width / image.height;
  next.wrapS = THREE.ClampToEdgeWrapping;
  next.wrapT = THREE.ClampToEdgeWrapping;
  next.colorSpace = THREE.SRGBColorSpace;
  // Flat UI card face, not a mipmapped 3D asset — generating mipmaps for a
  // large source image is what was producing WebGL texSubImage2D upload
  // failures on some drivers, especially on a cold load.
  next.generateMipmaps = false;
  next.minFilter = THREE.LinearFilter;

  if (fit === 'contain') {
    if (imageAspect > faceAspect) {
      next.repeat.set(1, imageAspect / faceAspect);
      next.offset.set(0, (1 - next.repeat.y) / 2);
    } else {
      next.repeat.set(faceAspect / imageAspect, 1);
      next.offset.set((1 - next.repeat.x) / 2, 0);
    }
  } else if (imageAspect > faceAspect) {
    next.repeat.set(faceAspect / imageAspect, 1);
    next.offset.set((1 - next.repeat.x) / 2, 0);
  } else {
    next.repeat.set(1, imageAspect / faceAspect);
    next.offset.set(0, position === 'top' ? 1 - next.repeat.y : (1 - next.repeat.y) / 2);
  }

  next.needsUpdate = true;
  return next;
}

export default function Lanyard({
  position = [0, 0, 22],
  gravity = [0, -40, 0],
  fov = 22,
  transparent = true,
  frontImage = null,
  backImage = null,
  imageFit = 'cover',
  imagePosition = 'top',
  lanyardImage = null,
  lanyardWidth = 0.72,
  onReady = null,
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="lanyard-wrapper">
      <Canvas
        camera={{ position, fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent, antialias: true }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI * 0.85} />
        <Suspense fallback={null}>
          <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
            <Band
              isMobile={isMobile}
              frontImage={frontImage}
              backImage={backImage || frontImage}
              imageFit={imageFit}
              imagePosition={imagePosition}
              lanyardImage={lanyardImage}
              lanyardWidth={lanyardWidth}
              onReady={onReady}
            />
          </Physics>
        </Suspense>
        <Environment blur={0.65}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={4} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={8} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}

function Band({
  maxSpeed = 50,
  minSpeed = 0,
  isMobile = false,
  frontImage,
  backImage,
  imageFit,
  imagePosition,
  lanyardImage,
  lanyardWidth,
  onReady = null,
}) {
  const readyFired = useRef(false);
  const band = useRef();
  const fixed = useRef();
  const j1 = useRef();
  const j2 = useRef();
  const j3 = useRef();
  const card = useRef();
  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const frontTexture = useTexture(frontImage || BLANK_PIXEL);
  const backTexture = useTexture(backImage || frontImage || BLANK_PIXEL);
  const bandTexture = useTexture(lanyardImage || BLANK_PIXEL);
  const frontMap = useMemo(() => fitTexture(frontTexture, 1.6 / 2.25, imageFit, imagePosition), [frontTexture, imageFit, imagePosition]);
  const backMap = useMemo(() => fitTexture(backTexture, 1.6 / 2.25, imageFit, imagePosition), [backTexture, imageFit, imagePosition]);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ]));
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 };

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.38, 0]]);

  useEffect(() => {
    if (!hovered) return undefined;
    document.body.style.cursor = dragged ? 'grabbing' : 'grab';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (!readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }

    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }

    if (fixed.current && j1.current && j2.current && j3.current && card.current && band.current) {
      [j1, j2].forEach((ref) => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const distance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(ref.current.translation(), delta * (minSpeed + distance * (maxSpeed - minSpeed)));
      });

      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  curve.curveType = 'chordal';
  bandTexture.wrapS = bandTexture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[0, 4.1, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.48, 0, 0]} ref={j1} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[0.96, 0, 0]} ref={j2} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.44, 0, 0]} ref={j3} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.95, -0.15, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.82, 1.15, 0.04]} />
          <group
            scale={2.08}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(event) => {
              event.target.releasePointerCapture(event.pointerId);
              drag(false);
            }}
            onPointerDown={(event) => {
              event.target.setPointerCapture(event.pointerId);
              drag(new THREE.Vector3().copy(event.point).sub(vec.copy(card.current.translation())));
            }}
          >
            <mesh position={[0, 0, -0.045]}>
              <boxGeometry args={[1.72, 2.38, 0.08]} />
              <meshPhysicalMaterial color="#111827" roughness={0.65} metalness={0.25} clearcoat={0.8} clearcoatRoughness={0.16} />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <planeGeometry args={[1.6, 2.25]} />
              <meshBasicMaterial map={frontMap} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.092]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[1.6, 2.25]} />
              <meshBasicMaterial map={backMap} toneMapped={false} />
            </mesh>
            <mesh position={[0, 1.26, 0.04]}>
              <torusGeometry args={[0.18, 0.028, 12, 32]} />
              <meshStandardMaterial color="#d4d4d8" metalness={0.8} roughness={0.25} />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="#2d5016"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap={Boolean(lanyardImage)}
          map={bandTexture}
          repeat={[-4, 1]}
          lineWidth={lanyardWidth}
        />
      </mesh>
    </>
  );
}
