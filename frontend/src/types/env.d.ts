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

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
