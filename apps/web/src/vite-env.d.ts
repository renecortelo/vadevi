/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The library's size, counted from data/kb at build (library-figures.ts). */
declare module "virtual:library-figures" {
  const figures: {
    aromas: number;
    countries: number;
    grapes: number;
    languages: number;
    names: number;
  };
  export default figures;
}
