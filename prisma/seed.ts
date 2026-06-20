import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "db.sqlite");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.notification.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.loyaltyProgram.deleteMany();
  await prisma.scheduleSlot.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.tableSession.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.tableSection.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.wastageLog.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.menuItemVariant.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.userLocationRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.operatingHours.deleteMany();
  await prisma.featureToggle.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.paymentConfig.deleteMany();
  await prisma.location.deleteMany();
  await prisma.restaurant.deleteMany();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Spice Garden",
      tagline: "Authentic North Indian Cuisine",
      description: "Family-owned restaurant serving traditional dishes since 2010.",
      cuisineTags: JSON.stringify(["North Indian", "Vegetarian", "Tandoor"]),
      fssai: "12345678901234",
      gstin: "27AABCU9603R1ZM",
      email: "owner@spicegarden.in",
      phone: "+91 98765 43210",
    },
  });

  const mainBranch = await prisma.location.create({
    data: {
      restaurantId: restaurant.id,
      name: "Main Branch",
      address: "42 MG Road",
      city: "Bangalore",
      pin: "560001",
      phone: "+91 80 1234 5678",
      email: "main@spicegarden.in",
      taxSlab: 5,
      status: "active",
    },
  });

  const patioBranch = await prisma.location.create({
    data: {
      restaurantId: restaurant.id,
      name: "Patio",
      address: "15 Brigade Road",
      city: "Bangalore",
      pin: "560025",
      phone: "+91 80 8765 4321",
      taxSlab: 5,
      status: "active",
    },
  });

  for (let day = 0; day < 7; day++) {
    for (const loc of [mainBranch, patioBranch]) {
      await prisma.operatingHours.create({
        data: {
          locationId: loc.id,
          dayOfWeek: day,
          openTime: "11:00",
          closeTime: "23:00",
          isClosed: false,
        },
      });
    }
  }

  const permissions = [
    { resource: "reports", action: "view", label: "View Reports", group: "Reports" },
    { resource: "reports", action: "export", label: "Export Reports", group: "Reports" },
    { resource: "menu", action: "create", label: "Create Menu Items", group: "Menu" },
    { resource: "menu", action: "edit", label: "Edit Menu Items", group: "Menu" },
    { resource: "menu", action: "delete", label: "Delete Menu Items", group: "Menu" },
    { resource: "menu", action: "availability", label: "Toggle Availability", group: "Menu" },
    { resource: "inventory", action: "view", label: "View Inventory", group: "Inventory" },
    { resource: "inventory", action: "adjust", label: "Adjust Stock", group: "Inventory" },
    { resource: "tables", action: "manage", label: "Manage Tables", group: "Tables" },
    { resource: "orders", action: "cancel_preparing", label: "Cancel Preparing Orders", group: "Orders" },
    { resource: "payments", action: "refund", label: "Issue Refunds", group: "Payments" },
    { resource: "staff", action: "manage", label: "Manage Staff", group: "Staff" },
    { resource: "staff", action: "payroll", label: "View Payroll", group: "Staff" },
    { resource: "settings", action: "restaurant", label: "Restaurant Settings", group: "Settings" },
    { resource: "settings", action: "roles", label: "Manage Roles", group: "Settings" },
    { resource: "settings", action: "integrations", label: "Manage Integrations", group: "Settings" },
  ];

  for (const p of permissions) {
    await prisma.permission.create({ data: p });
  }

  const allPerms = await prisma.permission.findMany();
  const ownerRole = await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      name: "Owner",
      description: "Full access to all restaurant operations",
      isTemplate: true,
      permissions: { create: allPerms.map((p) => ({ permissionId: p.id })) },
    },
  });

  const managerPerms = allPerms.filter((p) => p.action !== "payroll" && p.resource !== "settings");
  const managerRole = await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      name: "Manager",
      description: "Location-scoped management access",
      isTemplate: true,
      permissions: { create: managerPerms.map((p) => ({ permissionId: p.id })) },
    },
  });

  const owner = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      name: "Rajesh Kumar",
      email: "rajesh@spicegarden.in",
      phone: "+919876543210",
      status: "active",
      inviteStatus: "accepted",
      lastActive: new Date(),
    },
  });

  const manager = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      name: "Priya Sharma",
      email: "priya@spicegarden.in",
      phone: "+919876543211",
      status: "active",
      inviteStatus: "accepted",
      lastActive: new Date(),
    },
  });

  await prisma.userLocationRole.create({
    data: { userId: owner.id, roleId: ownerRole.id, locationId: null },
  });
  await prisma.userLocationRole.create({
    data: { userId: manager.id, roleId: managerRole.id, locationId: mainBranch.id },
  });

  const starters = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: "Starters", displayOrder: 1 },
  });
  const mains = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: "Main Course", displayOrder: 2 },
  });
  const breads = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: "Breads", displayOrder: 3 },
  });
  const beverages = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: "Beverages", displayOrder: 4 },
  });

  const menuItems = [
    { name: "Paneer Tikka", categoryId: starters.id, basePrice: 240, recipeCost: 85, prepTime: 15 },
    { name: "Chicken Tikka", categoryId: starters.id, basePrice: 280, recipeCost: 110, prepTime: 18 },
    { name: "Butter Naan", categoryId: breads.id, basePrice: 60, recipeCost: 12, prepTime: 8 },
    { name: "Garlic Naan", categoryId: breads.id, basePrice: 80, recipeCost: 15, prepTime: 8 },
    { name: "Dal Makhani", categoryId: mains.id, basePrice: 220, recipeCost: 55, prepTime: 20 },
    { name: "Butter Chicken", categoryId: mains.id, basePrice: 320, recipeCost: 130, prepTime: 22 },
    { name: "Palak Paneer", categoryId: mains.id, basePrice: 260, recipeCost: 75, prepTime: 18 },
    { name: "Biryani (Veg)", categoryId: mains.id, basePrice: 280, recipeCost: 90, prepTime: 25 },
    { name: "Lassi", categoryId: beverages.id, basePrice: 80, recipeCost: 20, prepTime: 3 },
    { name: "Masala Chai", categoryId: beverages.id, basePrice: 40, recipeCost: 8, prepTime: 5 },
  ];

  for (const item of menuItems) {
    const margin = ((item.basePrice - item.recipeCost) / item.basePrice) * 100;
    await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: item.categoryId,
        name: item.name,
        basePrice: item.basePrice,
        recipeCost: item.recipeCost,
        grossMargin: Math.round(margin * 10) / 10,
        prepTime: item.prepTime,
        unitsSold: Math.floor(Math.random() * 200) + 50,
        availability: item.name === "Paneer Tikka" ? "out_of_stock" : "available",
        dietaryFlags: JSON.stringify(item.name.includes("Chicken") ? [] : ["vegetarian"]),
      },
    });
  }

  const ingredients = [
    { name: "Paneer", unit: "kg", category: "Dairy", threshold: 5 },
    { name: "Chicken", unit: "kg", category: "Meat", threshold: 10 },
    { name: "Tomato", unit: "kg", category: "Vegetables", threshold: 8 },
    { name: "Onion", unit: "kg", category: "Vegetables", threshold: 10 },
    { name: "Butter", unit: "kg", category: "Dairy", threshold: 3 },
    { name: "Cream", unit: "L", category: "Dairy", threshold: 2 },
    { name: "Flour", unit: "kg", category: "Grains", threshold: 15 },
    { name: "Rice", unit: "kg", category: "Grains", threshold: 20 },
    { name: "Spices Mix", unit: "kg", category: "Spices", threshold: 2 },
    { name: "Yogurt", unit: "L", category: "Dairy", threshold: 5 },
  ];

  for (const ing of ingredients) {
    const ingredient = await prisma.ingredient.create({ data: ing });
    for (const loc of [mainBranch, patioBranch]) {
      const qty = ing.name === "Paneer" ? 2.1 : Math.random() * 20 + 5;
      await prisma.stock.create({
        data: { ingredientId: ingredient.id, locationId: loc.id, quantity: Math.round(qty * 10) / 10 },
      });
    }
  }

  const supplier = await prisma.supplier.create({
    data: {
      name: "Fresh Farms Pvt Ltd",
      contact: "Suresh Patel",
      phone: "+919988776655",
      email: "orders@freshfarms.in",
      address: "Plot 12, APMC Market, Bangalore",
      categories: JSON.stringify(["Dairy", "Vegetables"]),
      fssaiLicense: "11223344556677",
      rating: 4.5,
      leadTime: 2,
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      number: "PO-MAIN-001",
      supplierId: supplier.id,
      locationId: mainBranch.id,
      status: "submitted",
      total: 12500,
      lines: {
        create: [
          { ingredientId: (await prisma.ingredient.findFirst({ where: { name: "Paneer" } }))!.id, qtyOrdered: 20, unitPrice: 320 },
          { ingredientId: (await prisma.ingredient.findFirst({ where: { name: "Chicken" } }))!.id, qtyOrdered: 15, unitPrice: 280 },
        ],
      },
    },
  });

  const mainHall = await prisma.tableSection.create({
    data: { locationId: mainBranch.id, name: "Main Hall" },
  });
  const patio = await prisma.tableSection.create({
    data: { locationId: mainBranch.id, name: "Patio" },
  });

  const tableStatuses = ["available", "occupied", "reserved", "cleaning"];
  for (let i = 1; i <= 12; i++) {
    await prisma.restaurantTable.create({
      data: {
        locationId: mainBranch.id,
        sectionId: i <= 8 ? mainHall.id : patio.id,
        label: `T${i}`,
        minCapacity: i <= 4 ? 2 : 4,
        maxCapacity: i <= 4 ? 4 : 8,
        shape: i % 3 === 0 ? "round" : "square",
        posX: ((i - 1) % 4) * 120 + 40,
        posY: Math.floor((i - 1) / 4) * 100 + 40,
        status: tableStatuses[i % 4],
      },
    });
  }

  const tables = await prisma.restaurantTable.findMany({ where: { status: "occupied" } });
  for (const table of tables.slice(0, 3)) {
    await prisma.tableSession.create({
      data: {
        tableId: table.id,
        locationId: mainBranch.id,
        guestCount: Math.floor(Math.random() * 4) + 2,
        serverName: "Amit",
        status: "open",
        orderTotal: Math.floor(Math.random() * 3000) + 500,
      },
    });
  }

  const sources = ["dine_in", "takeaway", "swiggy", "zomato", "qr"];
  const statuses = ["pending", "confirmed", "preparing", "ready", "served", "cancelled"];
  for (let i = 1; i <= 50; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const subtotal = Math.floor(Math.random() * 2000) + 200;
    await prisma.order.create({
      data: {
        number: `ORD-${String(i).padStart(4, "0")}`,
        locationId: mainBranch.id,
        source,
        status,
        subtotal,
        tax: subtotal * 0.05,
        total: subtotal * 1.05,
        tableLabel: source === "dine_in" ? `T${Math.floor(Math.random() * 12) + 1}` : null,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 6 * 3600000)),
        items: {
          create: [
            { name: "Paneer Tikka", quantity: 2, price: 240 },
            { name: "Butter Naan", quantity: 3, price: 60 },
          ],
        },
      },
    });
  }

  await prisma.paymentConfig.create({
    data: {
      restaurantId: restaurant.id,
      cashEnabled: true,
      cardEnabled: false,
      upiEnabled: true,
      tipsEnabled: true,
      swiggyRate: 18,
      zomatoRate: 20,
      ondcRate: 10,
    },
  });

  const staffMembers = [
    { name: "Amit Singh", phone: "+919900112233", role: "Wait Staff" },
    { name: "Sunita Devi", phone: "+919900112234", role: "Kitchen Staff" },
    { name: "Vikram Rao", phone: "+919900112235", role: "Cashier" },
    { name: "Deepa Nair", phone: "+919900112236", role: "Kitchen Staff" },
  ];

  for (const s of staffMembers) {
    const user = await prisma.user.create({
      data: {
        restaurantId: restaurant.id,
        name: s.name,
        phone: s.phone,
        status: "active",
        inviteStatus: "accepted",
        lastActive: new Date(Date.now() - Math.random() * 86400000),
      },
    });
    await prisma.attendance.create({
      data: {
        userId: user.id,
        clockIn: new Date(new Date().setHours(9, 0, 0, 0)),
        clockOut: null,
        location: mainBranch.name,
      },
    });
  }

  const customers = [
    { name: "Anita Mehta", phone: "+919811122233", tier: "gold", totalSpend: 45000, visitCount: 28 },
    { name: "Rohit Verma", phone: "+919811122234", tier: "silver", totalSpend: 12000, visitCount: 8 },
    { name: "Kavita Joshi", phone: "+919811122235", tier: "platinum", totalSpend: 89000, visitCount: 45 },
    { name: "Sanjay Gupta", phone: "+919811122236", tier: "silver", totalSpend: 8500, visitCount: 5 },
    { name: "Meera Iyer", phone: "+919811122237", tier: "gold", totalSpend: 32000, visitCount: 18 },
  ];

  for (const c of customers) {
    await prisma.customer.create({
      data: {
        ...c,
        lastVisit: new Date(Date.now() - Math.random() * 30 * 86400000),
        points: Math.floor(c.totalSpend * 0.1),
      },
    });
  }

  await prisma.loyaltyProgram.create({
    data: { restaurantId: restaurant.id, earnRate: 1, redeemRate: 0.25, minRedeem: 100 },
  });

  await prisma.campaign.create({
    data: {
      name: "Weekend Special",
      segment: "Regular",
      message: "Hi {name}! Enjoy 15% off this weekend. Use code WEEKEND15.",
      channel: "whatsapp",
      status: "sent",
      sentCount: 120,
      redeemCount: 18,
    },
  });

  const cust = await prisma.customer.findFirst();
  if (cust) {
    await prisma.reservation.create({
      data: {
        locationId: mainBranch.id,
        customerId: cust.id,
        guestName: cust.name,
        guestPhone: cust.phone,
        partySize: 4,
        dateTime: new Date(Date.now() + 2 * 86400000),
        noShowScore: 15,
        specialRequests: "Window seat preferred",
      },
    });
  }

  const integrations = ["swiggy", "zomato", "ondc", "whatsapp", "telegram", "google", "tally"];
  for (const provider of integrations) {
    await prisma.integration.create({
      data: {
        restaurantId: restaurant.id,
        provider,
        enabled: ["swiggy", "zomato", "whatsapp"].includes(provider),
        syncStatus: provider === "swiggy" ? "success" : "idle",
        lastSync: provider === "swiggy" ? new Date() : null,
      },
    });
  }

  const toggles = [
    { key: "dine_in", group: "Order Types", enabled: true },
    { key: "takeaway", group: "Order Types", enabled: true },
    { key: "qr_ordering", group: "Order Types", enabled: true },
    { key: "kds", group: "Kitchen", enabled: false },
    { key: "inventory_tracking", group: "Inventory", enabled: true },
    { key: "loyalty", group: "Customer", enabled: true },
    { key: "reservations", group: "Customer", enabled: false },
  ];

  for (const t of toggles) {
    await prisma.featureToggle.create({
      data: { restaurantId: restaurant.id, ...t },
    });
  }

  await prisma.refund.create({
    data: {
      orderId: (await prisma.order.findFirst())!.id,
      amount: 1200,
      reason: "Wrong item served",
      status: "completed",
      issuedBy: "Priya Sharma",
    },
  });

  await prisma.alert.createMany({
    data: [
      { locationId: mainBranch.id, type: "low_stock", title: "Low Stock", message: "Paneer (2.1kg remaining)", severity: "warning" },
      { locationId: mainBranch.id, type: "refund", title: "Refund Issued", message: "Refund ₹1,200 — Table 4 (Mgr)", severity: "info" },
      { locationId: mainBranch.id, type: "kds_delay", title: "KDS Delay", message: "3 tickets > 20 min", severity: "error" },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { userId: owner.id, category: "inventory", title: "Low Stock Alert", message: "Paneer below threshold at Main Branch", isRead: false },
      { userId: owner.id, category: "orders", title: "New Swiggy Order", message: "Order #ORD-0042 — ₹850", isRead: false },
      { userId: owner.id, category: "staff", title: "Shift Reminder", message: "Evening shift starts in 30 minutes", isRead: true },
      { userId: owner.id, category: "payments", title: "Refund Processed", message: "₹1,200 refunded for Table 4", isRead: false },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { actorName: "Priya Sharma", action: "update", resourceType: "menu_item", resourceId: "paneer-tikka", afterJson: '{"availability":"out_of_stock"}' },
      { actorName: "Rajesh Kumar", action: "create", resourceType: "role", resourceId: "manager", afterJson: '{"name":"Manager"}' },
      { actorName: "Priya Sharma", action: "refund", resourceType: "order", resourceId: "ORD-0001", afterJson: '{"amount":1200}' },
    ],
  });

  console.log("✅ Seed completed — Spice Garden restaurant ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
