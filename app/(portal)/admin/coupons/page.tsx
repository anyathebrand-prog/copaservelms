import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/roles";
import { listCoupons } from "@/lib/coupons";
import { createCouponAction, toggleCouponAction } from "./actions";

export const metadata: Metadata = { title: "Coupons" };

const naira = (minor: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(minor / 100);

/** Discount codes (PRD §13.2). */
export default async function AdminCouponsPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"], "/admin/coupons");

  const [coupons, courses] = await Promise.all([
    listCoupons(),
    prisma.course.findMany({
      where: { status: { in: ["PUBLISHED", "APPROVED"] } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Coupons</h1>
        <p className="mt-1 text-muted-foreground">
          Discount codes are priced server-side at checkout and redeemed only once payment confirms.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-xl font-semibold">New coupon</h2>

        <form action={createCouponAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Code</span>
            <input
              name="code"
              required
              placeholder="LAUNCH20"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm uppercase outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Description</span>
            <input
              name="description"
              placeholder="Launch promotion"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Type</span>
            <select
              name="type"
              defaultValue="PERCENT"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            >
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED">Fixed amount off (₦)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Value</span>
            <input
              name="value"
              type="number"
              min="1"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Percentage 1–100, or an amount in naira for a fixed discount.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Course</span>
            <select
              name="courseId"
              defaultValue=""
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Total redemptions</span>
            <input
              name="maxRedemptions"
              type="number"
              min="1"
              placeholder="Unlimited"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Uses per person</span>
            <input
              name="perUserLimit"
              type="number"
              min="1"
              defaultValue={1}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Expires</span>
            <input
              name="expiresAt"
              type="date"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Create coupon
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Existing coupons</h2>

        {coupons.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No coupons yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {coupons.map((coupon) => {
              const exhausted =
                coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions;
              const expired = coupon.expiresAt !== null && coupon.expiresAt < new Date();

              return (
                <li
                  key={coupon.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-surface-muted px-2 py-0.5 font-mono text-sm font-semibold">
                        {coupon.code}
                      </code>
                      <span className="text-sm font-medium">
                        {coupon.type === "PERCENT" ? `${coupon.value}% off` : `${naira(coupon.value)} off`}
                      </span>
                      {!coupon.isActive && (
                        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          inactive
                        </span>
                      )}
                      {expired && (
                        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          expired
                        </span>
                      )}
                      {exhausted && (
                        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                          fully redeemed
                        </span>
                      )}
                    </div>

                    {coupon.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{coupon.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {coupon.course?.title ?? "All courses"} · {coupon.redemptionCount}
                      {coupon.maxRedemptions !== null ? `/${coupon.maxRedemptions}` : ""} redeemed ·{" "}
                      {coupon.perUserLimit} per person
                      {coupon.expiresAt
                        ? ` · expires ${coupon.expiresAt.toLocaleDateString("en-NG")}`
                        : ""}
                    </p>
                  </div>

                  <form action={toggleCouponAction}>
                    <input type="hidden" name="couponId" value={coupon.id} />
                    <input type="hidden" name="isActive" value={String(!coupon.isActive)} />
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
                    >
                      {coupon.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
