import React, { useState, startTransition, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './menu.module.css';

// Ленивая загрузка ModelViewer
const ModelViewer = lazy(() => import('../ModelViewer/ModelViewer'));

export const Menu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('/3d/1.glb'); // По умолчанию выбираем первую модель
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleModelSelect = (modelPath) => {
    startTransition(() => {
      setSelectedModel(modelPath);
    });
    setIsOpen(false); // Закрыть меню после выбора модели
  };

  const initARSession = async () => {
    if (navigator.xr) {
      try {
        // Проверка, доступна ли AR-сессия
        const session = await navigator.xr.requestSession('immersive-ar');
        // Обработчик для AR-сессии (можно добавить нужную логику)
        console.log('AR session started!');
      } catch (error) {
        console.error('Error starting AR session:', error);
      }
    } else {
      console.error('WebXR не поддерживается на этом устройстве.');
    }
  };

  return (
    <div>
      <div className={styles.container}>
        <button className={styles.menuButton} onClick={toggleMenu}>
          {isOpen ? 'Exit Menu' : 'Open Menu'}
        </button>
        <button
          className={styles.navigateButton}
          onClick={() => {
            initARSession(); // Запускаем AR сессию при клике
            navigate('/app');
          }}
        >
          Open Camera App
        </button>
        <div className={`${styles.menu} ${isOpen ? styles.menuOpen : ''}`}>
          <button className={styles.closeButton} onClick={toggleMenu}>
            X
          </button>
          <ul className={styles.menuList}>
            <li className={styles.menuItem} onClick={() => handleModelSelect('/3d/1.glb')}>Supreme Shirt</li>
            <li className={styles.menuItem} onClick={() => handleModelSelect('/3d/2.glb')}>Smile Jeans</li>
            <li className={styles.menuItem} onClick={() => handleModelSelect('/3d/3.glb')}>Red Puffer</li>
            <li className={styles.menuItem} onClick={() => handleModelSelect('/3d/4.glb')}>Pleated Elegance</li>
            <li className={styles.menuItem} onClick={() => handleModelSelect('/3d/5.glb')}>Floral Elegance Shirt</li>
          </ul>
        </div>
      </div>

      {/* Ленивая загрузка 3D модели */}
      <Suspense fallback={<div>Loading model...</div>}>
        <ModelViewer modelPath={selectedModel} scale={0.15} />
      </Suspense>
    </div>
  );
};
