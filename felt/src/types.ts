export type Role = 'admin' | 'member';
export type GameStatus = 'live' | 'draft' | 'final' | 'void';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'void';

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  is_sample: boolean;
  created_by: string | null;
  last_backup_at: string | null;
  last_backup_by: string | null;
  created_at: string;
}

export interface Member {
  group_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Player {
  id: string;
  group_id: string;
  name: string;
  active: boolean;
  is_guest: boolean;
  claimed_by: string | null;
  created_at: string;
}

export interface Entry {
  game_id: string;
  group_id: string;
  player_id: string;
  buy_in_pence: number;
  rebuys_pence: number[];
  cash_out_pence: number | null; // null while still playing in a live game
  joined_at?: string;
  cashed_out_at?: string | null;
}

export interface Game {
  id: string;
  group_id: string;
  name: string;
  played_on: string;
  notes: string;
  status: GameStatus;
  version: number;
  standard_buy_in_pence: number | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  finalised_by: string | null;
  finalised_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  entries: Entry[];
}

export interface Payment {
  id: string;
  group_id: string;
  from_player: string;
  to_player: string;
  amount_pence: number;
  note: string;
  status: PaymentStatus;
  recorded_by: string | null;
  recorded_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  payer_confirmed_by: string | null;
  payer_confirmed_at: string | null;
  payee_confirmed_by: string | null;
  payee_confirmed_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  close_reason: string | null;
}

export interface BalanceRow {
  player_id: string;
  profit_pence: number;
  paid_pence: number;
  received_pence: number;
  balance_pence: number;
}

export interface AuditRow {
  id: number;
  group_id: string;
  actor: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
