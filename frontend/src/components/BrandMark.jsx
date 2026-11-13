export default function BrandMark({ small = false }) {
  return <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-label="Campus Stadium logo" role="img">
    <span className="brand-mark-inner"><span className="brand-mark-red" /><span className="brand-mark-blue" /><strong>CS</strong></span>
  </span>;
}
