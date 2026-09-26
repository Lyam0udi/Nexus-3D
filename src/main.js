import './style.css';
import { SceneManager } from './canvas/SceneManager.js';
import { ScrollController } from './animations/ScrollController.js';
import { OverlayUI } from './ui/OverlayUI.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('webgl-canvas');
  if (!canvas) {
    console.error('[Nexus] #webgl-canvas not found');
    return;
  }

  const sceneManager = new SceneManager(canvas);
  const scrollController = new ScrollController(sceneManager);
  sceneManager.setScrollController(scrollController);
  const overlayUI = new OverlayUI();

  // Expose for teardown / HMR safety in development
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      overlayUI.destroy();
      sceneManager.destroy();
    });
  }

  window.__nexusScene = sceneManager;
});
