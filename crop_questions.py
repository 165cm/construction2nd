import ctypes
import os
from ctypes import c_void_p, c_char_p, c_long, c_bool, c_size_t, c_double, Structure, c_int32

cg = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
cf = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
imageio = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/ImageIO.framework/ImageIO')

class CGPoint(Structure):
    _fields_ = [("x", c_double), ("y", c_double)]

class CGSize(Structure):
    _fields_ = [("width", c_double), ("height", c_double)]

class CGRect(Structure):
    _fields_ = [("origin", CGPoint), ("size", CGSize)]

cf.CFURLCreateFromFileSystemRepresentation.restype = c_void_p
cf.CFURLCreateFromFileSystemRepresentation.argtypes = [c_void_p, c_char_p, c_long, c_bool]
cf.CFStringCreateWithCString.restype = c_void_p
cf.CFStringCreateWithCString.argtypes = [c_void_p, c_char_p, c_int32]
cf.CFRelease.restype = None
cf.CFRelease.argtypes = [c_void_p]

imageio.CGImageSourceCreateWithURL.restype = c_void_p
imageio.CGImageSourceCreateWithURL.argtypes = [c_void_p, c_void_p]
imageio.CGImageSourceCreateImageAtIndex.restype = c_void_p
imageio.CGImageSourceCreateImageAtIndex.argtypes = [c_void_p, c_size_t, c_void_p]

cg.CGImageCreateWithImageInRect.restype = c_void_p
cg.CGImageCreateWithImageInRect.argtypes = [c_void_p, CGRect]

imageio.CGImageDestinationCreateWithURL.restype = c_void_p
imageio.CGImageDestinationCreateWithURL.argtypes = [c_void_p, c_void_p, c_size_t, c_void_p]
imageio.CGImageDestinationAddImage.restype = None
imageio.CGImageDestinationAddImage.argtypes = [c_void_p, c_void_p, c_void_p]
imageio.CGImageDestinationFinalize.restype = c_bool
imageio.CGImageDestinationFinalize.argtypes = [c_void_p]

kUTTypePNG = cf.CFStringCreateWithCString(None, b"public.png", 0x08000100)

os.makedirs('public/crops', exist_ok=True)

def crop(page_num, out_name, x, y, w, h):
    src_path = f"public/pages/page_{page_num}.png"
    dst_path = f"public/crops/{out_name}.png"
    src_url = cf.CFURLCreateFromFileSystemRepresentation(None, src_path.encode('utf-8'), len(src_path), False)
    src = imageio.CGImageSourceCreateWithURL(src_url, None)
    if not src:
        print(f"Error reading {src_path}")
        return
    img = imageio.CGImageSourceCreateImageAtIndex(src, 0, None)
    crop_rect = CGRect(CGPoint(x, y), CGSize(w, h))
    cropped = cg.CGImageCreateWithImageInRect(img, crop_rect)
    
    dst_url = cf.CFURLCreateFromFileSystemRepresentation(None, dst_path.encode('utf-8'), len(dst_path), False)
    dest = imageio.CGImageDestinationCreateWithURL(dst_url, kUTTypePNG, 1, None)
    imageio.CGImageDestinationAddImage(dest, cropped, None)
    imageio.CGImageDestinationFinalize(dest)
    cf.CFRelease(src_url)
    cf.CFRelease(dst_url)
    cf.CFRelease(src)
    cf.CFRelease(img)
    print(f"Cropped {out_name}")

# Let's crop question diagrams
# Page 5
crop(5, "q1_diagram", 200, 390, 480, 260)
crop(5, "q4_diagram", 200, 1260, 480, 280)
crop(5, "q5_diagram", 180, 1680, 500, 350)

# Page 6
crop(6, "q6_diagram", 200, 380, 480, 270)
crop(6, "q7_diagram", 200, 950, 480, 300)
crop(6, "q9_diagram", 200, 1720, 480, 300)

# Page 7
crop(7, "q10_choices", 680, 230, 800, 340)

# Page 8
crop(8, "q16_photo", 200, 180, 480, 400)
crop(8, "q17_photo", 200, 640, 480, 360)
crop(8, "q18_photo", 200, 1040, 480, 350)

# Page 10
crop(10, "q27_choices", 680, 600, 800, 250)

# Page 11
crop(11, "q35_choices", 680, 1220, 800, 160)
crop(11, "q37_choices", 680, 1500, 800, 160)

# Page 12
crop(12, "q41_choices", 460, 160, 1020, 360)
crop(12, "q42_choices", 460, 540, 1020, 330)
crop(12, "q43_choices", 460, 890, 1020, 450)
crop(12, "q44_choices", 460, 1370, 1020, 310)
crop(12, "q45_choices", 460, 1700, 1020, 360)

# Page 13
crop(13, "q46_choices", 460, 160, 1020, 370)
crop(13, "q47_choices", 460, 540, 1020, 470)
crop(13, "q48_choices", 460, 1020, 1020, 240)
crop(13, "q49_choices", 460, 1270, 1020, 350)
crop(13, "q50_choices", 460, 1630, 1020, 390)

print("All crops completed!")
