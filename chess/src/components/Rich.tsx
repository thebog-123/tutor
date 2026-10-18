/** Minimal formatting for lesson text: paragraphs, line breaks, **bold** and *italic*. */
export default function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {inline(line)}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('*') && part.length > 2) return <i key={i}>{part.slice(1, -1)}</i>;
    return part;
  });
}
