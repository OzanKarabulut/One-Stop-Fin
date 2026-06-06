import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure default UserPref exists
  await prisma.userPref.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", favorites: [], theme: "light", sidebarState: {} },
  });
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
