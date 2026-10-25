import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

export function Brand() {
  return (
    <Link className="brand" href="/">
      <span className="brand-mark">
        <BookOpen size={22} aria-hidden="true" />
      </span>{" "}
      momentas<span className="brand-period">.</span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="header">
      <Brand />
      <span className="header-note">
        A little closer to the way you remember.
      </span>
      <Link className="quiet-link saved-link" href="/library">
        Saved pictures
      </Link>
      <Link className="quiet-link create-link" href="/#choose">
        Create a memory <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </header>
  );
}
