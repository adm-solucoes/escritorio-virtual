declare module "opus-recorder" {
  interface RecorderOptions {
    encoderPath?: string;
    numberOfChannels?: number;
    encoderSampleRate?: number;
    encoderBitRate?: number;
    streamPages?: boolean;
    [key: string]: unknown;
  }

  export default class Recorder {
    constructor(options?: RecorderOptions);
    ondataavailable: (typedArray: Uint8Array) => void;
    onstart?: () => void;
    onstop?: () => void;
    onpause?: () => void;
    onresume?: () => void;
    start(stream?: MediaStream): Promise<void>;
    stop(): void;
    pause(): void;
    resume(): void;
    close(): void;
  }
}
