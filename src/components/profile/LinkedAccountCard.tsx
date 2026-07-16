"use client";

import { formatMemberSince } from "@/lib/datetime";
import type { LinkedAccount } from "@/types";
import Image from "next/image";

type Props = {
  account: LinkedAccount;
  label: string;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
  /** Unused invite (no nickname) — show Remove in the Active badge slot. */
  removable?: boolean;
  removing?: boolean;
  onRemove?: () => void;
};

export function LinkedAccountCard({
  account,
  label,
  selected = false,
  selectable = false,
  onSelect,
  removable = false,
  removing = false,
  onRemove,
}: Props) {
  const className = `flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
    selected
      ? "border-gold bg-[rgba(252,221,166,0.25)] shadow-[0px_0px_0px_2px_rgba(200,146,42,0.35)]"
      : "border-[rgba(200,146,42,0.15)] bg-surface"
  }`;

  const memberSince =
    account.nickname && account.created_at
      ? formatMemberSince(account.created_at)
      : "";

  const avatarAndText = (
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
        {memberSince ? (
          <p className="truncate text-xs text-[rgba(28,22,16,0.45)]">
            Member since {memberSince}
          </p>
        ) : null}
      </div>
    </>
  );

  const trailing =
    removable && onRemove ? (
      <button
        type="button"
        disabled={removing}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 rounded-full bg-[rgba(200,146,42,0.15)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold transition enabled:hover:bg-[rgba(180,60,40,0.12)] enabled:hover:text-[#a33] disabled:opacity-60"
      >
        {removing ? "…" : "Remove"}
      </button>
    ) : selectable && selected ? (
      <span className="shrink-0 rounded-full bg-[rgba(200,146,42,0.15)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold">
        Active
      </span>
    ) : null;

  // Avoid nested <button> when Remove is present.
  if (selectable && onSelect && removable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`${className} cursor-pointer`}
      >
        {avatarAndText}
        {trailing}
      </div>
    );
  }

  if (selectable && onSelect) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {avatarAndText}
        {trailing}
      </button>
    );
  }

  return (
    <div className={className}>
      {avatarAndText}
      {trailing}
    </div>
  );
}
