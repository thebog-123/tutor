import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useGroup } from '../data';
import { appUrl } from '../router';
import { useToast } from '../ui';

/** The group's invite link, optionally pointing straight at a live game. */
export function inviteLink(code: string, gameId?: string) {
  return appUrl(`/join/${code}${gameId ? `/${gameId}` : ''}`);
}

function QR({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [text]);
  // White background so every phone camera can read it, even in dark mode.
  return <div className="qr" role="img" aria-label="QR code for the invite link" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Share / copy / QR for an invite link. */
export function InviteCard({ link, message, showQr = true }: { link: string; message: string; showQr?: boolean }) {
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(showQr);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Invite link copied');
    } catch {
      toast.show('Select the link and copy it', 'error');
    }
  };
  return (
    <div className="stack">
      {qrOpen && (
        <div className="stack-sm center" style={{ alignItems: 'center' }}>
          <QR text={link} />
          <span className="small muted">Friends at the table can scan this with their phone camera.</span>
        </div>
      )}
      <div className="code">{link}</div>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: 'Join on Felt', text: message, url: link });
                return;
              } catch {
                /* cancelled: fall back to copying */
              }
            }
            await copy();
          }}
        >
          Share link
        </button>
        <button className="btn" onClick={copy}>
          Copy
        </button>
      </div>
      {!showQr && (
        <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setQrOpen(!qrOpen)}>
          {qrOpen ? 'Hide QR code' : 'Show QR code'}
        </button>
      )}
    </div>
  );
}

/** Shown straight after creating a group, and from Home's "Invite friends". */
export function InviteScreen() {
  const g = useGroup();
  const link = inviteLink(g.group.invite_code);
  const fresh = g.members.length === 1;
  return (
    <div className="stack-lg narrow">
      <div className="stack-sm">
        <h1>{fresh ? 'Your group is ready' : 'Invite friends'}</h1>
        <p className="muted">
          Send this link to your friends, or let them scan the code. They make their own account, join <b>{g.group.name}</b>, and add or claim their player.
        </p>
      </div>
      <div className="card">
        <InviteCard link={link} message={`Join our poker group "${g.group.name}" on Felt`} />
      </div>
      <p className="small muted">
        {g.members.length} {g.members.length === 1 ? 'member' : 'members'} so far. You can find this link any time under <b>You → Group &amp; invites</b>.
      </p>
      <a className="btn block" href={`#/g/${g.group.id}`}>
        {fresh ? 'Done, go to the group' : 'Back to Home'}
      </a>
    </div>
  );
}
