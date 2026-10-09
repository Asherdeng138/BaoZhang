"""Verify ELF load segment alignment of packaged 64-bit native libraries."""
import struct
import sys
import zipfile
bad=[]
with zipfile.ZipFile(sys.argv[1]) as apk:
    for name in apk.namelist():
        if not name.startswith(('lib/arm64-v8a/','lib/x86_64/')) or not name.endswith('.so'):
            continue
        data=apk.read(name)
        if data[:4]!=b'\x7fELF' or data[4]!=2 or data[5]!=1:
            bad.append(name+': unsupported ELF format')
            continue
        phoff=struct.unpack_from('<Q',data,32)[0]
        size,count=struct.unpack_from('<HH',data,54)
        for i in range(count):
            offset=phoff+i*size
            if struct.unpack_from('<I',data,offset)[0]==1:
                alignment=struct.unpack_from('<Q',data,offset+48)[0]
                if alignment<16384:
                    bad.append(name+': LOAD alignment '+str(alignment))
                    break
if bad:
    raise SystemExit('Native libraries not ready for 16 KB pages:\n'+'\n'.join(bad))
print('All packaged 64-bit ELF LOAD segments support 16 KB alignment.')
