import io
import mimetypes
import os

from PIL import Image
from werkzeug.utils import secure_filename


def convert_image_format(file, target_format: str, quality: int):
    filename = secure_filename(file.filename) or "upload.bin"
    file_data = file.read()
    img = Image.open(io.BytesIO(file_data))
    format_mapping = {
        "png": "PNG",
        "jpg": "JPEG",
        "bmp": "BMP",
        "tiff": "TIFF",
        "webp-lossless": "WEBP",
        "webp-lossy": "WEBP",
        "heic": "PNG",
    }

    output_format = format_mapping.get(target_format, "PNG")
    ext = "png" if target_format == "heic" else target_format.replace("-lossless", "").replace("-lossy", "")
    base_name = os.path.splitext(filename)[0]
    output_filename = f"{base_name}_converted.{ext}"

    save_kwargs = {}
    img_copy = img.copy()
    if output_format == "JPEG":
        if img_copy.mode in ("RGBA", "LA"):
            background = Image.new("RGB", img_copy.size, (255, 255, 255))
            if img_copy.mode == "RGBA":
                background.paste(img_copy, mask=img_copy.split()[3])
            else:
                background.paste(img_copy)
            img_copy = background
        save_kwargs["quality"] = quality
        save_kwargs["optimize"] = True
    elif output_format == "WEBP":
        if target_format == "webp-lossless":
            save_kwargs["lossless"] = True
            save_kwargs["quality"] = 100
        else:
            save_kwargs["lossless"] = False
            save_kwargs["quality"] = quality
    elif output_format == "PNG":
        save_kwargs["optimize"] = True
    elif output_format == "TIFF":
        save_kwargs["compression"] = "tiff_deflate"

    output = io.BytesIO()
    img_copy.save(output, format=output_format, **save_kwargs)
    img_copy.close()
    img.close()
    output.seek(0)

    mimetype = mimetypes.guess_type(output_filename)[0] or "application/octet-stream"
    return file_data, filename, output, output_filename, mimetype
