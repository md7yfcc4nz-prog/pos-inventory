import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const Role = { ADMIN: "ADMIN", STAFF: "STAFF" } as const;
const Category = { DRINKS: "DRINKS", MEDICINE: "MEDICINE", OTHER: "OTHER" } as const;
const PaymentMethod = { CASH: "CASH", CARD: "CARD" } as const;

const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.storeStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.userStore.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@store.local",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const staff = await prisma.user.create({
    data: {
      name: "Staff User",
      email: "staff@store.local",
      passwordHash,
      role: Role.STAFF,
    },
  });

  const storeA = await prisma.store.create({
    data: {
      name: "Downtown Pharmacy",
      address: "12 Main Street",
    },
  });

  const storeB = await prisma.store.create({
    data: {
      name: "Westside Mart",
      address: "88 Oak Avenue",
    },
  });

  await prisma.userStore.createMany({
    data: [
      { userId: admin.id, storeId: storeA.id },
      { userId: admin.id, storeId: storeB.id },
      { userId: staff.id, storeId: storeA.id },
    ],
  });

  const products = [
    {
      name: "Cola 500ml",
      category: Category.DRINKS,
      barcode: "8901001001001",
      supplier: "Refresh Co",
      cost: 0.6,
      price: 1.5,
      lowStockThreshold: 20,
      qtyA: 80,
      qtyB: 45,
    },
    {
      name: "Orange Juice 1L",
      category: Category.DRINKS,
      barcode: "8901001001002",
      supplier: "Refresh Co",
      cost: 1.2,
      price: 2.8,
      lowStockThreshold: 15,
      qtyA: 12,
      qtyB: 30,
    },
    {
      name: "Sparkling Water",
      category: Category.DRINKS,
      barcode: "8901001001003",
      supplier: "AquaFresh",
      cost: 0.4,
      price: 1.2,
      lowStockThreshold: 25,
      qtyA: 5,
      qtyB: 8,
    },
    {
      name: "Paracetamol 500mg",
      category: Category.MEDICINE,
      barcode: "8902002002001",
      supplier: "MediSupply",
      cost: 1.5,
      price: 4.0,
      lowStockThreshold: 30,
      expiryDate: new Date("2027-06-01"),
      qtyA: 120,
      qtyB: 60,
    },
    {
      name: "Ibuprofen 200mg",
      category: Category.MEDICINE,
      barcode: "8902002002002",
      supplier: "MediSupply",
      cost: 1.8,
      price: 4.5,
      lowStockThreshold: 25,
      expiryDate: new Date("2025-01-15"),
      qtyA: 18,
      qtyB: 4,
    },
    {
      name: "Cough Syrup 100ml",
      category: Category.MEDICINE,
      barcode: "8902002002003",
      supplier: "HealthPlus",
      cost: 2.5,
      price: 6.5,
      lowStockThreshold: 15,
      expiryDate: new Date("2024-12-01"),
      qtyA: 3,
      qtyB: 2,
    },
    {
      name: "Vitamin C Tablets",
      category: Category.MEDICINE,
      barcode: "8902002002004",
      supplier: "HealthPlus",
      cost: 2.0,
      price: 5.5,
      lowStockThreshold: 20,
      expiryDate: new Date("2026-11-30"),
      qtyA: 40,
      qtyB: 22,
    },
    {
      name: "Bandages Pack",
      category: Category.OTHER,
      barcode: "8903003003001",
      supplier: "CareGoods",
      cost: 0.9,
      price: 2.5,
      lowStockThreshold: 10,
      qtyA: 35,
      qtyB: 15,
    },
    {
      name: "Hand Sanitizer 250ml",
      category: Category.OTHER,
      barcode: "8903003003002",
      supplier: "CareGoods",
      cost: 1.1,
      price: 3.0,
      lowStockThreshold: 15,
      qtyA: 8,
      qtyB: 50,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        category: p.category,
        barcode: p.barcode,
        supplier: p.supplier,
        cost: p.cost,
        price: p.price,
        lowStockThreshold: p.lowStockThreshold,
        expiryDate: "expiryDate" in p ? p.expiryDate : null,
      },
    });

    await prisma.storeStock.createMany({
      data: [
        { productId: product.id, storeId: storeA.id, quantity: p.qtyA },
        { productId: product.id, storeId: storeB.id, quantity: p.qtyB },
      ],
    });
  }

  const cola = await prisma.product.findFirst({ where: { barcode: "8901001001001" } });
  if (cola) {
    await prisma.sale.create({
      data: {
        storeId: storeA.id,
        cashierId: staff.id,
        paymentMethod: PaymentMethod.CASH,
        subtotal: 3.0,
        total: 3.0,
        items: {
          create: [
            {
              productId: cola.id,
              quantity: 2,
              unitPrice: 1.5,
              lineTotal: 3.0,
            },
          ],
        },
      },
    });
  }

  console.log("Seed complete.");
  console.log("Admin: admin@store.local / password123");
  console.log("Staff: staff@store.local / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
