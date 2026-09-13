import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls, STLLoader } from 'three-stdlib';
import { Button } from '@/components/ui/button';
import { RotateCcw, ZoomIn, ZoomOut, Home, Download } from 'lucide-react';

interface Three3DViewerProps {
  modelPath: string;
  fileName: string;
  minimal?: boolean;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Three3DViewer({ modelPath, fileName, minimal = false }: Three3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const modelRef = useRef<THREE.Object3D>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading 3D Model...');

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    let animationFrameId: number;
    let occtModule: any = null;

    const initScene = () => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8fafc);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        45,
        mount.clientWidth / mount.clientHeight,
        0.1,
        10000
      );
      camera.position.set(100, 100, 100);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight1.position.set(5, 10, 7);
      dirLight1.castShadow = true;
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
      dirLight2.position.set(-5, -5, -5);
      scene.add(dirLight2);

      return { scene, camera, renderer, controls };
    };

    const fitCamera = (object: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2;
      
      camera.position.set(center.x + cameraZ * 0.7, center.y + cameraZ * 0.7, center.z + cameraZ * 0.7);
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();
    };

    const loadSTEPFile = async (scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      try {
        setLoadingMessage('Initializing STEP parser...');
        
        const occtImportJs = await import('occt-import-js');
        
        occtModule = await occtImportJs.default({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              return `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/${path}`;
            }
            return path;
          }
        });
        
        setLoadingMessage('Downloading STEP file...');
        const response = await fetch(modelPath, { headers: getAuthHeader() });
        if (!response.ok) {
          throw new Error(`Failed to fetch STEP file: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        const fileBuffer = new Uint8Array(buffer);
        
        setLoadingMessage('Parsing STEP geometry...');
        const result = occtModule.ReadStepFile(fileBuffer, null);
        
        if (!result.success || !result.meshes || result.meshes.length === 0) {
          throw new Error('Failed to parse STEP file or no geometry found');
        }
        
        setLoadingMessage('Building 3D mesh...');
        const group = new THREE.Group();
        
        for (const mesh of result.meshes) {
          const geometry = new THREE.BufferGeometry();
          
          const positionArray = mesh.attributes.position.array instanceof Float32Array 
            ? mesh.attributes.position.array 
            : new Float32Array(mesh.attributes.position.array);
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3));
          
          if (mesh.attributes.normal) {
            const normalArray = mesh.attributes.normal.array instanceof Float32Array
              ? mesh.attributes.normal.array
              : new Float32Array(mesh.attributes.normal.array);
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3));
          } else {
            geometry.computeVertexNormals();
          }
          
          if (mesh.index) {
            const indexArray = mesh.index.array instanceof Uint32Array
              ? mesh.index.array
              : new Uint32Array(mesh.index.array);
            geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
          }
          
          const material = new THREE.MeshPhongMaterial({
            color: mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : 0x7c8594,
            specular: 0x333333,
            shininess: 80,
            side: THREE.DoubleSide
          });
          
          const threeMesh = new THREE.Mesh(geometry, material);
          threeMesh.castShadow = true;
          threeMesh.receiveShadow = true;
          group.add(threeMesh);
        }
        
        scene.add(group);
        modelRef.current = group;
        fitCamera(group, camera, controls);
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error loading STEP file:', err);
        setError(`Failed to load STEP file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    const loadSTLFile = async (scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      try {
        const response = await fetch(modelPath, { headers: getAuthHeader() });
        if (!response.ok) {
          throw new Error(`Failed to fetch STL file: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const loader = new STLLoader();
        const geometry = loader.parse(buffer);

        const material = new THREE.MeshPhongMaterial({ 
          color: 0x64748b, 
          specular: 0x111111, 
          shininess: 200 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        geometry.computeBoundingBox();
        geometry.center();
        
        scene.add(mesh);
        modelRef.current = mesh;
        fitCamera(mesh, camera, controls);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading STL:', err);
        setError('Failed to load 3D model file.');
        setIsLoading(false);
      }
    };

    const detectFormatAndLoad = async (scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      const lower = modelPath.toLowerCase();
      const isSTL = lower.endsWith('.stl');
      const isSTEP = lower.endsWith('.step') || lower.endsWith('.stp');

      if (isSTL) {
        loadSTLFile(scene, camera, controls);
        return;
      }
      if (isSTEP) {
        loadSTEPFile(scene, camera, controls);
        return;
      }

      // Extension not visible in path (e.g. /api/files/:id or /objects/...) — detect via Content-Type
      try {
        const headRes = await fetch(modelPath, { method: 'HEAD', headers: getAuthHeader() });
        const ct = (headRes.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('model/stl') || ct.includes('application/sla') || ct.includes('vnd.ms-pki.stl')) {
          loadSTLFile(scene, camera, controls);
        } else if (ct.includes('application/step') || ct.includes('model/step') || ct.includes('application/x-step')) {
          loadSTEPFile(scene, camera, controls);
        } else {
          setError('Unsupported file format. Please use STL or STEP files.');
          setIsLoading(false);
        }
      } catch {
        setError('Could not determine file format.');
        setIsLoading(false);
      }
    };

    try {
      const { scene, camera, renderer, controls } = initScene();
      detectFormatAndLoad(scene, camera, controls);

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const handleResize = () => {
        if (!mount) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        if (mount.contains(renderer.domElement)) {
          mount.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (err) {
      console.error('3D Viewer Error:', err);
      setError('WebGL initialization failed.');
      setIsLoading(false);
    }
  }, [modelPath]);

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && modelRef.current) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const model = modelRef.current;
      
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      
      const fov = camera.fov * (Math.PI / 180);
      const distance = Math.abs(size / Math.sin(fov / 2)) * 0.8;
      
      camera.position.copy(center);
      camera.position.x += distance * 0.6;
      camera.position.y += distance * 0.6;
      camera.position.z += distance * 0.6;
      
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();
    }
  };

  const zoomIn = () => {
    if (cameraRef.current) {
      const direction = new THREE.Vector3();
      cameraRef.current.getWorldDirection(direction);
      cameraRef.current.position.addScaledVector(direction, 5);
    }
  };

  const zoomOut = () => {
    if (cameraRef.current) {
      const direction = new THREE.Vector3();
      cameraRef.current.getWorldDirection(direction);
      cameraRef.current.position.addScaledVector(direction, -5);
    }
  };

  const rotateModel = () => {
    if (modelRef.current) {
      modelRef.current.rotation.y += Math.PI / 4;
    }
  };

  const downloadModel = () => {
    const link = document.createElement('a');
    link.href = modelPath;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
      <div 
        ref={mountRef} 
        className="w-full h-full min-h-[400px]"
        style={{ cursor: isLoading ? 'wait' : 'grab' }}
      />

      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-700 dark:text-gray-300 text-lg font-medium">{loadingMessage}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <div className="text-center text-red-600 dark:text-red-400 px-4">
            <p className="text-lg font-medium mb-2">Failed to load 3D model</p>
            <p className="text-sm">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadModel}
              className="mt-4"
            >
              <Download className="w-4 h-4 mr-2" />
              Download File
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && !minimal && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg p-2 shadow-lg">
          <div className="flex flex-row space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={resetCamera}
              className="p-2"
              title="Reset View"
            >
              <Home className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={zoomIn}
              className="p-2"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={zoomOut}
              className="p-2"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={rotateModel}
              className="p-2"
              title="Rotate Model"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
