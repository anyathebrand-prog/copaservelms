import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { getWalletOverview } from "@/lib/wallet";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { SubmitButton } from "@/components/ui/submit-button";
import { disconnectWalletAction, setPrimaryWalletAction } from "./actions";

export const metadata: Metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

/** Wallet page (PRD §11.5): connection, network, address, mint eligibility, mint history. */
export default async function WalletPage() {
  const user = await requireUser("/student/wallet");
  const { wallets, certificates, mints, eligible } = await getWalletOverview(user.id);

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-1 text-muted-foreground">
          Linking a wallet is optional. Your certificates are valid and verifiable without one —
          minting simply adds an on-chain record of a certificate you already hold.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">
          {wallets.length === 0 ? "Connect a wallet" : "Connect another wallet"}
        </h2>
        <div className="mt-4">
          <ConnectWallet />
        </div>
      </section>

      {wallets.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Linked wallets</h2>
          <ul className="mt-4 space-y-3">
            {wallets.map((wallet) => (
              <li
                key={wallet.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm">
                      {wallet.address.slice(0, 10)}…{wallet.address.slice(-8)}
                    </code>
                    {wallet.isPrimary && (
                      <span className="rounded-full bg-brand-pale px-2.5 py-0.5 text-xs font-semibold text-brand">
                        primary
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {wallet.chainName} · {wallet.provider.replaceAll("_", " ").toLowerCase()} ·
                    linked {wallet.connectedAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!wallet.isPrimary && (
                    <form action={setPrimaryWalletAction}>
                      <input type="hidden" name="walletId" value={wallet.id} />
                      <SubmitButton
                        pendingLabel="Saving..."
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                      >
                        Make primary
                      </SubmitButton>
                    </form>
                  )}
                  <form action={disconnectWalletAction}>
                    <input type="hidden" name="walletId" value={wallet.id} />
                    <SubmitButton
                      pendingLabel="Removing..."
                      className="rounded-lg px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                    >
                      Disconnect
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">Certificates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {eligible === 0
            ? "None of your certificates are ready to mint yet."
            : `${eligible} certificate${eligible === 1 ? "" : "s"} eligible for minting.`}
        </p>

        {certificates.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You have no certificates yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {certificates.map((certificate) => (
              <li key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {certificate.enrollment.course.title}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {certificate.certificateNumber}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {certificate.mintStatus.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Minting is not wired, and saying so is better than a button that
            cannot work. §17 question 6 is still open: the chain has not been
            confirmed and nobody owns the contract or its audit. */}
        <p className="mt-4 rounded-lg bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          Minting is not available yet. It needs a deployed certificate contract, and the chain and
          contract ownership are still being decided. Your certificates remain fully valid and
          publicly verifiable in the meantime.
        </p>
      </section>

      {mints.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Mint history</h2>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {mints.map((mint) => (
              <li key={mint.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{mint.certificate.certificateNumber}</p>
                  {mint.transactionHash && (
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {mint.transactionHash}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {mint.status.toLowerCase()} ·{" "}
                  {mint.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
