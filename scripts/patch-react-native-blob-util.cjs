const fs = require('fs');
const path = require('path');

const root = process.cwd();

function patchFile(relativePath, transform) {
  const filePath = path.join(root, relativePath);

  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-react-native-blob-util] Skipping missing file: ${relativePath}`);
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = transform(original);

  if (updated === original) {
    console.log(`[patch-react-native-blob-util] No changes needed: ${relativePath}`);
    return;
  }

  fs.writeFileSync(filePath, updated);
  console.log(`[patch-react-native-blob-util] Patched: ${relativePath}`);
}

patchFile('node_modules/react-native-blob-util/codegenSpecs/NativeBlobUtils.js', (source) => {
  let next = source.replace(
    /import\s+\{\s*TurboModuleRegistry\s*\}\s+from\s+'react-native';/,
    "import { NativeModules, TurboModuleRegistry } from 'react-native';"
  );

  next = next.replace(
    /export default \((TurboModuleRegistry\.get<Spec>\('ReactNativeBlobUtil'\)): \?Spec\);/,
    "export default (($1 ?? NativeModules.ReactNativeBlobUtil): ?Spec);"
  );

  return next;
});

patchFile('node_modules/react-native-blob-util/fetch.js', (source) => {
  let next = source.replace(
    /import\s+\{NativeEventEmitter\}\s+from\s+'react-native';/,
    "import {NativeEventEmitter, NativeModules} from 'react-native';"
  );

  next = next.replace(
    /const eventEmitter = new NativeEventEmitter\(ReactNativeBlobUtil\);/,
    "const nativeModule = ReactNativeBlobUtil ?? NativeModules.ReactNativeBlobUtil;\nconst eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;"
  );

  next = next.replaceAll('eventEmitter.addListener(', 'eventEmitter?.addListener(');

  return next;
});

patchFile('node_modules/react-native-blob-util/class/ReactNativeBlobUtilReadStream.js', (source) => {
  let next = source.replace(
    /import\s+\{NativeEventEmitter\}\s+from\s+'react-native';/,
    "import {NativeEventEmitter, NativeModules} from 'react-native';"
  );

  next = next.replace(
    /const emitter = new NativeEventEmitter\(ReactNativeBlobUtil\);/,
    "const nativeModule = ReactNativeBlobUtil ?? NativeModules.ReactNativeBlobUtil;\nconst emitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;"
  );

  next = next.replaceAll('emitter.addListener(', 'emitter?.addListener(');

  return next;
});

patchFile('node_modules/react-native-blob-util/fs.js', (source) => {
  let next = source.replace(
    "const constants = ReactNativeBlobUtil.getConstants();",
    "const constants = ReactNativeBlobUtil?.getConstants?.() ?? {};"
  );

  next = next.replace("DocumentDir: constants.DocumentDir,", "DocumentDir: constants.DocumentDir || '',");
  next = next.replace("CacheDir: constants.CacheDir,", "CacheDir: constants.CacheDir || '',");
  next = next.replace("PictureDir: constants.PictureDir,", "PictureDir: constants.PictureDir || '',");
  next = next.replace("MusicDir: constants.MusicDir,", "MusicDir: constants.MusicDir || '',");
  next = next.replace("MovieDir: constants.MovieDir,", "MovieDir: constants.MovieDir || '',");
  next = next.replace("DownloadDir: constants.DownloadDir,", "DownloadDir: constants.DownloadDir || '',");
  next = next.replace("DCIMDir: constants.DCIMDir,", "DCIMDir: constants.DCIMDir || '',");
  next = next.replace("SDCardDir: constants.SDCardDir, // Depracated", "SDCardDir: constants.SDCardDir || '', // Depracated");
  next = next.replace("SDCardApplicationDir: constants.SDCardApplicationDir, // Deprecated", "SDCardApplicationDir: constants.SDCardApplicationDir || '', // Deprecated");
  next = next.replace("MainBundleDir: constants.MainBundleDir,", "MainBundleDir: constants.MainBundleDir || '',");
  next = next.replace("LibraryDir: constants.LibraryDir,", "LibraryDir: constants.LibraryDir || '',");
  next = next.replace("ApplicationSupportDir: constants.ApplicationSupportDir,", "ApplicationSupportDir: constants.ApplicationSupportDir || '',");
  next = next.replace("LegacyPictureDir: constants.LegacyPictureDir,", "LegacyPictureDir: constants.LegacyPictureDir || '',");
  next = next.replace("LegacyMusicDir: constants.LegacyMusicDir,", "LegacyMusicDir: constants.LegacyMusicDir || '',");
  next = next.replace("LegacyMovieDir: constants.LegacyMovieDir,", "LegacyMovieDir: constants.LegacyMovieDir || '',");
  next = next.replace("LegacyDownloadDir: constants.LegacyDownloadDir,", "LegacyDownloadDir: constants.LegacyDownloadDir || '',");
  next = next.replace("LegacyDCIMDir: constants.LegacyDCIMDir,", "LegacyDCIMDir: constants.LegacyDCIMDir || '',");
  next = next.replace("LegacySDCardDir: constants.LegacySDCardDir, // Depracated", "LegacySDCardDir: constants.LegacySDCardDir || '', // Depracated");

  return next;
});
