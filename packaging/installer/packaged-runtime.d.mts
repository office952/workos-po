export function packagedNodePath(installDir: string): string;
export function listProcessesUsingExecutable(executablePath: string): number[];
export function stopPackagedRuntimeProcesses(installDir: string): Promise<number[]>;
export function retireDirectory(dir: string): Promise<void>;
