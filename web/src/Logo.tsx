// A violet blob with two eyes: the coach that watches you back.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 34 34" aria-hidden>
      <path fill="#8257e6" d="M17 1c4 0 5.5 3 9 4s7 4 7 9-2 6-2 9.5S28 31 23 32.5 19.5 33 17 33s-3-1-6.5-.5S3 30 2.5 25 1 19 1 15s3-8 7-9.5S13 1 17 1Z" />
      <circle cx="12.5" cy="15.5" r="2.6" fill="#fff" /><circle cx="21.5" cy="15.5" r="2.6" fill="#fff" />
    </svg>
  );
}
