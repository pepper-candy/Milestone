const RESOURCES = [
  {
    title: "Study materials (OneDrive)",
    href: "https://onedrive.live.com",
    note: "Replace with your shared folder link",
  },
  {
    title: "Task set PDF",
    href: "#",
    note: "Upload PDFs to public/resources when ready",
  },
];

export default function ResourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Resources</h1>
        <p className="text-sm text-text-muted">
          OneDrive links and reference PDFs for the 50-day journey.
        </p>
      </div>
      <ul className="space-y-3">
        {RESOURCES.map((item) => (
          <li key={item.title}>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-3xl bg-warm-bg px-5 py-4 transition hover:bg-cream/70"
            >
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="text-sm text-text-muted">{item.note}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
