import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { OrderStatus, PaymentStatus, ProductStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { hasAdminAccess } from "../src/lib/admin-access";
import { calculateCouponDiscount } from "../src/lib/order-pricing";
import { createMidtransSignature } from "../src/lib/midtrans-webhook";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("_test")) {
  throw new Error("Run this integration test through npm run test:integration with a dedicated *_test database");
}
process.env.DATABASE_URL = databaseUrl;
if (!Reflect.set(process.env, "NODE_ENV", "test")) {
  throw new Error("Unable to set NODE_ENV for integration tests");
}
process.env.TRUST_PROXY_HEADERS = "true";
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.EMAIL_OUTBOX_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString("base64");
if (!process.env.MIDTRANS_SERVER_KEY) process.env.MIDTRANS_SERVER_KEY = "midtrans-test-server-key-not-real";

test("PostgreSQL registration, catalog, cart, checkout rollback and concurrent signed webhooks", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { handlers } = await import("../src/lib/auth");
  const { POST: register } = await import("../src/app/api/auth/register/route");
  const { POST: webhook } = await import("../src/app/api/payments/midtrans/webhook/route");
  const { reconcilePayment } = await import("../src/lib/payment-reconciliation");
  const prefix = randomUUID();
  const email = `${prefix}@integration.invalid`;
  const password = "Integration-Test-Password-9";
  const baseUrl = "http://localhost:3000";
  const registeredUserIds: string[] = [];
  const productIds: string[] = [];
  const orderIds: string[] = [];
  let categoryId: string | undefined;
  let couponId: string | undefined;
  let digitalAssetId: string | undefined;

  const createFixtureOrder = async (quantity: number, useCoupon = false) => {
    const productId = productIds[0];
    assert.ok(productId);
    const order = await prisma.$transaction(async (tx) => {
      const coupon = useCoupon && couponId
        ? await tx.coupon.findUniqueOrThrow({ where: { id: couponId } })
        : null;
      if (coupon) {
        assert.equal(coupon.active, true);
        assert.ok(coupon.startsAt <= new Date());
        assert.equal(coupon.maxUsesPerUser, 1);
        assert.equal(await tx.couponUsage.count({
          where: {
            couponId: coupon.id,
            userId: registeredUserIds[0],
            order: { status: { not: OrderStatus.CANCELLED } },
          },
        }), 0);
      }
      const subtotal = quantity * 1200;
      const discount = coupon
        ? calculateCouponDiscount(subtotal, coupon.discountType, coupon.discountValue)
        : 0;
      const totalInIdr = subtotal - discount;
      const reservation = await tx.product.updateMany({
        where: { id: productId, status: ProductStatus.ACTIVE, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      assert.equal(reservation.count, 1);
      return tx.order.create({
        data: {
          userId: registeredUserIds[0],
          totalInIdr,
          items: { create: { productId, quantity, unitPriceInIdr: 1200 } },
          invoice: {
            create: {
              invoiceNumber: `NX-TEST-${prefix}-${randomUUID()}`,
              amountInIdr: totalInIdr,
            },
          },
          ...(coupon ? { couponUsage: { create: { couponId: coupon.id, userId: registeredUserIds[0] } } } : {}),
          payment: {
            create: {
              provider: "midtrans",
              providerOrderId: `nebula-test-${prefix}-${randomUUID()}`,
              amountInIdr: totalInIdr,
              paymentType: "qris",
            },
          },
        },
        include: { payment: true, invoice: true },
      });
    }, { isolationLevel: "Serializable" });
    orderIds.push(order.id);
    return order;
  };

  const postWebhook = async (input: {
    orderId: string;
    status: "settlement" | "expire" | "deny";
    amount: string;
    transactionId: string;
    signature?: string;
  }) => {
    const statusCode = input.status === "settlement" ? "200" : "202";
    const payload = {
      order_id: input.orderId,
      status_code: statusCode,
      gross_amount: input.amount,
      signature_key: input.signature ?? createMidtransSignature(
        input.orderId,
        statusCode,
        input.amount,
        process.env.MIDTRANS_SERVER_KEY!,
      ),
      transaction_status: input.status,
      transaction_id: input.transactionId,
      payment_type: "qris",
    };
    return webhook(new Request(`${baseUrl}/api/payments/midtrans/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify(payload),
    }));
  };

  try {
    const databaseProbe = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
    assert.equal(Number(databaseProbe[0]?.result), 1);
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    assert.ok(migrations.length > 0, "test schema should have applied Prisma migrations");

    const response = await register(new Request(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        origin: baseUrl,
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ name: "Integration customer", email, password }),
    }));
    assert.equal(response.status, 201);
    const body = await response.json() as { user: { id: string; role?: UserRole } };
    registeredUserIds.push(body.user.id);
    const registered = await prisma.user.findUniqueOrThrow({
      where: { id: body.user.id },
      include: { cart: true, wallet: true },
    });
    assert.equal(registered.role, UserRole.USER);
    assert.ok(registered.passwordHash && registered.passwordHash !== password);
    assert.ok(registered.cart);
    assert.ok(registered.wallet);
    assert.equal(hasAdminAccess(registered.role), false);

    const csrfResponse = await handlers.GET(new NextRequest(`${baseUrl}/api/auth/csrf`));
    assert.equal(csrfResponse.status, 200);
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const csrfCookie = csrfResponse.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("authjs.csrf-token="))
      ?.split(";")[0];
    assert.ok(csrfCookie);
    const credentialsResponse = await handlers.POST(new NextRequest(`${baseUrl}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        cookie: csrfCookie,
        origin: baseUrl,
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "127.0.0.1",
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        callbackUrl: baseUrl,
        redirect: "false",
      }),
    }));
    assert.ok([200, 302].includes(credentialsResponse.status));
    const sessionCookie = credentialsResponse.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("authjs.session-token="))
      ?.split(";")[0];
    assert.ok(sessionCookie, "successful credentials authentication must issue a session cookie");
    const sessionRequest = () => handlers.GET(new NextRequest(`${baseUrl}/api/auth/session`, {
      headers: { cookie: sessionCookie },
    }));
    const firstSession = await sessionRequest();
    const secondSession = await sessionRequest();
    assert.equal(firstSession.status, 200);
    assert.equal(secondSession.status, 200);
    const persistedSession = await secondSession.json() as { user?: { id?: string; role?: string }; expires?: string };
    assert.equal(persistedSession.user?.id, registered.id);
    assert.equal(persistedSession.user?.role, UserRole.USER);
    assert.ok(persistedSession.expires);

    const signoutCsrf = await handlers.GET(new NextRequest(`${baseUrl}/api/auth/csrf`));
    const signoutCsrfToken = (await signoutCsrf.json() as { csrfToken: string }).csrfToken;
    const signoutCookie = signoutCsrf.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("authjs.csrf-token="))
      ?.split(";")[0];
    assert.ok(signoutCookie);
    const signedOut = await handlers.POST(new NextRequest(`${baseUrl}/api/auth/signout`, {
      method: "POST",
      headers: {
        cookie: `${signoutCookie}; ${sessionCookie}`,
        origin: baseUrl,
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "127.0.0.1",
      },
      body: new URLSearchParams({ csrfToken: signoutCsrfToken, callbackUrl: baseUrl }),
    }));
    assert.ok([200, 302].includes(signedOut.status));
    const clearedSession = signedOut.headers.getSetCookie().find((cookie) => cookie.startsWith("authjs.session-token="));
    assert.ok(clearedSession?.includes("Max-Age=0") || clearedSession?.includes("Expires="));

    const duplicate = await register(new Request(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        origin: baseUrl,
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ name: "Integration customer", email, password }),
    }));
    assert.equal(duplicate.status, 409);

    const category = await prisma.productCategory.create({
      data: { name: `Integration ${prefix}`, slug: `integration-${prefix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: "Integration product",
        slug: `integration-${prefix}`,
        description: "Test-only catalog item",
        priceInIdr: 1200,
        categoryId,
        status: ProductStatus.ACTIVE,
        stock: 12,
      },
    });
    productIds.push(product.id);
    const digitalAsset = await prisma.productDigitalAsset.create({
      data: {
        productId: product.id,
        storageKey: `integration/${prefix}/asset.zip`,
        fileName: "asset.zip",
        contentType: "application/zip",
        sizeBytes: 32,
      },
    });
    digitalAssetId = digitalAsset.id;
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: { description: "Updated test catalog item" },
    });
    assert.equal(updatedProduct.description, "Updated test catalog item");
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: body.user.id } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: product.id, quantity: 2 },
    });
    await prisma.cartItem.update({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      data: { quantity: 3 },
    });
    assert.equal((await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    })).quantity, 3);

    const coupon = await prisma.coupon.create({
      data: {
        code: `TEST${prefix.slice(0, 8).toUpperCase()}`,
        discountType: "PERCENTAGE",
        discountValue: 10,
        startsAt: new Date(Date.now() - 60_000),
        maxUses: 2,
        maxUsesPerUser: 1,
      },
    });
    couponId = coupon.id;
    const reservationBeforeRollback = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { id: product.id, stock: { gte: 4 } },
        data: { stock: { decrement: 4 } },
      });
      await tx.order.create({
        data: { userId: body.user.id, totalInIdr: 4800, items: { create: {
          productId: product.id,
          quantity: 4,
          unitPriceInIdr: 1200,
        } } },
      });
      throw new Error("intentional integration-test rollback");
    }));
    assert.equal((await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    })).stock, reservationBeforeRollback.stock);

    const order = await createFixtureOrder(2, true);
    assert.equal(order.totalInIdr, 2160);
    assert.equal(order.invoice?.amountInIdr, 2160);
    assert.equal((await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    })).stock, 10);

    const duplicateResults = await Promise.all(
      Array.from({ length: 10 }, () => postWebhook({
        orderId: order.payment!.providerOrderId,
        status: "expire",
        amount: "2160.00",
        transactionId: `expire-${prefix}`,
      })),
    );
    assert.equal(duplicateResults.filter((result) => result.status === 200).length, 10);
    const expiredOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, invoice: true },
    });
    assert.equal(expiredOrder.status, OrderStatus.CANCELLED);
    assert.equal(expiredOrder.payment?.status, PaymentStatus.EXPIRED);
    assert.equal(expiredOrder.payment?.paymentType, "qris");
    assert.equal(await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    }).then((result) => result.stock), 12);

    const failedOrder = await createFixtureOrder(1);
    const failedNotifications = await Promise.all(
      Array.from({ length: 5 }, () => postWebhook({
        orderId: failedOrder.payment!.providerOrderId,
        status: "deny",
        amount: "1200.00",
        transactionId: `deny-${prefix}`,
      })),
    );
    assert.equal(failedNotifications.filter((result) => result.status === 200).length, 5);
    const failedOrderRecord = await prisma.order.findUniqueOrThrow({
      where: { id: failedOrder.id },
      include: { payment: true },
    });
    assert.equal(failedOrderRecord.status, OrderStatus.CANCELLED);
    assert.equal(failedOrderRecord.payment?.status, PaymentStatus.FAILED);
    assert.equal(await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    }).then((result) => result.stock), 12);

    const settledOrder = await createFixtureOrder(1);
    const settlementNotifications = await Promise.all(
      Array.from({ length: 5 }, () => postWebhook({
        orderId: settledOrder.payment!.providerOrderId,
        status: "settlement",
        amount: "1200.00",
        transactionId: `settlement-${prefix}`,
      })),
    );
    assert.equal(settlementNotifications.filter((result) => result.status === 200).length, 5);
    const settledOrderRecord = await prisma.order.findUniqueOrThrow({
      where: { id: settledOrder.id },
      include: { payment: true, invoice: true },
    });
    assert.equal(settledOrderRecord.status, OrderStatus.PAID);
    assert.equal(settledOrderRecord.payment?.status, PaymentStatus.SETTLEMENT);
    assert.ok(settledOrderRecord.invoice?.paidAt);
    assert.equal(await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    }).then((result) => result.stock), 11);

    const settlementAfterExpiry = await postWebhook({
      orderId: order.payment!.providerOrderId,
      status: "settlement",
      amount: "2160.00",
      transactionId: `late-${prefix}`,
    });
    assert.equal(settlementAfterExpiry.status, 200);
    const lateOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, invoice: true },
    });
    assert.equal(lateOrder.status, OrderStatus.CANCELLED);
    assert.equal(lateOrder.payment?.status, PaymentStatus.SETTLEMENT);
    assert.equal(lateOrder.invoice?.paidAt, null);
    assert.equal(await prisma.auditLog.count({
      where: { entityId: order.payment!.id, action: "payment.settled_after_order_closed" },
    }), 1);
    assert.equal(await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    }).then((result) => result.stock), 11);

    const invalidAmountOrder = await createFixtureOrder(1);
    const invalidAmount = await postWebhook({
      orderId: invalidAmountOrder.payment!.providerOrderId,
      status: "settlement",
      amount: "1.00",
      transactionId: `amount-${prefix}`,
    });
    assert.equal(invalidAmount.status, 400);
    const invalidSignature = await postWebhook({
      orderId: invalidAmountOrder.payment!.providerOrderId,
      status: "settlement",
      amount: "1200.00",
      transactionId: `signature-${prefix}`,
      signature: "0".repeat(128),
    });
    assert.equal(invalidSignature.status, 401);
    const notFound = await postWebhook({
      orderId: `unknown-${prefix}`,
      status: "settlement",
      amount: "1200.00",
      transactionId: `missing-${prefix}`,
    });
    assert.equal(notFound.status, 400);
    assert.equal((await prisma.payment.findUniqueOrThrow({
      where: { id: invalidAmountOrder.payment!.id },
      select: { status: true },
    })).status, PaymentStatus.PENDING);
    const { getPurchasedDigitalAsset } = await import("../src/lib/digital-download");
    await assert.rejects(getPurchasedDigitalAsset(registeredUserIds[0], product.id), { code: "ASSET_NOT_AVAILABLE" });
    await prisma.$transaction([
      prisma.order.update({ where: { id: invalidAmountOrder.id }, data: { status: OrderStatus.PAID } }),
      prisma.payment.update({ where: { id: invalidAmountOrder.payment!.id }, data: { status: PaymentStatus.SETTLEMENT } }),
      prisma.invoice.update({ where: { orderId: invalidAmountOrder.id }, data: { paidAt: new Date() } }),
    ]);
    assert.equal(
      (await getPurchasedDigitalAsset(registeredUserIds[0], product.id)).storageKey,
      digitalAsset.storageKey,
    );
    await assert.rejects(getPurchasedDigitalAsset(registeredUserIds[1] ?? "other-user", product.id), {
      code: "ASSET_NOT_AVAILABLE",
    });

    const contestedOrder = await createFixtureOrder(1);
    const raceResults = await Promise.all([
      postWebhook({
        orderId: contestedOrder.payment!.providerOrderId,
        status: "settlement",
        amount: "1200.00",
        transactionId: `race-settlement-${prefix}`,
      }),
      postWebhook({
        orderId: contestedOrder.payment!.providerOrderId,
        status: "expire",
        amount: "1200.00",
        transactionId: `race-expiry-${prefix}`,
      }),
    ]);
    assert.ok(raceResults.every((result) => result.status === 200));
    const raced = await prisma.order.findUniqueOrThrow({
      where: { id: contestedOrder.id },
      include: { payment: true, invoice: true },
    });
    assert.ok(
      (raced.status === OrderStatus.PAID && raced.payment?.status === PaymentStatus.SETTLEMENT && raced.invoice?.paidAt) ||
      (raced.status === OrderStatus.CANCELLED && raced.payment?.status === PaymentStatus.SETTLEMENT && !raced.invoice?.paidAt) ||
      (raced.status === OrderStatus.CANCELLED && raced.payment?.status === PaymentStatus.EXPIRED && !raced.invoice?.paidAt),
      "concurrent payment transitions must end in a valid paid state or closed/manual-review state",
    );
    assert.ok([9, 10].includes((await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    })).stock!));

    const reconciliationOrder = await createFixtureOrder(1);
    const originalFetch = globalThis.fetch;
    const providerStatus = {
      order_id: reconciliationOrder.payment!.providerOrderId,
      status_code: "200",
      gross_amount: "1200.00",
      transaction_status: "settlement",
      transaction_id: `reconcile-${prefix}`,
      payment_type: "qris",
    };
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        ...providerStatus,
        gross_amount: "1.00",
      }), { status: 200, headers: { "content-type": "application/json" } });
      await assert.rejects(reconcilePayment({
        paymentId: reconciliationOrder.payment!.id,
        source: "SCHEDULED",
        reason: "integration mismatch case",
      }), { code: "MIDTRANS_STATUS_MISMATCH" });
      globalThis.fetch = async () => {
        throw new Error("simulated status API timeout");
      };
      await assert.rejects(reconcilePayment({
        paymentId: reconciliationOrder.payment!.id,
        source: "SCHEDULED",
        reason: "integration timeout case",
      }), { code: "MIDTRANS_STATUS_UNAVAILABLE" });

      globalThis.fetch = async () => new Response(JSON.stringify(providerStatus), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      await Promise.all([
        reconcilePayment({
          paymentId: reconciliationOrder.payment!.id,
          source: "SCHEDULED",
          reason: "concurrent integration worker A",
        }),
        reconcilePayment({
          paymentId: reconciliationOrder.payment!.id,
          source: "SCHEDULED",
          reason: "concurrent integration worker B",
        }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const reconciledOrder = await prisma.order.findUniqueOrThrow({
      where: { id: reconciliationOrder.id },
      include: { payment: true, invoice: true },
    });
    assert.equal(reconciledOrder.status, OrderStatus.PAID);
    assert.equal(reconciledOrder.payment?.status, PaymentStatus.SETTLEMENT);
    assert.ok(reconciledOrder.invoice?.paidAt);
    assert.equal(await prisma.paymentReconciliation.count({
      where: { paymentId: reconciliationOrder.payment!.id },
    }), 4, "amount mismatch, timeout, and two workers must each be recorded");

    const admin = await prisma.user.create({
      data: {
        email: `${prefix}+admin@integration.invalid`,
        role: UserRole.ADMIN,
        passwordHash: "test-only-hash",
      },
    });
    registeredUserIds.push(admin.id);
    assert.equal(hasAdminAccess(admin.role), true);

    assert.equal(await prisma.couponUsage.count({ where: { couponId: coupon.id } }), 1);
  } finally {
    if (orderIds.length) {
      await prisma.emailOutbox.deleteMany({ where: { recipient: email } });
      const fixturePayments = await prisma.payment.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: fixturePayments.map(({ id }) => id) } } });
      await prisma.paymentWebhookEvent.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await prisma.paymentReconciliation.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.couponUsage.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (productIds.length) {
      await prisma.cartItem.deleteMany({ where: { productId: { in: productIds } } });
      if (digitalAssetId) await prisma.productDigitalAsset.deleteMany({ where: { id: digitalAssetId } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (couponId) await prisma.coupon.deleteMany({ where: { id: couponId } });
    if (categoryId) await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    for (const userId of registeredUserIds) {
      await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: userId }, { entityId: userId }] } });
      await prisma.cart.deleteMany({ where: { userId } });
      await prisma.wallet.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.emailOutbox.deleteMany({ where: { recipient: email } });
    const { getRedisClient } = await import("../src/lib/redis");
    await (await getRedisClient()).quit();
    await prisma.$disconnect();
  }
});
