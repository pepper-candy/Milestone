"use client";

import type { LinkedAccount } from "@/types";
import Image from "next/image";

type Props = {
  account: LinkedAccount;
  label: string;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
};

export function LinkedAccountCard({
  account,
  label,
  selected = false,
  selectable = false,
  onSelect,
}: Props) {
  const content = (
    <>
      <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-cream">
        <Image
          src={account.avatar_url || "/brand/icon_app_d.png"}
          alt=""
          fill
          className="object-cover"
          sizes="48px"
          unoptimized={Boolean(account.avatar_url)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gold">
          {label}
        </p>
        <p className="truncate text-base font-semibold text-ink">
          {account.nickname || "Not set up yet"}
        </p>
        <p className="text-xs uppercase tracking-wider text-[rgba(28,22,16,0.45)]">
          {account.invitation_code}
        </p>
      </div>
      {selectable && selected ? (
        <span className="shrink-0 rounded-full bg-[rgba(200,146,42,0.15)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold">
          Active
        </span>
      ) : null}
    </>
  );

  const className = `flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
    selected
      ? "border-gold bg-[rgba(252,221,166,0.25)] shadow-[0px_0px_0px_2px_rgba(200,146,42,0.35)]"
      : "border-[rgba(200,146,42,0.15)] bg-surface"
  }`;

  if (selectable && onSelect) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
