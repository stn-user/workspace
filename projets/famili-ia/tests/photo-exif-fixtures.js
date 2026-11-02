function ascii(value) {
  return Buffer.from(`${value}\0`, "ascii");
}

function short(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function long(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function rational(values) {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach(([numerator, denominator], index) => {
    bytes.writeUInt32LE(numerator, index * 8);
    bytes.writeUInt32LE(denominator, index * 8 + 4);
  });
  return bytes;
}

function directoryLength(entries) {
  return 2 + entries.length * 12 + 4;
}

function writeDirectory(tiff, entries, offset, dataOffset) {
  tiff.writeUInt16LE(entries.length, offset);
  let entryOffset = offset + 2;
  for (const entry of entries) {
    tiff.writeUInt16LE(entry.tag, entryOffset);
    tiff.writeUInt16LE(entry.type, entryOffset + 2);
    tiff.writeUInt32LE(entry.count, entryOffset + 4);
    if (entry.value.length <= 4) {
      entry.value.copy(tiff, entryOffset + 8);
    } else {
      tiff.writeUInt32LE(dataOffset, entryOffset + 8);
      entry.value.copy(tiff, dataOffset);
      dataOffset += entry.value.length;
    }
    entryOffset += 12;
  }
  tiff.writeUInt32LE(0, entryOffset);
  return dataOffset;
}

function entry(tag, type, count, value) {
  return { tag, type, count, value };
}

export function createJpegExifFixture(baseJpeg, {
  dateTimeOriginal,
  offsetTimeOriginal,
  orientation = 6,
  latitude = null,
  longitude = null,
  altitude = null
} = {}) {
  const exifEntries = [];
  if (dateTimeOriginal !== undefined) {
    exifEntries.push(entry(0x9003, 2, Buffer.byteLength(dateTimeOriginal, "ascii") + 1, ascii(dateTimeOriginal)));
  }
  if (offsetTimeOriginal !== undefined) {
    exifEntries.push(entry(0x9011, 2, Buffer.byteLength(offsetTimeOriginal, "ascii") + 1, ascii(offsetTimeOriginal)));
  }
  exifEntries.sort((first, second) => first.tag - second.tag);

  const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
  const gpsEntries = hasGps
    ? [
      entry(0x0001, 2, 2, ascii(latitude < 0 ? "S" : "N")),
      entry(0x0002, 5, 3, rational([
        [Math.floor(Math.abs(latitude)), 1],
        [Math.floor((Math.abs(latitude) % 1) * 60), 1],
        [Math.round((((Math.abs(latitude) % 1) * 60) % 1) * 6000), 100]
      ])),
      entry(0x0003, 2, 2, ascii(longitude < 0 ? "W" : "E")),
      entry(0x0004, 5, 3, rational([
        [Math.floor(Math.abs(longitude)), 1],
        [Math.floor((Math.abs(longitude) % 1) * 60), 1],
        [Math.round((((Math.abs(longitude) % 1) * 60) % 1) * 6000), 100]
      ]))
    ]
    : [];
  if (hasGps && Number.isFinite(altitude)) {
    gpsEntries.push(entry(0x0005, 1, 1, Buffer.from([altitude < 0 ? 1 : 0])));
    gpsEntries.push(entry(0x0006, 5, 1, rational([[Math.round(Math.abs(altitude) * 100), 100]])));
  }
  gpsEntries.sort((first, second) => first.tag - second.tag);

  const ifd0Entries = [
    entry(0x0100, 4, 1, long(3024)),
    entry(0x0101, 4, 1, long(4032)),
    entry(0x0112, 3, 1, short(orientation))
  ];
  if (exifEntries.length > 0) {
    ifd0Entries.push(entry(0x8769, 4, 1, Buffer.alloc(4)));
  }
  if (gpsEntries.length > 0) {
    ifd0Entries.push(entry(0x8825, 4, 1, Buffer.alloc(4)));
  }
  ifd0Entries.sort((first, second) => first.tag - second.tag);

  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + directoryLength(ifd0Entries);
  const gpsOffset = exifOffset + directoryLength(exifEntries);
  const exifPointer = ifd0Entries.find(item => item.tag === 0x8769);
  const gpsPointer = ifd0Entries.find(item => item.tag === 0x8825);
  if (exifPointer) exifPointer.value = long(exifOffset);
  if (gpsPointer) gpsPointer.value = long(gpsOffset);

  let dataOffset = exifEntries.length > 0
    ? exifOffset + directoryLength(exifEntries)
    : ifd0Offset + directoryLength(ifd0Entries);
  if (gpsEntries.length > 0) dataOffset = gpsOffset + directoryLength(gpsEntries);
  const externalValues = [...ifd0Entries, ...exifEntries, ...gpsEntries]
    .reduce((total, item) => total + (item.value.length > 4 ? item.value.length : 0), 0);
  const tiff = Buffer.alloc(dataOffset + externalValues);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Offset, 4);

  let nextDataOffset = writeDirectory(tiff, ifd0Entries, ifd0Offset, dataOffset);
  if (exifEntries.length > 0) {
    nextDataOffset = writeDirectory(tiff, exifEntries, exifOffset, nextDataOffset);
  }
  if (gpsEntries.length > 0) {
    writeDirectory(tiff, gpsEntries, gpsOffset, nextDataOffset);
  }

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const segment = Buffer.alloc(payload.length + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return Buffer.concat([baseJpeg.subarray(0, 2), segment, baseJpeg.subarray(2)]);
}
