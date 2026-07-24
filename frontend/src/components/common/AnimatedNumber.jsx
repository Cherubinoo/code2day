import CountUp from './CountUp';

function parseCountableValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { prefix: '', number: value, suffix: '' };
  }

  if (typeof value !== 'string') return null;

  const clean = value.trim();
  const match = clean.match(/^([^0-9-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return null;

  const [, prefix, numberText, suffix] = match;
  if (/^-\d+$/.test(suffix.trim())) return null;

  const number = Number(numberText.replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;

  return { prefix, number, suffix };
}

export default function AnimatedNumber({
  value,
  from = 0,
  duration = 1,
  delay = 0,
  separator = ',',
  className = '',
  startWhen = true,
}) {
  const parsed = parseCountableValue(value);

  if (!parsed) {
    return <span className={className}>{value}</span>;
  }

  const countFrom = parsed.number < 0 ? parsed.number : from;

  return (
    <span className={className}>
      {parsed.prefix}
      <CountUp
        from={countFrom}
        to={parsed.number}
        duration={duration}
        delay={delay}
        separator={separator}
        startWhen={startWhen}
      />
      {parsed.suffix}
    </span>
  );
}
