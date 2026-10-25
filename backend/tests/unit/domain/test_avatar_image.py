import io
import random
import struct
import time
import zlib

import pytest
from PIL import Image, ImageFile

from mytasks_api.domain.avatar_image import (
    AVATAR_SIZE,
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    MAX_PIXELS,
    AvatarTooLargeError,
    AvatarUnsupportedError,
    process_avatar,
)

pytestmark = pytest.mark.unit

RED = (220, 30, 30)
GREEN = (30, 200, 30)
BLUE = (30, 30, 220)


def _encode(image: Image.Image, image_format: str, **options: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=image_format, **options)
    return buffer.getvalue()


def _stripes(
    size: tuple[int, int], colors: list[tuple[int, int, int]], vertical: bool = True
) -> Image.Image:
    """Equal stripes of the given colors, left to right (or top to bottom)."""
    image = Image.new("RGB", size)
    length = size[0] if vertical else size[1]
    for index, color in enumerate(colors):
        start = length * index // len(colors)
        end = length * (index + 1) // len(colors)
        box = (start, 0, end, size[1]) if vertical else (0, start, size[0], end)
        image.paste(color, box)
    return image


def _open(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def _close(pixel: tuple[int, ...], expected: tuple[int, int, int], tolerance: int = 45) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(pixel[:3], expected, strict=True))


def _png_with_header_size(width: int, height: int) -> bytes:
    """A PNG whose header announces a huge image but whose body is a few bytes: the shape of a
    decompression bomb. Built by hand so the test never allocates the pixels."""

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 1, 0, 0, 0, 0)  # 1-bit grayscale
    body = zlib.compress(b"\x00" * 64)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    )


class TestValidImages:
    @pytest.mark.parametrize(
        ("image_format", "options"),
        [("JPEG", {"quality": 90}), ("PNG", {}), ("WEBP", {"quality": 90})],
    )
    def test_each_accepted_format_becomes_a_square_webp_of_256_pixels(
        self, image_format: str, options: dict[str, object]
    ) -> None:
        source = _encode(_stripes((300, 300), [RED, GREEN, BLUE]), image_format, **options)

        result = _open(process_avatar(source))

        assert result.format == "WEBP"
        assert result.size == (AVATAR_SIZE, AVATAR_SIZE) == (256, 256)

    def test_a_wide_image_is_cropped_to_the_centered_square(self) -> None:
        source = _encode(_stripes((300, 100), [RED, GREEN, BLUE]), "PNG")

        result = _open(process_avatar(source)).convert("RGB")

        for point in [(10, 10), (128, 128), (245, 10), (10, 245), (245, 245)]:
            assert _close(result.getpixel(point), GREEN), point  # type: ignore[arg-type]

    def test_a_tall_image_is_cropped_to_the_centered_square(self) -> None:
        source = _encode(_stripes((100, 300), [RED, GREEN, BLUE], vertical=False), "PNG")

        result = _open(process_avatar(source)).convert("RGB")

        for point in [(10, 10), (128, 128), (245, 245)]:
            assert _close(result.getpixel(point), GREEN), point  # type: ignore[arg-type]

    def test_a_tiny_image_is_scaled_up_to_the_standard_size(self) -> None:
        source = _encode(Image.new("RGB", (1, 1), RED), "PNG")

        result = _open(process_avatar(source))

        assert result.size == (256, 256)

    def test_the_exif_orientation_is_applied(self) -> None:
        # Wide picture, red left and blue right, flagged "rotate 90° clockwise to display":
        # shown upright it is tall, with red on top and blue at the bottom.
        exif = Image.Exif()
        exif[0x0112] = 6
        source = _encode(_stripes((200, 100), [RED, BLUE]), "JPEG", quality=95, exif=exif.tobytes())

        result = _open(process_avatar(source)).convert("RGB")

        assert _close(result.getpixel((128, 20)), RED)  # type: ignore[arg-type]
        assert _close(result.getpixel((128, 236)), BLUE)  # type: ignore[arg-type]

    def test_exif_and_every_other_metadata_are_dropped(self) -> None:
        exif = Image.Exif()
        exif[0x010F] = "SecretCameraMaker"
        exif[0x0110] = "SecretCameraModel"
        exif[0x9286] = "SecretUserComment"
        icc_profile = b"SecretIccProfile" * 20
        source = _encode(
            _stripes((120, 120), [RED, GREEN]),
            "JPEG",
            exif=exif.tobytes(),
            icc_profile=icc_profile,
        )
        assert b"SecretCameraMaker" in source  # the input does carry it

        output = process_avatar(source)

        result = _open(output)
        assert "exif" not in result.info
        assert "icc_profile" not in result.info
        assert result.getexif() == {}
        for marker in (
            b"SecretCameraMaker",
            b"SecretCameraModel",
            b"SecretUserComment",
            b"SecretIcc",
        ):
            assert marker not in output
        for chunk in (b"EXIF", b"ICCP", b"XMP "):
            assert chunk not in output

    def test_a_png_with_transparency_keeps_it(self) -> None:
        image = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        image.paste((220, 30, 30, 255), (100, 0, 200, 200))
        source = _encode(image, "PNG")

        result = _open(process_avatar(source))

        assert result.mode == "RGBA"
        assert result.getpixel((10, 128))[3] < 30  # type: ignore[index]
        assert result.getpixel((245, 128))[3] > 225  # type: ignore[index]

    def test_a_palette_png_with_a_transparent_color_is_accepted(self) -> None:
        image = Image.new("P", (80, 80), 0)
        image.putpalette([255, 0, 0, 0, 255, 0] + [0, 0, 0] * 254)
        image.paste(1, (40, 0, 80, 80))
        source = _encode(image, "PNG", transparency=0)

        result = _open(process_avatar(source))

        assert result.size == (256, 256)
        assert result.mode == "RGBA"
        assert result.getpixel((10, 128))[3] < 30  # type: ignore[index]

    def test_grayscale_and_cmyk_images_are_accepted(self) -> None:
        gray = _encode(Image.new("L", (50, 50), 128), "PNG")
        cmyk = _encode(Image.new("CMYK", (50, 50), (0, 255, 255, 0)), "JPEG")

        for source in (gray, cmyk):
            assert _open(process_avatar(source)).size == (256, 256)

    def test_the_stored_image_never_exceeds_the_output_limit_even_for_noise(self) -> None:
        generator = random.Random(7)
        noise = Image.frombytes("RGB", (800, 800), generator.randbytes(800 * 800 * 3))
        source = _encode(noise, "JPEG", quality=95)
        assert len(source) < MAX_INPUT_BYTES

        output = process_avatar(source)

        assert len(output) <= MAX_OUTPUT_BYTES

    def test_the_image_of_an_ordinary_picture_is_small(self) -> None:
        source = _encode(_stripes((400, 400), [RED, GREEN, BLUE]), "PNG")

        assert len(process_avatar(source)) < 20_000


