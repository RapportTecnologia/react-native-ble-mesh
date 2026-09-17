/**
 * Minimal ambient declaration for React Native modules used by the library.
 * The actual native APIs are provided by the host React Native app at runtime.
 */

declare module 'react-native' {
  export const NativeModules: Record<string, any>;
  export const Platform: {
    OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
    Version?: number;
    select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined;
  };
}
