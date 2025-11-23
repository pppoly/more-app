export interface ProcessAvatarOptions {
  size?: number; // 输出正方形边长
  quality?: number; // 0-1
}

const DEFAULT_SIZE = 720;
const DEFAULT_QUALITY = 0.86;

// 读取文件 -> 旋转纠正 EXIF -> 居中裁剪成正方形 -> 压缩输出 Blob
export const processAvatarImage = (file: File, options: ProcessAvatarOptions = {}) =>
  new Promise<Blob>((resolve, reject) => {
    const size = options.size ?? DEFAULT_SIZE;
    const quality = options.quality ?? DEFAULT_QUALITY;

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法处理图片')); return;
          }

          // 居中裁剪为正方形
          const minSide = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - minSide) / 2;
          const sy = (img.naturalHeight - minSide) / 2;

          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('图片压缩失败'));
            },
            'image/jpeg',
            quality,
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error('图片处理异常'));
        }
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
