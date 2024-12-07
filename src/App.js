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

  useEffect(() => {
    if (scene) {
      console.log("Updating model position in Three.js:", position);
      scene.position.set(position.x, position.y, position.z);
      scene.scale.set(scale, scale, scale);
    }
  }, [scene, position, scale]);

  return modelPath ? <primitive object={scene} /> : null;
}


const lerpKeypoint = (current, target, alpha = 0.5) => ({
  x: lerp(current.x, target.x, alpha),
  y: lerp(current.y, target.y, alpha),
});

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
  const [isTorsoDetected, setIsTorsoDetected] = useState(false);


  // Определение устройства (мобильное или ПК)
  const isMobile = window.innerWidth <= 768;

  // Увеличиваем размеры камеры для телефона
  const videoWidth = isMobile ? 718 : 1280;
  const videoHeight = isMobile ? 762 : 720;

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

  const startCamera = async () => {
    if (!isCameraInitialized && webcamRef.current) {
      try {
        const videoConstraints = {
          facingMode: "environment",
          width: videoWidth,
          height: videoHeight,
        };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });

        webcamRef.current.video.srcObject = stream;
        setIsCameraInitialized(true);
      } catch (error) {
        console.error("Ошибка доступа к камере: ", error);
      }
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (webcamRef.current && webcamRef.current.video.srcObject) {
        const stream = webcamRef.current.video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
        webcamRef.current.video.srcObject = null;
      }
    };
  }, []);

  const updateVisibleKeypoints = (keypoints) => {
    const MIN_SCORE_THRESHOLD = 0.5; // UPDATED: Понижен порог уверенности для более точного отслеживания.
    const filteredKeypoints = keypoints.filter((point) => point.score > MIN_SCORE_THRESHOLD);
  
    setVisibleKeypoints((prevKeypoints) =>
      filteredKeypoints.map((newPoint) => {
        const previous = prevKeypoints.find((p) => p.part === newPoint.part);
        if (previous) {
          return {
            ...newPoint,
            position: lerpKeypoint(previous.position, newPoint.position, 0.7), // UPDATED: Увеличена плавность.
          };
        }
        return newPoint;
      })
    );
  };
  

  // Конвертация позы в координаты для Three.js
  const convertPosenetToThreeJS = (x, y, videoWidth, videoHeight, canvasWidth, canvasHeight) => {
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;
    
    // Преобразуем координаты
    const normalizedX = x * scaleX;
    const normalizedY = y * scaleY;
    
    return {
      x: normalizedX - canvasWidth / 2,
      y: canvasHeight / 2 - normalizedY,
      z: 0.1, // Z-координата для Three.js
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
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const canvasWidth = canvasRef.current.width;
        const canvasHeight = canvasRef.current.height;
  
        webcamRef.current.video.width = videoWidth;
        webcamRef.current.video.height = videoHeight;
  
        const pose = await netRef.current.estimateSinglePose(video);
  
        drawCanvas(pose, video, videoWidth, videoHeight, canvasRef);
        updateVisibleKeypoints(pose.keypoints);
  
        // Пытаемся найти ключевые точки торса с минимальной уверенностью
        const leftShoulder = pose.keypoints.find((point) => point.part === "leftShoulder");
        const rightShoulder = pose.keypoints.find((point) => point.part === "rightShoulder");
        const leftHip = pose.keypoints.find((point) => point.part === "leftHip");
        const rightHip = pose.keypoints.find((point) => point.part === "rightHip");
  
        // Проверяем, если хотя бы одна ключевая точка имеет низкую уверенность или отсутствует
        const keypointsDetected = 
          leftShoulder && rightShoulder && leftHip && rightHip &&
          leftShoulder.score > 0.5 &&
          rightShoulder.score > 0.5 &&
          leftHip.score > 0.5 &&
          rightHip.score > 0.5;
  
        if (!keypointsDetected) {
          // Если недостаточно уверенности, не обновляем торс
          setIsTorsoDetected(false);
          requestAnimationFrame(updatePose);  // Пропускаем обновление
          return;
        }
  
        // Если уверенность достаточна, обновляем отслеживание
        setIsTorsoDetected(true);
  
        // Находим середину плеч и бедер
        const midShoulder = {
          x: (leftShoulder.position.x + rightShoulder.position.x) / 2,
          y: (leftShoulder.position.y + rightShoulder.position.y) / 2,
        };
  
        const midHip = {
          x: (leftHip.position.x + rightHip.position.x) / 2,
          y: (leftHip.position.y + rightHip.position.y) / 2,
        };
  
        const centerTorso = {
          x: (midShoulder.x + midHip.x) / 2,
          y: (midShoulder.y + midHip.y) / 2,
        };
  
        // Приведение к координатам Three.js
        const targetPosition = convertPosenetToThreeJS(
          centerTorso.x,
          centerTorso.y,
          videoWidth,
          videoHeight,
          canvasWidth,
          canvasHeight
        );
  
        // Вычисление масштабирования по высоте торса и ширине плеч
        const torsoHeight = Math.abs(midHip.y - midShoulder.y);
        const shoulderWidth = Math.abs(leftShoulder.position.x - rightShoulder.position.x);
        const relativeHeightScale = torsoHeight / videoHeight;
        const relativeWidthScale = shoulderWidth / videoWidth;
  
        // Базовый масштаб и динамическое изменение масштаба
        const baseScale = 1.5;
        // Вычисление масштаба для мобильных устройств
        const dynamicScale = (baseScale + (relativeHeightScale + relativeWidthScale) * 2) * (isMobile ? 0.8 : 1);
        const finalScale = Math.min(dynamicScale, 3.5);

// Установка позиции и масштаба
const adjustedPosition = {
  ...targetPosition,
  z: targetPosition.z + 0.2, // Немного смещаем по оси Z
};
const smoothedPosition = smoothTransition(modelPosition, adjustedPosition, 0.15);
setModelPosition(smoothedPosition);
setScale(finalScale);

      }
  
      setLastPoseTime(now);
      requestAnimationFrame(updatePose);
    };
    requestAnimationFrame(updatePose);
  };
  
  
  
  const drawCanvas = (pose, video, videoWidth, videoHeight, canvas) => {
    const ctx = canvas.current.getContext("2d");
    const canvasWidth = canvas.current.width;
    const canvasHeight = canvas.current.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;

    pose.keypoints.forEach((keypoint) => {
      if (keypoint.score > 0.5) {
        const x = keypoint.position.x * scaleX;
        const y = keypoint.position.y * scaleY;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "red";
        ctx.fill();
      }
    });

    drawSkeleton(pose.keypoints, 0.5, ctx, scaleX, scaleY);
  };

  
  const drawSkeleton = (keypoints, minConfidence, ctx) => {
    const video = webcamRef.current.video;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    
    // Применяем масштабирование для мобильных устройств
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;
    
    // Дополнительное уменьшение масштаба для мобильных устройств
    const mobileScaleFactor = isMobile ? 0.5 : 1;  // Уменьшаем масштаб на мобильных устройствах
  
    // Масштабируем координаты для отображения на канвасе
    const adjX = scaleX * mobileScaleFactor;
    const adjY = scaleY * mobileScaleFactor;
  
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, minConfidence);
    
    adjacentKeyPoints.forEach(([from, to]) => {
      ctx.beginPath();
      
      const fromX = from.position.x * adjX;
      const fromY = from.position.y * adjY;
      const toX = to.position.x * adjX;
      const toY = to.position.y * adjY;
      
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgb(0, 255, 0)";
      ctx.stroke();
    });
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
        
        <div
          className="torso-info"
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            padding: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "white",
            borderRadius: "8px",
            display: isMobile ? "none" : "block", 
          }}
        >
          <h3>Torso Detection:</h3>
          <p>
            {isTorsoDetected ? (
              <>
                <span style={{ color: "green" }}>✔ Torso detected</span>
              </>
            ) : (
              <span style={{ color: "red" }}>❌ Torso not detected</span>
            )}
          </p>
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
          width: isMobile ? "718px" : "1280px",
          height: isMobile ? "762px" : "720px",
        }}
      />
  
        {/* Поток с веб-камеры */}
        <Webcam
        ref={webcamRef}
        videoConstraints={{
          facingMode: "environment",
          width: videoWidth,
          height: videoHeight,
        }}
        style={{
          position: "absolute",
          marginLeft: "auto",
          marginRight: "auto",
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 1,
          width: isMobile ? "718px" : "1280px",
          height: isMobile ? "762px" : "720px",
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
