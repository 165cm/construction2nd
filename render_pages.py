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

cg.CGPDFDocumentCreateWithURL.restype = c_void_p
cg.CGPDFDocumentCreateWithURL.argtypes = [c_void_p]
cg.CGPDFDocumentGetNumberOfPages.restype = c_size_t
cg.CGPDFDocumentGetNumberOfPages.argtypes = [c_void_p]
cg.CGPDFDocumentGetPage.restype = c_void_p
cg.CGPDFDocumentGetPage.argtypes = [c_void_p, c_size_t]
cg.CGPDFPageGetBoxRect.restype = CGRect
cg.CGPDFPageGetBoxRect.argtypes = [c_void_p, c_int32]

cg.CGColorSpaceCreateDeviceRGB.restype = c_void_p
cg.CGBitmapContextCreate.restype = c_void_p
cg.CGBitmapContextCreate.argtypes = [c_void_p, c_size_t, c_size_t, c_size_t, c_size_t, c_void_p, c_int32]
cg.CGContextSetRGBFillColor.restype = None
cg.CGContextSetRGBFillColor.argtypes = [c_void_p, c_double, c_double, c_double, c_double]
cg.CGContextFillRect.restype = None
cg.CGContextFillRect.argtypes = [c_void_p, CGRect]
cg.CGContextScaleCTM.restype = None
cg.CGContextScaleCTM.argtypes = [c_void_p, c_double, c_double]
cg.CGContextDrawPDFPage.restype = None
cg.CGContextDrawPDFPage.argtypes = [c_void_p, c_void_p]
cg.CGBitmapContextCreateImage.restype = c_void_p
cg.CGBitmapContextCreateImage.argtypes = [c_void_p]
cg.CGContextRelease.restype = None
cg.CGContextRelease.argtypes = [c_void_p]

imageio.CGImageDestinationCreateWithURL.restype = c_void_p
imageio.CGImageDestinationCreateWithURL.argtypes = [c_void_p, c_void_p, c_size_t, c_void_p]
imageio.CGImageDestinationAddImage.restype = None
imageio.CGImageDestinationAddImage.argtypes = [c_void_p, c_void_p, c_void_p]
imageio.CGImageDestinationFinalize.restype = c_bool
imageio.CGImageDestinationFinalize.argtypes = [c_void_p]

os.makedirs('public/pages', exist_ok=True)

pdf_path = b"/Users/karas/.gemini/antigravity/brain/3fc8999b-9d87-4474-929f-a21c98f8d877/.user_uploaded/media_1791810338297_6ca7be15.pdf"
url = cf.CFURLCreateFromFileSystemRepresentation(None, pdf_path, len(pdf_path), False)
doc = cg.CGPDFDocumentCreateWithURL(url)
pages_count = cg.CGPDFDocumentGetNumberOfPages(doc)
print(f"Total pages: {pages_count}")

scale = 2.0
cs = cg.CGColorSpaceCreateDeviceRGB()
kUTTypePNG = cf.CFStringCreateWithCString(None, b"public.png", 0x08000100)

for p in range(1, pages_count + 1):
    page = cg.CGPDFDocumentGetPage(doc, p)
    rect = cg.CGPDFPageGetBoxRect(page, 0)
    w = int(rect.size.width * scale)
    h = int(rect.size.height * scale)
    if w <= 0 or h <= 0:
        continue
    ctx = cg.CGBitmapContextCreate(None, w, h, 8, w * 4, cs, 1)
    cg.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0)
    cg.CGContextFillRect(ctx, CGRect(CGPoint(0, 0), CGSize(w, h)))
    cg.CGContextScaleCTM(ctx, scale, scale)
    cg.CGContextDrawPDFPage(ctx, page)
    img = cg.CGBitmapContextCreateImage(ctx)
    cg.CGContextRelease(ctx)

    out_file = f"public/pages/page_{p}.png"
    out_path = out_file.encode('utf-8')
    out_url = cf.CFURLCreateFromFileSystemRepresentation(None, out_path, len(out_path), False)
    dest = imageio.CGImageDestinationCreateWithURL(out_url, kUTTypePNG, 1, None)
    imageio.CGImageDestinationAddImage(dest, img, None)
    imageio.CGImageDestinationFinalize(dest)
    cf.CFRelease(out_url)
    print(f"Rendered {out_file} ({w}x{h})")

print("Done rendering all pages!")
