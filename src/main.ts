import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { SETTINGS } from "./settings";

import "./style.css";

const Elements = {
  getCanvasContainer: () => document.getElementById("canvas-container"),
  getModelRadioInputs: () => document.querySelectorAll("input[name='model']"),
  getActiveModelRadioInput: () => {
    const activeModelRadioInput = document.querySelector(
      "input[name='model']:checked"
    );

    if (
      !activeModelRadioInput ||
      !(activeModelRadioInput instanceof HTMLInputElement)
    ) {
      return null;
    }

    return activeModelRadioInput;
  },
  getImageUploadInput: () => {
    const imageUploadInput = document.getElementById("image-upload");

    if (imageUploadInput instanceof HTMLInputElement) {
      return imageUploadInput;
    }

    return null;
  },
  getColorInput: () => {
    const colorInput = document.getElementById("color-change");

    if (colorInput instanceof HTMLInputElement) {
      return colorInput;
    }

    return null;
  },
} as const;

function handleWindowResize(
  renderer: THREE.Renderer,
  camera: THREE.PerspectiveCamera
) {
  const container = Elements.getCanvasContainer();

  if (!container) {
    return;
  }

  const width = container?.clientWidth ?? 0;
  const height = container?.clientHeight ?? 0;

  renderer.setSize(width, height);

  const aspectRatio = width / height;

  camera.aspect = aspectRatio;
  camera.updateProjectionMatrix();
}

function setupBaseScene() {
  const camera = new THREE.PerspectiveCamera(
    SETTINGS.camera.fov,
    window.innerWidth / window.innerHeight
  );
  camera.position.set(
    SETTINGS.camera.position.x,
    SETTINGS.camera.position.y,
    SETTINGS.camera.position.z
  );

  const renderer = new THREE.WebGLRenderer();

  const handleWindowResizeCallback = handleWindowResize.bind(
    null,
    renderer,
    camera
  );

  handleWindowResizeCallback();
  window.addEventListener("resize", handleWindowResizeCallback);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SETTINGS.scene.backgroundColor);

  return { camera, renderer, scene };
}

function setupLighting(scene: THREE.Scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 1, 0);
  scene.add(directionalLight);
}

function addControls(renderer: THREE.Renderer, camera: THREE.Camera) {
  const controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
}

type ModelWithMeta = {
  name: string;
  mesh: THREE.Mesh;
};

const ModelCache: Map<string, ModelWithMeta> = new Map();

async function loadGLTFObject(name: string) {
  const loader = new GLTFLoader();

  if (!ModelCache.has(name)) {
    const mesh = await loader
      .loadAsync(`/models/${name}.glb`)
      .then((gltf) => gltf.scene.children[0]);

    if (mesh instanceof THREE.Mesh) {
      ModelCache.set(name, {
        name,
        mesh,
      });
    }
  }

  return ModelCache.get(name) ?? null;
}

function setupBaseCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 2048;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create canvas 2D context");
  }

  return { canvas, context };
}

const DRAW_TEXTURE_MAP: Readonly<
  Record<
    string,
    (
      context: CanvasRenderingContext2D,
      color: string,
      image: ImageBitmap | null
    ) => void
  >
> = {
  cup: (context, color, image) => {
    const canvas = context.canvas;

    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.scale(-1 / 4, 1 / 2);
    context.rotate(-Math.PI);

    if (!image) {
      return;
    }

    const aspectRatio = image.width / image.height;

    const originalImageWidth = canvas.width - canvas.width / 4;
    let imageWidth = originalImageWidth;

    const originalImageHeight = canvas.height;
    let imageHeight = originalImageHeight;

    if (aspectRatio > 1) {
      imageHeight = originalImageHeight * (1 / aspectRatio);
    } else if (aspectRatio < 1) {
      imageWidth = originalImageWidth * aspectRatio;
    }

    context.drawImage(
      image,
      canvas.width * 2 + 150 + (originalImageWidth - imageWidth) / 2,
      -1 * (canvas.height + canvas.height / 2) +
        (originalImageHeight - imageHeight) / 2,
      imageWidth,
      imageHeight
    );
  },
  cushion: (context, color, image) => {
    const canvas = context.canvas;

    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!image) {
      return;
    }

    const aspectRatio = image.width / image.height;

    let insetX = 200;
    let insetY = 200;

    if (aspectRatio > 1) {
      insetY += (canvas.height - canvas.width / aspectRatio) / 2;
    } else if (aspectRatio < 1) {
      insetX += (canvas.width - canvas.height * aspectRatio) / 2;
    }

    context.scale(-1 / 2, 1 / 2);
    context.rotate(-Math.PI / 2);

    context.drawImage(
      image,
      -canvas.width + insetX,
      -2 * canvas.height + insetY,
      canvas.width - 2 * insetX,
      canvas.height - 2 * insetY
    );
  },
} as const;

function applyTexture(
  model: ModelWithMeta,
  image: ImageBitmap | null,
  color: string
) {
  const { canvas, context } = setupBaseCanvas();

  const drawTexture = DRAW_TEXTURE_MAP[model.name];

  if (!drawTexture) {
    return;
  }

  drawTexture(context, color, image);

  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({ map: canvasTexture });
  model.mesh.material = material;
}

async function setupImagePreviewControls(scene: THREE.Scene) {
  let activeModel: ModelWithMeta | null = null;
  let activeImage: ImageBitmap | null = null;
  let color = "#ffffff";

  async function setActiveModel(name: string) {
    const newModel = await loadGLTFObject(name);

    if (!newModel) {
      return;
    }

    if (activeModel) {
      scene.remove(activeModel.mesh);
    }

    activeModel = newModel;
    await applyTexture(newModel, activeImage, color);

    scene.add(newModel.mesh);
  }

  const activeModelRadioInput = Elements.getActiveModelRadioInput();

  if (activeModelRadioInput) {
    await setActiveModel(activeModelRadioInput.value);
  }

  Elements.getModelRadioInputs().forEach((input) => {
    input.addEventListener("change", async () => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      await setActiveModel(input.value);
    });
  });

  const imageUploadInput = Elements.getImageUploadInput();

  if (!imageUploadInput) {
    return;
  }

  imageUploadInput.addEventListener("change", async () => {
    const imageFile = imageUploadInput.files?.item(0) ?? null;

    if (!imageFile || !activeModel) {
      return;
    }

    let imageBitmap: ImageBitmap | null = null;

    try {
      imageBitmap = await createImageBitmap(imageFile);
      activeImage = imageBitmap;
    } catch {
      return;
    }

    applyTexture(activeModel, activeImage, color);
  });

  const colorInput = Elements.getColorInput();

  if (!colorInput) {
    return;
  }

  colorInput.addEventListener("input", () => {
    color = colorInput.value;

    if (activeModel) {
      applyTexture(activeModel, activeImage, color);
    }
  });
}

async function main() {
  const { renderer, camera, scene } = setupBaseScene();

  setupLighting(scene);

  addControls(renderer, camera);

  await setupImagePreviewControls(scene);

  function animate() {
    renderer.render(scene, camera);
  }

  animate();

  const canvasContainer = Elements.getCanvasContainer();

  if (!canvasContainer) {
    return;
  }

  canvasContainer.appendChild(renderer.domElement);

  renderer.setAnimationLoop(animate);
}

main();
