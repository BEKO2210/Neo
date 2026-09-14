export type AppId = 'chat' | 'agents' | 'nodes' | 'github' | 'terminal' | 'system';

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  id: AppId;
  title: string;
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  z: number;
  geometry: WindowGeometry;
}
