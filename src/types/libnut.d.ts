// `@nut-tree-fork/libnut/dist/import_libnut.js` is the internal platform-picker
// inside the libnut package. It re-exports the raw native binding, which the
// public class wrappers (KeyboardAction etc.) build on top of. We use it
// directly to avoid the Promise-wrapped wrappers and the `Key` enum dependency.
declare module "@nut-tree-fork/libnut/dist/import_libnut.js" {
  export const libnut: {
    typeString(input: string): void;
    keyTap(key: string, modifiers: string[]): void;
    setKeyboardDelay(ms: number): void;
  };
}
