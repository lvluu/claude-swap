export interface Profile {
  id: string;
  name: string;
  token_encrypted: string;
  base_url?: string;
  auth_method: "oauth" | "manual" | "env";
  created_at: number;
  last_used: number;
  use_count: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface Session {
  id: string;
  profile_id: string | null;
  terminal: string;
  started_at: number;
  last_activity: number;
  metadata: {
    shell: string;
    cwd: string;
    parent_pid: number;
  };
}

export interface Quota {
  profile_id: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  current_daily: number;
  current_monthly: number;
  last_reset_daily: number;
  last_reset_monthly: number;
}

export interface UsageLog {
  id: number;
  profile_id: string;
  session_id: string;
  timestamp: number;
  tokens_used: number;
  model: string;
}

export interface Settings {
  key: string;
  value: unknown;
}

export interface ExportData {
  version: string;
  exported_at: string;
  profiles: ExportedProfile[];
  settings: Record<string, unknown>;
}

export interface ExportedProfile {
  id: string;
  name: string;
  token: string;
  base_url: string | null;
  auth_method: string;
  metadata: Record<string, unknown>;
}

export type SwitchMode = "shell" | "persistent" | "local";

export type AddMode = "oauth" | "manual" | "env";

export type RotationStrategy =
  | "round-robin"
  | "random"
  | "quota-based"
  | "least-used"
  | "cost-optimized";

export interface ProfileGroup {
  name: string;
  profiles: string[];
}

export interface WorkspaceConfig {
  profile: string;
  env: Record<string, string>;
}
