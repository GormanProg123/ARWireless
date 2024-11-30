// src/components/ModelViewer/ModelViewer.js
import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, AccumulativeShadows, RandomizedLight, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { useLoader } from '@react-three/fiber';
import styles from './model.module.css';

// Функция для определения мобильного устройства
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

const Model = ({ modelPath, scale }) => {
  const gltf = useLoader(GLTFLoader, modelPath);
  return <primitive object={gltf.scene} scale={scale} />;
};

const ModelViewer = ({ modelPath, scale = 10 }) => {
  // Используем memo для кеширования модели
  const model = useMemo(() => <Model modelPath={modelPath} scale={scale} />, [modelPath, scale]);

  return (
    <div className={styles.canvasContainer}>
      <Canvas
        shadows
        dpr={isMobile ? [1, 1.5] : [1, 2]} // Снижаем разрешение рендеринга на мобильных
        camera={{ position: [0, 1, 1], fov: 25 }}
      >
        <ambientLight intensity={0.3} />
        <spotLight position={[5, 5, 5]} angle={0.2} penumbra={1} intensity={0.8} castShadow />

        <Suspense
          fallback={
            <Html center>
              <div>Loading model...</div>
            </Html>
          }
        >
          <Center>{model}</Center>
        </Suspense>

        <AccumulativeShadows
          frames={isMobile ? 20 : 100} // Снижаем количество кадров для теней на мобильных
          temporal
          alphaTest={0.75}
          color="pink"
        >
          <RandomizedLight radius={8} position={[5, 3, -5]} />
        </AccumulativeShadows>

        <OrbitControls enableZoom={!isMobile} /> {/* Отключаем масштабирование на мобильных */}
      </Canvas>
    </div>
  );
};

export default ModelViewer;
