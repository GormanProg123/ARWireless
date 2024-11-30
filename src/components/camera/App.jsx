import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from 'react-router-dom';
import "./App.css";
import * as THREE from 'three';
import { ARButton } from '../../jsm/webxr/ARButton.js';
import * as posenet from '@tensorflow-models/posenet';
import * as tf from '@tensorflow/tfjs';

function App() {
  const navigate = useNavigate();
  const [isAR, setIsAR] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const canvasRef = useRef(null);
  const arRendererRef = useRef(null);
  const arSceneRef = useRef(null);
  const arCameraRef = useRef(null);
  const videoRef = useRef(null); // Видео для захвата с камеры

  useEffect(() => {
    let arRenderer, arScene, arCamera;
    let net;
    let xrSession = null;
    let videoStream = null;

    const initAR = async () => {
      // Загружаем модель Posenet
      net = await posenet.load({
        inputResolution: { width: 640, height: 480 },
        scale: 0.5,
      });
      setModelLoaded(true);

      // Инициализация AR-сцены
      arScene = new THREE.Scene();
      arCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 200);
      arRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      arRenderer.setPixelRatio(window.devicePixelRatio);
      arRenderer.setSize(window.innerWidth, window.innerHeight);
      arRenderer.xr.enabled = true;
      arRendererRef.current = arRenderer;
      arSceneRef.current = arScene;
      arCameraRef.current = arCamera;
      document.body.appendChild(arRenderer.domElement);

      // Добавляем ARButton с возможностью завершения сессии
      const options = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'bounded-floor', 'plane-detection'],
        domOverlay: { root: document.getElementById('content') },
      };
      const arButton = ARButton.createButton(arRenderer, options);
      arButton.addEventListener('sessionend', () => {
        navigate('/');
      });
      document.body.appendChild(arButton);

      // Стартуем AR-сессию
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local', 'camera-access'],
      });

      const layer = new XRWebGLLayer(xrSession, arRenderer.context);
      xrSession.updateRenderState({ baseLayer: layer });
      xrSession.requestReferenceSpace('local').then((refSpace) => {
        xrSession.requestAnimationFrame(onXRFrame);
      });

      window.addEventListener('resize', onWindowResize, false);

      // Запуск видеопотока с камеры
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = videoStream;
      videoRef.current.play();
    };

    // Обработка каждого кадра AR
    const onXRFrame = (time, frame) => {
      const session = frame.session;
      const referenceSpace = frame.getReferenceSpace();
      const pose = frame.getViewerPose(referenceSpace);

      if (pose) {
        // Захват видео с камеры для оценки позы
        const videoCanvas = document.createElement('canvas');
        videoCanvas.width = 640;
        videoCanvas.height = 480;
        const context = videoCanvas.getContext('2d');
        context.drawImage(videoRef.current, 0, 0, videoCanvas.width, videoCanvas.height);

        // Оценка позы с помощью Posenet
        net.estimateSinglePose(videoCanvas, {
          flipHorizontal: false,
        }).then((pose) => {
          // Отображаем ключевые точки и скелет
          drawKeypoints(pose.keypoints);
          drawSkeleton(pose.keypoints);

          // Синхронизация моделей с ключевыми точками
          updateModelPosition(pose.keypoints);
        });
      }

      // Рендеринг AR-сцены
      arRenderer.render(arSceneRef.current, arCameraRef.current);
      session.requestAnimationFrame(onXRFrame);
    };

    const drawKeypoints = (keypoints) => {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      keypoints.forEach((keypoint) => {
        if (keypoint.score > 0.5) { // Только ключевые точки с высокой уверенностью
          const { x, y } = keypoint.position;
          context.beginPath();
          context.arc(x, y, 5, 0, 2 * Math.PI);
          context.fillStyle = 'red';
          context.fill();
        }
      });
    };

    const drawSkeleton = (keypoints) => {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, 0.5);

      adjacentKeyPoints.forEach((keypoints) => {
        const [start, end] = keypoints;
        context.beginPath();
        context.moveTo(start.position.x, start.position.y);
        context.lineTo(end.position.x, end.position.y);
        context.lineWidth = 2;
        context.strokeStyle = 'blue';
        context.stroke();
      });
    };

    const updateModelPosition = (keypoints) => {
      const rightShoulder = keypoints.find((keypoint) => keypoint.part === 'rightShoulder');
      if (rightShoulder && rightShoulder.score > 0.5) {
        const { x, y } = rightShoulder.position;

        // Преобразуем 2D-координаты в 3D
        const worldPosition = new THREE.Vector3(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0);
        worldPosition.unproject(arCameraRef.current);

        // Перемещаем 3D модель в позицию, соответствующую правому плечу
        // Замени this.model на твою модель
        this.model.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
      }
    };

    initAR();

    return () => {
      if (xrSession) {
        xrSession.end();
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [navigate]);

  const onWindowResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    arCameraRef.current.aspect = width / height;
    arCameraRef.current.updateProjectionMatrix();
    arRendererRef.current.setSize(width, height);
  };

  return (
    <div className="App">
      <header className="App-header">
        <div id="content">
          <canvas ref={canvasRef} style={{ position: 'absolute', zIndex: 10, width: '100%', height: '100%' }} />
          <video ref={videoRef} style={{ display: 'none' }} />
        </div>
      </header>
    </div>
  );
}

export default App;
