declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

declare module '*.png' {
  const src: string;
  export default src;
}