class TestRejectedFiles:
    @pytest.mark.parametrize(
        "content",
        [
            b"hola, esto es un texto renombrado a .png",
            b"<!DOCTYPE html><html><body><script>alert(1)</script></body></html>",
            b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>',
            b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
            b"",
            b"\x00" * 1024,
            b"%PDF-1.7\n%\xe2\xe3\xcf\xd3",
            b"GIF89a" + b"\x00" * 64,
        ],
    )
    def test_anything_that_is_not_a_decodable_image_is_unsupported(self, content: bytes) -> None:
        with pytest.raises(AvatarUnsupportedError):
            process_avatar(content)

    def test_random_bytes_are_unsupported(self) -> None:
        with pytest.raises(AvatarUnsupportedError):
            process_avatar(random.Random(1).randbytes(5000))

    @pytest.mark.parametrize("image_format", ["GIF", "TIFF", "BMP", "ICO"])
    def test_real_images_of_formats_other_than_jpeg_png_and_webp_are_unsupported(
        self, image_format: str
    ) -> None:
        source = _encode(Image.new("RGB", (32, 32), RED), image_format)

        with pytest.raises(AvatarUnsupportedError):
            process_avatar(source)

    @pytest.mark.parametrize("image_format", ["PNG", "JPEG", "WEBP"])
    def test_a_truncated_file_is_unsupported(self, image_format: str) -> None:
        noise = Image.frombytes("RGB", (200, 200), random.Random(3).randbytes(200 * 200 * 3))
        source = _encode(noise, image_format)

        with pytest.raises(AvatarUnsupportedError):
            process_avatar(source[: len(source) // 2])

    def test_a_valid_header_followed_by_garbage_is_unsupported(self) -> None:
        source = _encode(Image.new("RGB", (64, 64), RED), "PNG")
        broken = source[:40] + b"\xff" * 200

        with pytest.raises(AvatarUnsupportedError):
            process_avatar(broken)

    def test_the_content_decides_not_the_declared_type(self) -> None:
        # A real PNG is accepted whatever it is called: there is no filename or type in the input.
        assert process_avatar(_encode(Image.new("RGB", (8, 8), RED), "PNG"))


class TestSizeLimits:
    def test_input_over_two_megabytes_is_too_large(self) -> None:
        with pytest.raises(AvatarTooLargeError):
            process_avatar(b"\x89PNG\r\n\x1a\n" + b"\x00" * MAX_INPUT_BYTES)

    def test_the_size_is_checked_before_looking_at_the_content(self) -> None:
        # Not even a decodable image: the answer is "too large", not "unsupported".
        with pytest.raises(AvatarTooLargeError):
            process_avatar(b"x" * (MAX_INPUT_BYTES + 1))

    def test_input_of_exactly_two_megabytes_is_not_rejected_for_its_size(self) -> None:
        with pytest.raises(AvatarUnsupportedError):
            process_avatar(b"x" * MAX_INPUT_BYTES)

    def test_the_limits_are_the_documented_ones(self) -> None:
        assert MAX_INPUT_BYTES == 2 * 1024 * 1024
        assert MAX_OUTPUT_BYTES == 200 * 1024
        # About a 12-megapixel photo: far more than any avatar needs (it ends at 256x256), and
        # small enough that decoding it is bounded in memory.
        assert MAX_PIXELS == 12_000_000

    def test_a_decompression_bomb_is_rejected_before_decoding(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bomb = _png_with_header_size(40_000, 40_000)
        assert len(bomb) < 200
        decoded = []

        def forbidden(self: ImageFile.ImageFile, *args: object, **kwargs: object) -> None:
            decoded.append(True)
            raise AssertionError("the image must not be decoded")

        monkeypatch.setattr(ImageFile.ImageFile, "load", forbidden)
        started = time.monotonic()

        with pytest.raises(AvatarUnsupportedError):
            process_avatar(bomb)

        assert decoded == []
        assert time.monotonic() - started < 2

    def test_an_image_just_over_the_pixel_limit_is_rejected(self) -> None:
        width = 5000
        height = MAX_PIXELS // width + 1
        source = _encode(Image.new("1", (width, height)), "PNG")
        assert len(source) < MAX_INPUT_BYTES

        with pytest.raises(AvatarUnsupportedError):
            process_avatar(source)

    def test_an_image_at_the_pixel_limit_is_accepted(self) -> None:
        width = 5000
        height = MAX_PIXELS // width
        source = _encode(Image.new("1", (width, height)), "PNG")

        assert _open(process_avatar(source)).size == (256, 256)
