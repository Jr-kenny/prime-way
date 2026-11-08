// Config plugin: build one small APK per CPU type instead of one big
// APK holding every CPU type's native code.
//
// The first Prime Way APK was about 124 MB because it shipped native
// libraries for all four Android CPU types (arm64, 32-bit ARM, and
// two Intel types no real phone uses). Splitting gives each phone
// only its own CPU's code, roughly a quarter of the size. Most
// modern phones use arm64-v8a; older or cheaper ones use
// armeabi-v7a. No universal APK is built.

const { withAppBuildGradle } = require('@expo/config-plugins');

const SPLITS_BLOCK = `
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a"
            universalApk false
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('splits {')) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      'android {',
      `android {${SPLITS_BLOCK}`
    );
    return config;
  });
};
