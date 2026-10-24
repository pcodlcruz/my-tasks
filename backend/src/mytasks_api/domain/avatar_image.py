import io

from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError

# Input limits (feature 004, FR-018 to FR-021). The server never stores what it receives: it
# decodes the picture, drops everything but the pixels and writes a new, small WebP.
MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 200 * 1024
# Pixels allowed before decoding. A decompression bomb is a tiny file that announces billions of
# pixels. 12 megapixels is a full phone photo (and the client sends at most 512x512): decoding it
# takes around 50 MB, a few copies of it around 150 MB, which a small instance can afford.
MAX_PIXELS = 12_000_000
AVATAR_SIZE = 256

# Identified by content (Pillow reads the header), never by extension or declared type.
_ACCEPTED_FORMATS = ["JPEG", "PNG", "WEBP"]
_WEBP_QUALITIES = (85, 70, 50)
_TRANSPARENT_MODES = {"RGBA", "LA", "PA"}


class AvatarTooLargeError(Exception):
    pass


class AvatarUnsupportedError(Exception):
    pass


def _open(data: bytes) -> ImageFile.ImageFile:
    try:
        image = Image.open(io.BytesIO(data), formats=_ACCEPTED_FORMATS)
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
    ) as error:
        raise AvatarUnsupportedError from error
    width, height = image.size
    # Before decoding anything: only the header has been read so far.
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise AvatarUnsupportedError
    return image


def _decode(image: ImageFile.ImageFile) -> Image.Image:
    try:
        image.load()
        upright = ImageOps.exif_transpose(image)
        has_alpha = upright.mode in _TRANSPARENT_MODES or "transparency" in upright.info
        return upright.convert("RGBA" if has_alpha else "RGB")
    except (OSError, SyntaxError, ValueError, EOFError, Image.DecompressionBombError) as error:
        # Truncated or corrupt file: Pillow raises while loading, not while opening.
        raise AvatarUnsupportedError from error


def _encode(image: Image.Image) -> bytes:
    # A new image made of the pixels alone: no EXIF, ICC profile, XMP or text chunk can come
    # along, whatever the input carried.
    clean = Image.frombytes(image.mode, image.size, image.tobytes())
    for quality in _WEBP_QUALITIES:
        buffer = io.BytesIO()
        clean.save(buffer, format="WEBP", quality=quality, method=4, exif=b"", icc_profile=None)
        if buffer.tell() <= MAX_OUTPUT_BYTES:
            return buffer.getvalue()
    raise AvatarUnsupportedError


def process_avatar(data: bytes) -> bytes:
    """The stored avatar for an uploaded picture: a 256x256 WebP, centered square crop, upright
    and without metadata. Raises `AvatarTooLargeError` or `AvatarUnsupportedError`."""
    if len(data) > MAX_INPUT_BYTES:
        raise AvatarTooLargeError
    image = _open(data)
    picture = _decode(image)
    square = ImageOps.fit(
        picture, (AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS, centering=(0.5, 0.5)
    )
    return _encode(square)
