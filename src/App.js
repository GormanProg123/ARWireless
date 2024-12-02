import React, { useRef, useEffect, useState } from "react";
import "./App.css";
import * as tf from "@tensorflow/tfjs";
import * as posenet from "@tensorflow-models/posenet";
import Webcam from "react-webcam";
import { drawKeypoints, drawSkeleton } from "./utilities";
import ClothingMenu from "./components/menu/Menu";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

// Линейная интерполяция
const lerp = (start, end, alpha) => start + (end - start) * alpha;

// Плавное обновление позиции и масштаба модели
const smoothTransition = (current, target, alpha = 0.15) => ({
  x: lerp(current.x, target.x, alpha),
  y: lerp(current.y, target.y, alpha),
  z: lerp(current.z, target.z, alpha),
});

const isPortrait = window.innerHeight > window.innerWidth;

// Компонент для отрисовки 3D модели одежды
function ClothingOverlay({ modelPath, position, scale }) {
  const { scene } = useGLTF(modelPath);

  if (scene) {
    scene.position.set(position.x, position.y, position.z);
    scene.scale.set(scale, scale, scale);
  }

  return modelPath ? (
    <>
      <primitive object={scene} />
      <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
    </>
  ) : null;
}

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const netRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [visibleKeypoints, setVisibleKeypoints] = useState([]);
  const [modelPosition, setModelPosition] = useState({ x: 0, y: 0, z: 0 });
  const [scale, setScale] = useState(1);
  const [lastPoseTime, setLastPoseTime] = useState(0);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);

  // Определение устройства (мобильное или ПК)
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    const loadPosenet = async () => {
      netRef.current = await posenet.load({
        inputResolution: { width: 320, height: 240 },
        scale: 0.8,
      });
      detectPose();
    };

    loadPosenet();
  }, []);

  const stopCamera = () => {
    if (webcamRef.current && webcamRef.current.video.srcObject) {
      const stream = webcamRef.current.video.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      webcamRef.current.video.srcObject = null;
    }
  };

  const startCamera = async () => {
    if (!isCameraInitialized && webcamRef.current) {
      try {
        const videoConstraints = {
          facingMode: "environment",
          width: isMobile ? window.innerWidth : 1280,
          height: isMobile ? window.innerHeight : 720,
        };
  
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
  
        webcamRef.current.video.srcObject = stream;
        setIsCameraInitialized(true); // Устанавливаем флаг после успешного запуска камеры
      } catch (error) {
        console.error("Ошибка доступа к камере: ", error);
      }
    }
  };

  useEffect(() => {
    startCamera(); // Запускаем камеру один раз
  
    return () => {
      stopCamera(); // Очищаем ресурсы при размонтировании
    };
  }, []);

  const lerpKeypoint = (current, target, alpha = 0.5) => ({
    x: lerp(current.x, target.x, alpha),
    y: lerp(current.y, target.y, alpha),
  });

  const updateVisibleKeypoints = (keypoints) => {
    const MIN_SCORE_THRESHOLD = 0.7;
    const filteredKeypoints = keypoints.filter((point) => point.score > MIN_SCORE_THRESHOLD);

    setVisibleKeypoints((prevKeypoints) =>
      filteredKeypoints.map((newPoint) => {
        const previous = prevKeypoints.find((p) => p.part === newPoint.part);
        if (previous) {
          return {
            ...newPoint,
            position: lerpKeypoint(previous.position, newPoint.position, 0.5),
          };
        }
        return newPoint;
      })
    );
  };

  const convertPosenetToThreeJS = (x, y, videoWidth, videoHeight) => {
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
  
    // Преобразование координат с учетом пропорций
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;
  
    return {
      x: x * scaleX,
      y: y * scaleY,
    };
  };
  
  

  const detectPose = () => {
    const updatePose = async () => {
      const now = Date.now();
      if (now - lastPoseTime < 100) {
        requestAnimationFrame(updatePose);
        return;
      }
  
      if (
        webcamRef.current &&
        webcamRef.current.video.readyState === 4 &&
        netRef.current
      ) {
        const video = webcamRef.current.video;
  
        // Ориентация экрана
        const isPortrait = window.innerHeight > window.innerWidth;
  
        const videoWidth = isPortrait ? 480 : 640; // Подстройка под ориентацию
        const videoHeight = isPortrait ? 640 : 480;
  
        webcamRef.current.video.width = videoWidth;
        webcamRef.current.video.height = videoHeight;
  
        const pose = await netRef.current.estimateSinglePose(video);
  
        drawCanvas(pose, video, videoWidth, videoHeight, canvasRef);
        updateVisibleKeypoints(pose.keypoints);
  
        const leftShoulder = pose.keypoints.find((point) => point.part === "leftShoulder");
        const rightShoulder = pose.keypoints.find((point) => point.part === "rightShoulder");
        const leftHip = pose.keypoints.find((point) => point.part === "leftHip");
        const rightHip = pose.keypoints.find((point) => point.part === "rightHip");
  
        if (leftShoulder && rightShoulder && leftHip && rightHip) {
          const points = [leftShoulder, rightShoulder, leftHip, rightHip].map((point) =>
            convertPosenetToThreeJS(
              point.position.x,
              point.position.y,
              videoWidth,
              videoHeight
            )
          );
  
          const xValues = points.map((p) => p.x);
          const yValues = points.map((p) => p.y);
  
          const centerX = (Math.max(...xValues) + Math.min(...xValues)) / 2;
          const centerY = (Math.max(...yValues) + Math.min(...yValues)) / 2;
  
          const shoulderWidth = Math.abs(points[0].x - points[1].x);
          const torsoHeight = Math.abs(points[2].y - points[0].y);
  
          const scaleFactor = isMobile
            ? Math.max(shoulderWidth, torsoHeight) * 1.2
            : Math.max(shoulderWidth * 2, torsoHeight * 2);
  
          const targetPosition = { x: centerX, y: centerY - torsoHeight / 2, z: 0 };
          const smoothedPosition = smoothTransition(modelPosition, targetPosition, 0.15);
  
          setModelPosition(smoothedPosition);
          setScale(scaleFactor);
        }
  
        setLastPoseTime(now);
      }
      requestAnimationFrame(updatePose);
    };
    requestAnimationFrame(updatePose);
  };
  
  
  const drawSkeleton = (keypoints, minConfidence, ctx) => {
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, minConfidence);
  
    adjacentKeyPoints.forEach(([from, to]) => {
      const startX = (from.position.x / webcamRef.current.video.videoWidth) * canvasRef.current.width;
      const startY = (from.position.y / webcamRef.current.video.videoHeight) * canvasRef.current.height;
      const endX = (to.position.x / webcamRef.current.video.videoWidth) * canvasRef.current.width;
      const endY = (to.position.y / webcamRef.current.video.videoHeight) * canvasRef.current.height;
  
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgb(0, 255, 0)";
      ctx.stroke();
    });
  };

  const drawCanvas = (pose, video, videoWidth, videoHeight, canvas) => {
    const ctx = canvas.current.getContext("2d");
    const canvasWidth = canvas.current.width;
    const canvasHeight = canvas.current.height;
  
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
    canvas.current.width = videoWidth;
    canvas.current.height = videoHeight;
  
    drawSkeleton(pose.keypoints, 0.5, ctx);
  };
  

  return (
    <div className="App">
      <header className="App-header">
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Clothing Menu for selecting model */}
          <ClothingMenu className="clothing-menu" onModelSelect={setSelectedModel} />
  
          {/* Скрытая информация для мобильных устройств */}
          <div
            className="model-info"
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              padding: "10px",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "white",
              maxHeight: "480px",
              width: "250px",
              borderRadius: "8px",
            }}
          >
            <h3>Model Info:</h3>
            {selectedModel ? (
              <>
                <p>
                  <strong>Model: </strong>
                  {selectedModel}
                </p>
                <p>
                  <strong>Position:</strong> X: {modelPosition.x.toFixed(2)} Y:{" "}
                  {modelPosition.y.toFixed(2)} Z: {modelPosition.z.toFixed(2)}
                </p>
                <p>
                  <strong>Scale:</strong> {scale.toFixed(2)}
                </p>
              </>
            ) : (
              <p>Select a model from the menu.</p>
            )}
          </div>
  
          {/* Информация о ключевых точках */}
          <div
            className="keypoints-info"
            style={{
              position: "absolute",
              top: "10px",
              right: "20px",
              padding: "10px",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "white",
              maxHeight: "480px",
              width: "300px",
              borderRadius: "8px",
              overflowY: "auto",
            }}
          >
            <h3>Keypoints Info:</h3>
            {visibleKeypoints.length > 0 ? (
              visibleKeypoints.map((keypoint) => (
                <div key={keypoint.part}>
                  <p>
                    <strong>{keypoint.part}:</strong> X: {keypoint.position.x.toFixed(2)} Y:{" "}
                    {keypoint.position.y.toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <p>No visible keypoints detected.</p>
            )}
          </div>
        </div>
  
        {/* Canvas для отображения позы и ключевых точек */}
        <canvas
  ref={canvasRef}
  style={{
    position: "absolute",
    marginLeft: "auto",
    marginRight: "auto",
    left: 0,
    right: 0,
    textAlign: "center",
    zIndex: 2,
    width: isMobile ? "100%" : "1280px", // Масштабируем под экран
    height: isMobile ? "auto" : "720px", // Высота будет адаптироваться
  }}
/>
  
        {/* Поток с веб-камеры */}
        <Webcam
  ref={webcamRef}
  videoConstraints={{
    facingMode: "environment",
    width: isMobile ? 720 : 1280, // Увеличиваем ширину на мобильных
    height: isMobile ? 1280 : 720, // Увеличиваем высоту на мобильных
  }}
  style={{
    position: "absolute",
    marginLeft: "auto",
    marginRight: "auto",
    left: 0,
    right: 0,
    textAlign: "center",
    zIndex: 1,
    width: isMobile ? "100%" : "1280px", // Масштабируем под экран
    height: isMobile ? "auto" : "720px", // Высота будет адаптироваться
  }}
/>

  
        {/* Модель одежды */}
        {selectedModel && (
          <Canvas
            style={{
              position: "absolute",
              zIndex: 5,
              width: isMobile ? "100%" : "1280px",
              height: isMobile ? "100%" : "720px",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <ambientLight intensity={0.5} />
            <ClothingOverlay
              modelPath={selectedModel}
              position={modelPosition}
              scale={isMobile ? scale * 0.8 : scale}
            />
          </Canvas>
        )}
      </header>
    </div>
  );
  
}

export default App;
