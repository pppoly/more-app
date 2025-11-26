export interface AvatarValidationOptions {
  minSize?: number;
  maxBytes?: number;
  allowedTypes?: string[];
  requireSquare?: boolean;
  maxAspectDelta?: number;
}

const DEFAULT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MIN_SIZE = 128;
const DEFAULT_MAX_BYTES = 500 * 1024;
const DEFAULT_MAX_ASPECT_DELTA = 0.2; // 20% 偏差视为近似正方形

export const validateAvatarFile = (file: File, options: AvatarValidationOptions = {}) =>
  new Promise<void>((resolve, reject) => {
    const {
      minSize = DEFAULT_MIN_SIZE,
      maxBytes = DEFAULT_MAX_BYTES,
      allowedTypes = DEFAULT_TYPES,
      requireSquare = true,
      maxAspectDelta = DEFAULT_MAX_ASPECT_DELTA,
    } = options;

    if (!allowedTypes.includes(file.type)) {
      reject(new Error('请上传 jpg/png/webp 图片'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error('图片体积过大，请压缩后再试'));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth, naturalHeight } = image;
      if (naturalWidth < minSize || naturalHeight < minSize) {
        reject(new Error(`分辨率需至少 ${minSize}×${minSize}`));
        return;
      }
      if (requireSquare) {
        const ratio = naturalWidth / naturalHeight;
        if (Math.abs(1 - ratio) > maxAspectDelta) {
          reject(new Error('请上传近似方形的头像'));
          return;
        }
      }
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败，请重试'));
    };
    image.src = url;
  });
