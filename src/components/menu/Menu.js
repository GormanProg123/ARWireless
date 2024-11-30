//menu.js
import React, { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import "./ClothingMenu.css";

function ClothingModel({ modelPath, position }) {
  const { scene } = useGLTF(modelPath, true, (error) =>
    console.error("Model loading error:", error)
  );
  return <primitive object={scene} position={position} scale={1} />;
}

const ClothingMenu = ({ onModelSelect }) => {
  const clothingItems = [
    { id: 1, name: "Model 1", path: "/3d/1.glb" },
    { id: 2, name: "Model 2", path: "/3d/2.glb" },
    { id: 3, name: "Model 3", path: "/3d/3.glb" },
    { id: 4, name: "Model 4", path: "/3d/4.glb" },
    { id: 5, name: "Model 5", path: "/3d/5.glb" },
  ];

  const [selectedModel, setSelectedModel] = useState(null);

  const handleSelect = (item) => {
    setSelectedModel(item);
    onModelSelect(item.path);
  };

  return (
    <div className="clothing-menu">
      <h2>Choose clothes</h2>
      <div className="clothing-carousel">
        {clothingItems.map((item) => (
          <div
            key={item.id}
            className={`clothing-item ${
              selectedModel?.id === item.id ? "selected" : ""
            }`}
            onClick={() => handleSelect(item)}
          >
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      {selectedModel && (
        <Canvas style={{ width: "100%", height: "300px" }}>
          <ambientLight intensity={0.5} />
          <ClothingModel modelPath={selectedModel.path} position={[0, 0, 0]} />
        </Canvas>
      )}
    </div>
  );
};

export default ClothingMenu;