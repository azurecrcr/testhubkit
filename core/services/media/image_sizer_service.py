import io

from PIL import Image


def _to_rgb_for_jpeg(img: Image.Image) -> Image.Image:
    """JPEG 不支持透明通道，RGBA/LA 等需铺白底后转 RGB。"""
    if img.mode == "RGB":
        return img
    if img.mode in ("RGBA", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            background.paste(img, mask=img.split()[3])
        else:
            background.paste(img)
        return background
    return img.convert("RGB")


def _save_jpeg(img: Image.Image, output: io.BytesIO, quality: int) -> None:
    _to_rgb_for_jpeg(img).save(output, format="JPEG", quality=quality)


def resize_image_to_target(file, target_size: float):
    file_data = file.read()

    original_img = Image.open(io.BytesIO(file_data))
    original_width, original_height = original_img.size
    original_size = len(file_data) / (1024 * 1024)

    output = io.BytesIO()
    target_size_bytes = target_size * 1024 * 1024

    if target_size >= original_size:
        original_size_bytes = len(file_data)
        size_ratio = target_size_bytes / original_size_bytes
        pixel_ratio = size_ratio**0.6
        scale_factor = min(pixel_ratio, 100)

        quality = 90
        best_size = 0

        for _ in range(5):
            new_width = int(original_width * scale_factor)
            new_height = int(original_height * scale_factor)

            if new_width * new_height < original_width * original_height * 1.05:
                new_width = int(original_width * 1.05)
                new_height = int(original_height * 1.05)

            img = original_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            _save_jpeg(img, output, quality)
            output.seek(0)

            current_size = len(output.getvalue())
            size_diff = abs(current_size - target_size_bytes)

            if size_diff < 1024:
                break
            if current_size < target_size_bytes:
                if current_size > best_size:
                    best_size = current_size
                if target_size_bytes / current_size > 1.2:
                    scale_factor *= 1.1
                else:
                    quality = min(100, quality + 5)
            else:
                if current_size / target_size_bytes > 1.2:
                    scale_factor *= 0.9
                else:
                    quality = max(50, quality - 5)

            if scale_factor > 100:
                break

        for _ in range(3):
            new_width = int(original_width * scale_factor)
            new_height = int(original_height * scale_factor)
            img = original_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            _save_jpeg(img, output, quality)
            output.seek(0)

            current_size = len(output.getvalue())
            if abs(current_size - target_size_bytes) < 512:
                break
            if current_size < target_size_bytes:
                quality = min(100, quality + 2)
            else:
                quality = max(50, quality - 2)

        output.seek(0)
        current_size = len(output.getvalue())

        if abs(current_size - target_size_bytes) > 1024:
            if current_size < target_size_bytes:
                padding_needed = target_size_bytes - current_size
            else:
                quality = max(50, quality - 5)
                output = io.BytesIO()
                _save_jpeg(img, output, quality)
                output.seek(0)
                current_size = len(output.getvalue())
                padding_needed = target_size_bytes - current_size

            if 0 < padding_needed < 10000:
                img = _to_rgb_for_jpeg(img)

                width, height = img.size
                total_pixels = width * height
                if total_pixels > 0:
                    bytes_per_pixel = max(1, padding_needed // total_pixels + 1)
                    pixels_to_modify = min(
                        total_pixels,
                        (padding_needed + bytes_per_pixel - 1) // bytes_per_pixel,
                    )

                    pixels = img.load()
                    pixels_modified = 0
                    for y in range(height):
                        if pixels_modified >= pixels_to_modify:
                            break
                        for x in range(width):
                            if pixels_modified >= pixels_to_modify:
                                break
                            r, g, b = pixels[x, y]
                            pixels[x, y] = (min(255, r + 1), g, b)
                            pixels_modified += 1

                    output = io.BytesIO()
                    _save_jpeg(img, output, quality)
    else:
        low_quality = 1
        high_quality = 95
        while low_quality <= high_quality:
            mid_quality = (low_quality + high_quality) // 2
            img = original_img
            output = io.BytesIO()
            _save_jpeg(img, output, mid_quality)
            output.seek(0)

            current_size = len(output.getvalue())
            if abs(current_size - target_size_bytes) < 1024:
                break
            if current_size > target_size_bytes:
                high_quality = mid_quality - 1
            else:
                low_quality = mid_quality + 1

            if high_quality < 1:
                high_quality = 1

    output.seek(0)
    return output, file_data
