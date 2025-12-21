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
const DEFAULT_MAX_ASPECT_DELTA = 0.2; // 20% の偏差を正方形相当とみなす

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
      reject(new Error('jpg/png/webp の画像をアップロードしてください'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error('画像サイズが大きすぎます。圧縮して再試行してください'));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth, naturalHeight } = image;
      if (naturalWidth < minSize || naturalHeight < minSize) {
        reject(new Error(`解像度は ${minSize}×${minSize} 以上が必要です`));
        return;
      }
      if (requireSquare) {
        const ratio = naturalWidth / naturalHeight;
        if (Math.abs(1 - ratio) > maxAspectDelta) {
          reject(new Error('正方形に近いプロフィール画像をアップロードしてください'));
          return;
        }
      }
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました。再試行してください'));
    };
    image.src = url;
  });
