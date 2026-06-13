import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground font-display text-lg">F</span>
          <span className="font-display text-lg tracking-tight">FamilyMove<span className="text-muted-foreground"> Sweden</span></span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link to="/" className="rounded-full px-3 py-2 text-muted-foreground hover:text-foreground" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground" }}>Explore</Link>
          <Link to="/compare" className="rounded-full px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>Compare</Link>
          <Link to="/assistant" className="rounded-full px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>AI Assistant</Link>
        </nav>
        <Link to="/assistant" className="hidden rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 md:inline-flex">
          Ask the assistant
        </Link>
      </div>
    </header>
  );
}
