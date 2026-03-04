import type { PropsWithChildren } from "react";

export function ShellCard({ children }: PropsWithChildren) {
  return <section className="panel">{children}</section>;
}
