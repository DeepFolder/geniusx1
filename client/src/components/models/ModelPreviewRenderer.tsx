import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

interface ModelPreviewRendererProps {
  modelPath: string;
  fileName: string;
  onImageGenerated: (imageUrl: string) => void;
}

export default function ModelPreviewRenderer({ modelPath, fileName, onImageGenerated }: ModelPreviewRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    console.log('ModelPreviewRenderer: Starting generation for', fileName, 'from', modelPath);
    
    try {
      // Create off-screen renderer for capturing image
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        preserveDrawingBuffer: true // Important for capturing images
      });
      renderer.setSize(800, 800); // Larger size for better detail
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0xffffff, 0.0); // Transparent background for preview

    // Scene setup
    const scene = new THREE.Scene();

    // Camera setup - positioned for good preview angle
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(4, 4, 4);

    // Enhanced lighting setup for better preview visibility
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);

    // Additional lights for better contrast and visibility
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 10, -15);
    scene.add(rimLight);

    // Add a point light for extra highlighting
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 20);
    pointLight.position.set(5, 8, 5);
    scene.add(pointLight);

    // Create appropriate 3D model based on file name and type
    const createPreviewModel = () => {
      const fileNameLower = fileName.toLowerCase();
      const modelPathLower = modelPath.toLowerCase();
      
      // Determine model type based on filename and path
      if (fileNameLower.includes('screw') || modelPathLower.includes('screw')) {
        return createScrewModel();
      } else if (fileNameLower.includes('cnc') || fileNameLower.includes('machining')) {
        return createCNCMachineModel();
      } else if (fileNameLower.includes('scanner') || fileNameLower.includes('quality')) {
        return createScannerModel();
      } else if (fileNameLower.includes('robot') || fileNameLower.includes('arm')) {
        return createRobotArmModel();
      } else if (fileNameLower.includes('printer') || fileNameLower.includes('3d')) {
        return create3DPrinterModel();
      } else if (fileNameLower.includes('ai') || fileNameLower.includes('optimizer')) {
        return createAIOptimizerModel();
      } else {
        // Default to a generic industrial equipment model
        return createGenericIndustrialModel();
      }
    };

    // Create STEP-inspired 3D screw model for preview
    const createScrewModel = () => {
      const group = new THREE.Group();

      // Screw head (hex head) - larger and more detailed for better visibility
      const headGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.5, 6);
      const headMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x4a4a4a,
        shininess: 150,
        specular: 0x888888,
        reflectivity: 0.3
      });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.y = 0.25;
      head.castShadow = true;
      head.receiveShadow = true;
      group.add(head);

      // Hex socket in screw head for more detail
      const socketGeometry = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 6);
      const socketMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2a2a2a,
        shininess: 80
      });
      const socket = new THREE.Mesh(socketGeometry, socketMaterial);
      socket.position.y = 0.35;
      group.add(socket);

      // Screw shaft - larger and more prominent
      const shaftGeometry = new THREE.CylinderGeometry(0.6, 0.6, 4.0, 24);
      const shaftMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x5a5a5a,
        shininess: 120,
        specular: 0x777777,
        reflectivity: 0.2
      });
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
      shaft.position.y = -1.75;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      group.add(shaft);

      // Thread grooves - more detailed and visible
      for (let i = 0; i < 16; i++) {
        const threadGeometry = new THREE.TorusGeometry(0.65, 0.04, 8, 16);
        const threadMaterial = new THREE.MeshPhongMaterial({ 
          color: 0x6a6a6a,
          shininess: 100,
          specular: 0x666666
        });
        const thread = new THREE.Mesh(threadGeometry, threadMaterial);
        thread.position.y = 0.2 - (i * 0.22);
        thread.rotation.x = Math.PI / 2;
        thread.castShadow = true;
        group.add(thread);
      }

      // Screw tip - more prominent
      const tipGeometry = new THREE.ConeGeometry(0.55, 1.0, 12);
      const tipMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x4a4a4a,
        shininess: 110,
        specular: 0x777777
      });
      const tip = new THREE.Mesh(tipGeometry, tipMaterial);
      tip.position.y = -4.25;
      tip.castShadow = true;
      tip.receiveShadow = true;
      group.add(tip);

      return group;
    };

    // Create CNC Machine model
    const createCNCMachineModel = () => {
      const group = new THREE.Group();
      
      // Base platform
      const baseGeometry = new THREE.BoxGeometry(4, 0.3, 3);
      const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = -1;
      base.castShadow = true;
      group.add(base);
      
      // Vertical column
      const columnGeometry = new THREE.BoxGeometry(0.6, 3, 0.6);
      const columnMaterial = new THREE.MeshPhongMaterial({ color: 0x34495e });
      const column = new THREE.Mesh(columnGeometry, columnMaterial);
      column.position.set(-1.5, 0.5, 0);
      column.castShadow = true;
      group.add(column);
      
      // Spindle head
      const spindleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.5);
      const spindleMaterial = new THREE.MeshPhongMaterial({ color: 0xe74c3c });
      const spindle = new THREE.Mesh(spindleGeometry, spindleMaterial);
      spindle.position.set(0, 1, 0);
      spindle.castShadow = true;
      group.add(spindle);
      
      return group;
    };

    // Create Scanner model
    const createScannerModel = () => {
      const group = new THREE.Group();
      
      // Scanner base
      const baseGeometry = new THREE.CylinderGeometry(1.2, 1.5, 0.4, 12);
      const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = -0.8;
      base.castShadow = true;
      group.add(base);
      
      // Scanner head
      const headGeometry = new THREE.SphereGeometry(0.8, 16, 12);
      const headMaterial = new THREE.MeshPhongMaterial({ color: 0x2980b9 });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.y = 0.2;
      head.castShadow = true;
      group.add(head);
      
      // Lens
      const lensGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2);
      const lensMaterial = new THREE.MeshPhongMaterial({ color: 0x1abc9c });
      const lens = new THREE.Mesh(lensGeometry, lensMaterial);
      lens.position.set(0, 0.2, 0.7);
      lens.rotation.x = Math.PI / 2;
      lens.castShadow = true;
      group.add(lens);
      
      return group;
    };

    // Create Robot Arm model
    const createRobotArmModel = () => {
      const group = new THREE.Group();
      
      // Base
      const baseGeometry = new THREE.CylinderGeometry(1, 1.2, 0.5, 8);
      const baseMaterial = new THREE.MeshPhongMaterial({ color: 0xe67e22 });
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = -1;
      base.castShadow = true;
      group.add(base);
      
      // First arm segment
      const arm1Geometry = new THREE.CylinderGeometry(0.2, 0.3, 2);
      const armMaterial = new THREE.MeshPhongMaterial({ color: 0xd35400 });
      const arm1 = new THREE.Mesh(arm1Geometry, armMaterial);
      arm1.position.set(0, 0, 0);
      arm1.rotation.z = Math.PI / 6;
      arm1.castShadow = true;
      group.add(arm1);
      
      // Second arm segment
      const arm2 = new THREE.Mesh(arm1Geometry, armMaterial);
      arm2.position.set(1.2, 1.2, 0);
      arm2.rotation.z = -Math.PI / 4;
      arm2.castShadow = true;
      group.add(arm2);
      
      return group;
    };

    // Create 3D Printer model
    const create3DPrinterModel = () => {
      const group = new THREE.Group();
      
      // Frame
      const frameGeometry = new THREE.BoxGeometry(3, 2.5, 2.5);
      const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x9b59b6, wireframe: true, wireframeLinewidth: 2 });
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      frame.position.y = 0.25;
      group.add(frame);
      
      // Print bed
      const bedGeometry = new THREE.BoxGeometry(2.5, 0.1, 2);
      const bedMaterial = new THREE.MeshPhongMaterial({ color: 0x34495e });
      const bed = new THREE.Mesh(bedGeometry, bedMaterial);
      bed.position.y = -1;
      bed.castShadow = true;
      group.add(bed);
      
      // Print head
      const headGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.4);
      const headMaterial = new THREE.MeshPhongMaterial({ color: 0xe74c3c });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.set(0, 0.8, 0);
      head.castShadow = true;
      group.add(head);
      
      return group;
    };

    // Create AI Optimizer model
    const createAIOptimizerModel = () => {
      const group = new THREE.Group();
      
      // Main unit
      const unitGeometry = new THREE.BoxGeometry(2, 1.5, 1);
      const unitMaterial = new THREE.MeshPhongMaterial({ color: 0x1abc9c });
      const unit = new THREE.Mesh(unitGeometry, unitMaterial);
      unit.position.y = 0;
      unit.castShadow = true;
      group.add(unit);
      
      // AI brain visualization (glowing sphere)
      const brainGeometry = new THREE.SphereGeometry(0.3, 16, 12);
      const brainMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x00ff88,
        emissive: 0x004422,
        transparent: true,
        opacity: 0.8
      });
      const brain = new THREE.Mesh(brainGeometry, brainMaterial);
      brain.position.set(0, 0.3, 0.6);
      brain.castShadow = true;
      group.add(brain);
      
      // Display screen
      const screenGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.05);
      const screenMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
      const screen = new THREE.Mesh(screenGeometry, screenMaterial);
      screen.position.set(0, 0.2, 0.52);
      screen.castShadow = true;
      group.add(screen);
      
      return group;
    };

    // Create Generic Industrial model
    const createGenericIndustrialModel = () => {
      const group = new THREE.Group();
      
      // Main body
      const bodyGeometry = new THREE.BoxGeometry(2, 1.5, 1.5);
      const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x7f8c8d });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.y = 0;
      body.castShadow = true;
      group.add(body);
      
      // Control panel
      const panelGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.1);
      const panelMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
      const panel = new THREE.Mesh(panelGeometry, panelMaterial);
      panel.position.set(0, 0.3, 0.8);
      panel.castShadow = true;
      group.add(panel);
      
      // Indicator lights
      const lightGeometry = new THREE.SphereGeometry(0.08, 8, 6);
      const greenLight = new THREE.MeshPhongMaterial({ color: 0x27ae60, emissive: 0x0f4f23 });
      const redLight = new THREE.MeshPhongMaterial({ color: 0xe74c3c, emissive: 0x4f1319 });
      
      const light1 = new THREE.Mesh(lightGeometry, greenLight);
      light1.position.set(-0.2, 0.4, 0.85);
      group.add(light1);
      
      const light2 = new THREE.Mesh(lightGeometry, redLight);
      light2.position.set(0.2, 0.4, 0.85);
      group.add(light2);
      
      return group;
    };

    // Create and add the appropriate model
    const model = createPreviewModel();
    scene.add(model);

    // Position camera to frame the model nicely
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.2; // Closer zoom for better detail visibility

    camera.position.set(cameraZ * 0.8, cameraZ * 0.9, cameraZ * 0.8);
    camera.lookAt(center);

    // Controls for slight animation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(center);
    controls.update();

    // Rotate model for optimal preview angle showing threads and head detail
    model.rotation.y = Math.PI / 4;
    model.rotation.x = -Math.PI / 12;

    // Render and capture image
    const capturePreview = () => {
      console.log('ModelPreviewRenderer: Capturing preview for', fileName);
      // Render the scene
      renderer.render(scene, camera);
      
      // Capture as image
      const canvas = renderer.domElement;
      const imageUrl = canvas.toDataURL('image/png', 0.9);
      
      console.log('ModelPreviewRenderer: Generated image for', fileName, 'size:', imageUrl.length, 'bytes');
      
      // Call the callback with the generated image
      onImageGenerated(imageUrl);
      setIsGenerating(false);
    };

      // Small delay to ensure everything is rendered properly
      console.log('ModelPreviewRenderer: Scheduling capture for', fileName);
      setTimeout(capturePreview, 200);

      // Cleanup
      return () => {
        renderer.dispose();
        scene.clear();
      };
    } catch (err) {
      console.error('WebGL preview generation error:', err);
      // Generate a simple fallback preview without 3D
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = 800;
      fallbackCanvas.height = 800;
      const ctx = fallbackCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, 800, 800);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('3D Preview Unavailable', 400, 400);
        onImageGenerated(fallbackCanvas.toDataURL('image/png'));
      }
      setIsGenerating(false);
    }
  }, [modelPath, fileName, onImageGenerated]);

  // This component renders off-screen, so we return a minimal hidden element
  return (
    <div 
      ref={mountRef} 
      style={{ 
        position: 'absolute', 
        left: '-9999px', 
        top: '-9999px',
        width: '800px',
        height: '800px',
        pointerEvents: 'none'
      }}
    />
  );
}