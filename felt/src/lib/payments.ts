// Who can do what with a pending payment. Mirrors the database rules in
// confirm_payment / cancel_payment; the server is the one that enforces them.

export interface PaymentLike {
  from_player: string;
  to_player: string;
  status: string;
  recorded_by: string | null;
  payer_confirmed_at: string | null;
  payee_confirmed_at: string | null;
}

export interface Viewer {
  userId: string;
  isAdmin: boolean;
  claimedBy: (playerId: string) => string | null;
}

export function confirmableSides(p: PaymentLike, v: Viewer): { payer: boolean; payee: boolean } {
  if (p.status !== 'pending') return { payer: false, payee: false };
  const can = (playerId: string) => {
    const owner = v.claimedBy(playerId);
    return owner === v.userId || (owner === null && v.isAdmin);
  };
  return {
    payer: !p.payer_confirmed_at && can(p.from_player),
    payee: !p.payee_confirmed_at && can(p.to_player),
  };
}

export function needsMe(p: PaymentLike, v: Viewer): boolean {
  const s = confirmableSides(p, v);
  return s.payer || s.payee;
}

export function canReject(p: PaymentLike, v: Viewer): boolean {
  if (p.status !== 'pending') return false;
  return (
    v.isAdmin ||
    p.recorded_by === v.userId ||
    v.claimedBy(p.from_player) === v.userId ||
    v.claimedBy(p.to_player) === v.userId
  );
}
