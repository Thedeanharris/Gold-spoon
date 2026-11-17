declare module "@studio/sitegen" {
  export const gen: (draft: any) => string;
  export const seed: (niche: string, name?: string) => any;
  export const fix: (draft: any) => any;
  export const defSec: (type: string) => any[];
}
declare module "@studio/publisher" {
  export function publishSite(site: any, ctx: any, io: any): Promise<{ version: number; hosts: string[]; bytes: number }>;
  export function setSiteStatus(site: any, ctx: any, status: "active" | "paused", io: any): Promise<{ hosts: string[]; changed: number }>;
}
