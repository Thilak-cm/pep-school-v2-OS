export const MAX_PHOTO_DIMENSION = 1600;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const normalizeRotation = (degrees) => ((degrees % 360) + 360) % 360;

export function createEditorState({ width, height }) {
  return {
    originalWidth: width,
    originalHeight: height,
    crop: { x: 0, y: 0, width, height },
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

export function applyEditorOperation(state, operation) {
  if (!operation) return state;
  if (operation.type === 'crop') {
    return { ...state, crop: { ...state.crop, ...operation.crop } };
  }
  if (operation.type === 'rotate') {
    return { ...state, rotation: normalizeRotation(state.rotation + operation.degrees) };
  }
  if (operation.type === 'flip') {
    return operation.axis === 'vertical'
      ? { ...state, flipY: !state.flipY }
      : { ...state, flipX: !state.flipX };
  }
  return state;
}

export function resetEditorState(state) {
  return createEditorState({ width: state.originalWidth, height: state.originalHeight });
}

export function hasPixelChanges(state) {
  return state.rotation !== 0
    || state.flipX
    || state.flipY
    || state.crop.x !== 0
    || state.crop.y !== 0
    || state.crop.width !== state.originalWidth
    || state.crop.height !== state.originalHeight;
}

export function getOutputDimensions(state) {
  const rotated = state.rotation === 90 || state.rotation === 270;
  return rotated
    ? { width: state.crop.height, height: state.crop.width }
    : { width: state.crop.width, height: state.crop.height };
}

export async function exportEditedPhoto(source, state, { maxDimension = MAX_PHOTO_DIMENSION, maxBytes = MAX_PHOTO_BYTES } = {}) {
  const sourceUrl = URL.createObjectURL(source);
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('Unable to load image for editing'));
      candidate.src = sourceUrl;
    });
    const raw = getOutputDimensions(state);
    const scale = Math.min(1, maxDimension / Math.max(raw.width, raw.height));
    let width = Math.max(1, Math.round(raw.width * scale));
    let height = Math.max(1, Math.round(raw.height * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process edited image');

    const render = async (quality) => {
      canvas.width = width;
      canvas.height = height;
      context.save();
      const unrotatedWidth = Math.max(1, Math.round(state.crop.width * scale));
      const unrotatedHeight = Math.max(1, Math.round(state.crop.height * scale));
      context.translate(width / 2, height / 2);
      context.rotate((state.rotation * Math.PI) / 180);
      context.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
      context.drawImage(
        image,
        state.crop.x,
        state.crop.y,
        state.crop.width,
        state.crop.height,
        -unrotatedWidth / 2,
        -unrotatedHeight / 2,
        unrotatedWidth,
        unrotatedHeight,
      );
      context.restore();
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    };

    let quality = 0.82;
    let blob = await render(quality);
    while (blob && blob.size > maxBytes && quality > 0.22) {
      quality -= 0.08;
      blob = await render(quality);
    }
    while (blob && blob.size > maxBytes && Math.max(width, height) > 320) {
      width = Math.max(320, Math.round(width * 0.78));
      height = Math.max(320, Math.round(height * 0.78));
      blob = await render(Math.min(quality, 0.48));
    }
    if (!blob || blob.size > maxBytes) throw new Error('Edited photo is still above 2MB after compression.');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
