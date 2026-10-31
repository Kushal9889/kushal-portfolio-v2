import styles from "./FilmTransit.module.css";

/**
 * One small drawing per transit card: the card's line as a picture, so a
 * recruiter, an interviewer, a hiring manager and a referrer read the same idea
 * without the vocabulary. Grey shapes, one blue for the part the line is about,
 * two or three words of label. Drawn, not measured: no axis claims a number.
 */
const W = 540;
const H = 92;

function Box({ x, y, w, h, on, dashed }: { x: number; y: number; w: number; h: number; on?: boolean; dashed?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={Math.min(6, h / 4)} data-on={on || undefined} data-dashed={dashed || undefined} />;
}

function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <path d={`M${x1} ${y}H${x2 - 6}M${x2 - 11} ${y - 5}L${x2 - 5} ${y}L${x2 - 11} ${y + 5}`} data-line />;
}

function Text({ x, y, children, anchor = "middle", on }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end"; on?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} data-on={on || undefined}>
      {children}
    </text>
  );
}

const SKETCHES: Record<string, { says: string; draw: () => React.ReactNode }> = {
  T1: {
    says: "Requests wait in a line before one is worked on; the wait, not the work, is most of the delay.",
    draw: () => (
      <>
        {[0, 1, 2, 3, 4, 5].map((i) => <Box key={i} x={14 + i * 34} y={30} w={24} h={24} />)}
        <Text x={113} y={78}>waiting</Text>
        <Arrow x1={222} x2={270} y={42} />
        <Box x={276} y={16} w={120} h={52} />
        <Box x={324} y={30} w={24} h={24} on />
        <Text x={336} y={86} on>working</Text>
        <Arrow x1={404} x2={452} y={42} />
        <Box x={458} y={26} w={64} h={32} />
        <Text x={490} y={46}>answer</Text>
      </>
    ),
  },
  T2: {
    says: "Search picks two notes out of many and the answer is written from those; a missed note cannot be quoted.",
    draw: () => (
      <>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Box key={i} x={14 + (i % 4) * 40} y={8 + Math.floor(i / 4) * 40} w={30} h={32} on={i === 1 || i === 6} dashed={i === 4} />
        ))}
        <Text x={29} y={90}>missed</Text>
        <Text x={109} y={90} on>found</Text>
        <Arrow x1={186} x2={250} y={44} />
        <Box x={256} y={14} w={150} h={60} />
        <path d="M272 34H388M272 46H372M272 58H348" data-line data-on />
        <Text x={331} y={88}>answer from found notes</Text>
      </>
    ),
  },
  T3: {
    says: "Three ways to answer: a stored answer, search alone, or the GPU, which costs the most.",
    draw: () => (
      <>
        <circle cx={22} cy={46} r={7} data-on />
        <Text x={22} y={74}>question</Text>
        <path d="M30 46C90 46 90 14 150 14H300M30 46H300M30 46C90 46 90 78 150 78H300" data-line />
        <Box x={306} y={4} w={128} h={22} on />
        <Text x={370} y={19} on>stored answer</Text>
        <Box x={306} y={35} w={128} h={22} />
        <Text x={370} y={50}>search only</Text>
        <Box x={306} y={66} w={210} h={22} />
        <Text x={411} y={81}>GPU: the costly path</Text>
        <Text x={526} y={19} anchor="end">cheapest</Text>
      </>
    ),
  },
  T4: {
    says: "The same long prompt is sent and paid for with every question; trimming it saves on every one.",
    draw: () => (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Text x={14} y={20 + i * 26} anchor="start">{`ask ${i + 1}`}</Text>
            <Box x={56} y={9 + i * 26} w={330} h={14} />
            <Box x={390} y={9 + i * 26} w={60} h={14} on />
          </g>
        ))}
        <path d="M250 2V82" data-line data-dashed />
        <Text x={256} y={91} anchor="start">trim here</Text>
        <Text x={420} y={91} on>question</Text>
        <Text x={140} y={91}>same prompt, paid each time</Text>
      </>
    ),
  },
  T5: {
    says: "Words arrive one at a time, so a long answer keeps people waiting longer than a short one.",
    draw: () => (
      <>
        <Text x={14} y={22} anchor="start">short</Text>
        {[0, 1, 2, 3].map((i) => <Box key={i} x={66 + i * 26} y={10} w={20} h={16} />)}
        <Box x={170} y={10} w={20} h={16} on />
        <Text x={198} y={22} anchor="start" on>done</Text>
        <Text x={14} y={56} anchor="start">long</Text>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => <Box key={i} x={66 + i * 26} y={44} w={20} h={16} />)}
        <Box x={430} y={44} w={20} h={16} on />
        <Text x={458} y={56} anchor="start" on>done</Text>
        <Arrow x1={66} x2={526} y={80} />
        <Text x={526} y={74} anchor="end">time</Text>
      </>
    ),
  },
  T6: {
    says: "Memory is cut into same-size blocks; one chat's notes fill blocks wherever they are free.",
    draw: () => (
      <>
        {Array.from({ length: 36 }, (_, i) => {
          const col = i % 12;
          const row = Math.floor(i / 12);
          const mine = [1, 2, 7, 14, 15, 26].includes(i);
          const other = [0, 4, 5, 9, 12, 13, 18, 20, 21, 24, 30, 31].includes(i);
          return <Box key={i} x={14 + col * 30} y={6 + row * 24} w={24} h={18} on={mine} dashed={!mine && !other} />;
        })}
        <Text x={390} y={22} anchor="start" on>one chat</Text>
        <Text x={390} y={46} anchor="start">other chats</Text>
        <Text x={390} y={70} anchor="start">free blocks</Text>
        <Text x={190} y={90}>same-size blocks</Text>
      </>
    ),
  },
  T7: {
    says: "Eight chips each hold part of the model and pass their results round a ring; the links carry the work.",
    draw: () => {
      const pts = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        return [150 + Math.cos(a) * 92, 46 + Math.sin(a) * 34] as const;
      });
      return (
        <>
          <path d={`M${pts.map(([x, y]) => `${x} ${y}`).join("L")}Z`} data-line data-on />
          {pts.map(([x, y], i) => <Box key={i} x={x - 13} y={y - 9} w={26} h={18} />)}
          <Text x={310} y={34} anchor="start">8 chips, one model</Text>
          <Text x={310} y={56} anchor="start" on>results passed round the ring</Text>
        </>
      );
    },
  },
  T8: {
    says: "A small fast shelf, a bigger one, and a huge slow one; what is needed now sits on the fast shelf.",
    draw: () => (
      <>
        <Box x={14} y={22} w={60} h={34} on />
        <Text x={44} y={72} on>fast, small</Text>
        <Box x={110} y={16} w={140} h={40} />
        <Text x={180} y={72}>bigger</Text>
        <Box x={286} y={8} w={240} h={48} />
        <Text x={406} y={72}>huge, slow</Text>
        <Arrow x1={14} x2={526} y={86} />
      </>
    ),
  },
  T9: {
    says: "Most answers are quick; the slowest one in twenty is what people remember, so that is the one watched.",
    draw: () => {
      const bars = [10, 26, 44, 56, 60, 54, 44, 34, 26, 20, 15, 12, 9, 7, 6, 5, 4, 4, 3, 3];
      return (
        <>
          {bars.map((h, i) => <Box key={i} x={14 + i * 24} y={70 - h} w={18} h={h} on={i === bars.length - 1} />)}
          <path d="M14 72H500" data-line />
          <path d={`M${14 + (bars.length - 1) * 24 + 9} 48V64`} data-line data-on />
          <Text x={110} y={88}>most answers</Text>
          <Text x={526} y={42} anchor="end" on>slowest 1 in 20</Text>
          <Text x={526} y={88} anchor="end">slower</Text>
        </>
      );
    },
  },
};

export default function FilmSketch({ id }: { id: string }) {
  const s = SKETCHES[id];
  if (!s) return null;
  return (
    <svg className={styles.sketch} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.says}>
      {s.draw()}
    </svg>
  );
}
