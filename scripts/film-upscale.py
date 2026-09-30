"""AI-upscale a Gemini clip to 4K with Real-ESRGAN (compact general x4v3), on the
Mac GPU, before scripts/film-clips.py encodes it.

    ~/.cache/film-upscale/bin/python scripts/film-upscale.py <in.mp4> <out.mp4> [--time-one]

The architectures are defined here (the upstream basicsr package does not
build on this Python). It loads the official realesr-general-x4v3.pth from
~/.cache/film-upscale/weights. Output is 3840 by 2160 at the source frame rate,
near-lossless H.264, for the encoder to finish and compress.
"""

import argparse
import os
import subprocess
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

WEIGHTS = os.path.expanduser("~/.cache/film-upscale/weights/realesr-general-x4v3.pth")


class SRVGGNetCompact(nn.Module):
    """Real-ESRGAN's compact video model (realesr-general-x4v3): 32 convolutions,
    PReLU, pixel shuffle; about 15x faster than RRDBNet."""

    def __init__(self, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        body = [nn.Conv2d(3, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        for _ in range(num_conv):
            body += [nn.Conv2d(num_feat, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        body.append(nn.Conv2d(num_feat, 3 * upscale * upscale, 3, 1, 1))
        self.body = nn.ModuleList(body)
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        return self.upsampler(out) + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nb=23, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def load():
    net = SRVGGNetCompact()
    state = torch.load(WEIGHTS, map_location="cpu")
    net.load_state_dict(state.get("params_ema", state.get("params", state)), strict=True)
    dev = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    return net.eval().to(dev).half() if dev.type == "mps" else net.eval(), dev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--time-one", action="store_true")
    ap.add_argument("--hd", action="store_true", help="540p in, Gemini mark cropped, 1080p out (the size the site ships)")
    a = ap.parse_args()
    w, h = (960, 540) if a.hd else (1280, 720)
    ow, oh = (1920, 1080) if a.hd else (3840, 2160)
    net, dev = load()
    reader = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", a.src, "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    writer = None
    if not a.time_one:
        writer = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{ow}x{oh}", "-r", "24", "-i", "-",
             "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", a.dst], stdin=subprocess.PIPE)
    n, t0 = 0, time.time()
    with torch.no_grad():
        while True:
            buf = reader.stdout.read(w * h * 3)
            if len(buf) < w * h * 3:
                break
            x = torch.from_numpy(np.frombuffer(buf, np.uint8).reshape(h, w, 3).copy()).permute(2, 0, 1)[None].to(dev)
            x = x.half() / 255 if dev.type == "mps" else x.float() / 255
            y = net(x)
            if a.hd:
                y = y[:, :, round(y.shape[2] * 0.03):round(y.shape[2] * 0.95), round(y.shape[3] * 0.04):round(y.shape[3] * 0.96)]
            y = F.interpolate(y.float(), size=(oh, ow), mode="bicubic", align_corners=False)
            out = (y.clamp(0, 1)[0].permute(1, 2, 0) * 255).round().byte().cpu().numpy()
            n += 1
            if a.time_one and n == 3:
                print(f"3 frames: {time.time() - t0:.1f} s")
                reader.kill()
                return
            if a.time_one:
                continue
            writer.stdin.write(out.tobytes())
            if n % 24 == 0:
                print(f"{n} frames, {(time.time() - t0) / n:.2f} s each", flush=True)
    writer.stdin.close()
    writer.wait()
    print(f"done: {n} frames in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
